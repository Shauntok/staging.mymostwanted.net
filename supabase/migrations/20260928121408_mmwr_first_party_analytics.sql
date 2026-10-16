-- Only irreversible daily aggregates are retained. Raw page events, URL paths,
-- query strings, account IDs, and raw client addresses are never stored here.
create table private.analytics_page_views_daily (
  view_date date not null,
  route_key text not null check (route_key in (
    'home', 'latest', 'hot', 'areas', 'tags', 'search', 'posts',
    'submit', 'vip', 'legal', 'other_public'
  )),
  page_views bigint not null default 0 check (page_views >= 0),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (view_date, route_key)
);

alter table private.analytics_page_views_daily enable row level security;
revoke all on table private.analytics_page_views_daily from public, anon, authenticated, service_role;

-- Short-lived keyed HMACs are used only to limit event submission abuse.
-- They expire after 48 hours and cannot be reversed to recover client addresses.
create table private.analytics_page_view_rate_limits (
  client_key_hash text primary key check (client_key_hash ~ '^[0-9a-f]{64}$'),
  minute_bucket timestamptz not null,
  minute_requests integer not null check (minute_requests between 0 and 61),
  hour_bucket timestamptz not null,
  hour_requests integer not null check (hour_requests between 0 and 1001),
  last_seen_at timestamptz not null
);

alter table private.analytics_page_view_rate_limits enable row level security;
revoke all on table private.analytics_page_view_rate_limits from public, anon, authenticated, service_role;
create index analytics_page_view_rate_limits_last_seen_idx
  on private.analytics_page_view_rate_limits (last_seen_at);

create or replace function public.record_analytics_page_view(
  p_route_key text,
  p_client_hash text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_minute_bucket timestamptz := pg_catalog.date_trunc('minute', v_now);
  v_hour_bucket timestamptz := pg_catalog.date_trunc('hour', v_now);
  v_view_date date := (v_now at time zone 'UTC')::date;
  v_minute_requests integer;
  v_hour_requests integer;
begin
  if p_route_key is null or p_route_key not in (
    'home', 'latest', 'hot', 'areas', 'tags', 'search', 'posts',
    'submit', 'vip', 'legal', 'other_public'
  ) or p_client_hash is null or p_client_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  delete from private.analytics_page_view_rate_limits as stale
  where stale.last_seen_at < v_now - interval '48 hours';

  insert into private.analytics_page_view_rate_limits as rate_limit (
    client_key_hash, minute_bucket, minute_requests,
    hour_bucket, hour_requests, last_seen_at
  ) values (
    p_client_hash, v_minute_bucket, 1,
    v_hour_bucket, 1, v_now
  )
  on conflict (client_key_hash) do update
  set minute_requests = case
        when rate_limit.minute_bucket = excluded.minute_bucket
          then least(rate_limit.minute_requests, 60) + 1
        else 1
      end,
      minute_bucket = excluded.minute_bucket,
      hour_requests = case
        when rate_limit.hour_bucket = excluded.hour_bucket
          then least(rate_limit.hour_requests, 1000) + 1
        else 1
      end,
      hour_bucket = excluded.hour_bucket,
      last_seen_at = excluded.last_seen_at
  returning minute_requests, hour_requests
  into v_minute_requests, v_hour_requests;

  if v_minute_requests > 60 or v_hour_requests > 1000 then
    return false;
  end if;

  insert into private.analytics_page_views_daily as daily (
    view_date, route_key, page_views
  ) values (
    v_view_date, p_route_key, 1
  )
  on conflict (view_date, route_key) do update
  set page_views = daily.page_views + 1,
      updated_at = excluded.updated_at;

  return true;
end
$function$;

revoke all on function public.record_analytics_page_view(text, text) from public, anon, authenticated, service_role;
grant execute on function public.record_analytics_page_view(text, text) to service_role;
