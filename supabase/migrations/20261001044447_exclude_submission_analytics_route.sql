-- The submission draft, submission status area, account, and report flows are
-- deliberately excluded from analytics. Keep the server RPC allowlist aligned
-- with the consent-gated browser routing and fail closed for legacy callers.
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
    'vip', 'legal', 'other_public'
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

-- Hide any historical submit aggregates from the staff reporting surface. This
-- intentionally does not delete existing aggregate rows.
create or replace function public.staff_analytics_daily_page_views(p_days integer default 30)
returns table (
  view_date date,
  route_key text,
  page_views bigint
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if p_days is null or p_days not in (7, 30, 90) then
    raise exception 'unsupported date range';
  end if;

  if (not private.has_staff_role('admin') and not private.has_staff_role('owner'))
    or not private.has_recent_totp() then
    raise exception 'Staff access and recent TOTP required' using errcode = '42501';
  end if;

  return query
  select daily.view_date, daily.route_key, daily.page_views
  from private.analytics_page_views_daily as daily
  where daily.route_key <> 'submit'
    and daily.view_date >= (pg_catalog.timezone('UTC', pg_catalog.clock_timestamp())::date - (p_days - 1))
    and daily.view_date <= pg_catalog.timezone('UTC', pg_catalog.clock_timestamp())::date
  order by daily.view_date desc, daily.route_key asc;
end;
$function$;
revoke all on function public.staff_analytics_daily_page_views(integer) from public, anon, service_role;
grant execute on function public.staff_analytics_daily_page_views(integer) to authenticated;
