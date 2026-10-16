-- Valid Reads are stored only as hourly post-level counts plus a short-lived
-- keyed deduplication token. No event-level analytics rows or raw IPs persist.
create table private.analytics_valid_read_settings (
  singleton boolean primary key default true check (singleton),
  collection_enabled boolean not null default false,
  hot_enabled boolean not null default false,
  minimum_reads_24h integer not null default 100 check (minimum_reads_24h between 1 and 100000),
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);
alter table private.analytics_valid_read_settings enable row level security;
revoke all on table private.analytics_valid_read_settings from public, anon, authenticated, service_role;
insert into private.analytics_valid_read_settings(singleton) values (true);

create table private.analytics_valid_read_dedup (
  post_id uuid not null,
  visitor_post_hash text not null check (visitor_post_hash ~ '^[0-9a-f]{64}$'),
  read_date date not null,
  expires_at timestamptz not null,
  primary key (post_id, visitor_post_hash, read_date)
);
alter table private.analytics_valid_read_dedup enable row level security;
revoke all on table private.analytics_valid_read_dedup from public, anon, authenticated, service_role;
create index analytics_valid_read_dedup_expiry_idx on private.analytics_valid_read_dedup(expires_at);

create table private.analytics_valid_read_hourly (
  post_id uuid not null,
  read_hour timestamptz not null,
  valid_reads bigint not null default 0 check (valid_reads >= 0),
  primary key (post_id, read_hour)
);
alter table private.analytics_valid_read_hourly enable row level security;
revoke all on table private.analytics_valid_read_hourly from public, anon, authenticated, service_role;
create index analytics_valid_read_hourly_expiry_idx on private.analytics_valid_read_hourly(read_hour);

create table private.analytics_valid_read_rate_limits (
  client_key_hash text primary key check (client_key_hash ~ '^[0-9a-f]{64}$'),
  minute_bucket timestamptz not null,
  minute_requests integer not null default 0,
  hour_bucket timestamptz not null,
  hour_requests integer not null default 0,
  last_seen_at timestamptz not null
);
alter table private.analytics_valid_read_rate_limits enable row level security;
revoke all on table private.analytics_valid_read_rate_limits from public, anon, authenticated, service_role;
create index analytics_valid_read_rate_limits_expiry_idx on private.analytics_valid_read_rate_limits(last_seen_at);

create function public.record_analytics_valid_read(
  p_post_id uuid,
  p_visitor_post_hash text,
  p_client_hash text,
  p_visible_seconds integer,
  p_scroll_percent integer
)
returns boolean
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_minute_bucket timestamptz := pg_catalog.date_trunc('minute', v_now);
  v_hour_bucket timestamptz := pg_catalog.date_trunc('hour', v_now);
  v_minute_requests integer;
  v_hour_requests integer;
begin
  if p_post_id is null or p_visitor_post_hash is null or p_visitor_post_hash !~ '^[0-9a-f]{64}$'
    or p_client_hash is null or p_client_hash !~ '^[0-9a-f]{64}$'
    or p_visible_seconds not between 10 and 3600 or p_scroll_percent not between 50 and 100 then
    return false;
  end if;
  if not exists (
    select 1 from private.analytics_valid_read_settings as setting
    where setting.singleton and setting.collection_enabled
  ) then return false; end if;
  if not exists (
    select 1 from private.posts as post_row
    join private.areas as area on area.id = post_row.area_id and area.is_active
    join public.published_previews as preview on preview.post_id = post_row.id
    where post_row.id = p_post_id and post_row.status = 'published'
  ) then return false; end if;

  delete from private.analytics_valid_read_dedup where expires_at <= v_now;
  delete from private.analytics_valid_read_rate_limits where last_seen_at < v_now - interval '48 hours';
  insert into private.analytics_valid_read_rate_limits as rate_limit(
    client_key_hash,minute_bucket,minute_requests,hour_bucket,hour_requests,last_seen_at
  ) values (p_client_hash,v_minute_bucket,1,v_hour_bucket,1,v_now)
  on conflict(client_key_hash) do update set
    minute_requests=case when rate_limit.minute_bucket=excluded.minute_bucket then least(rate_limit.minute_requests,10)+1 else 1 end,
    minute_bucket=excluded.minute_bucket,
    hour_requests=case when rate_limit.hour_bucket=excluded.hour_bucket then least(rate_limit.hour_requests,100)+1 else 1 end,
    hour_bucket=excluded.hour_bucket,
    last_seen_at=excluded.last_seen_at
  returning minute_requests,hour_requests into v_minute_requests,v_hour_requests;
  if v_minute_requests > 10 or v_hour_requests > 100 then return false; end if;

  insert into private.analytics_valid_read_dedup(post_id,visitor_post_hash,read_date,expires_at)
  values(p_post_id,p_visitor_post_hash,(v_now at time zone 'UTC')::date,v_now+interval '48 hours')
  on conflict do nothing;
  if not found then return false; end if;

  insert into private.analytics_valid_read_hourly as hourly(post_id,read_hour,valid_reads)
  values(p_post_id,v_hour_bucket,1)
  on conflict(post_id,read_hour) do update set valid_reads=hourly.valid_reads+1;
  return true;
end
$function$;
revoke all on function public.record_analytics_valid_read(uuid,text,text,integer,integer) from public, anon, authenticated, service_role;
grant execute on function public.record_analytics_valid_read(uuid,text,text,integer,integer) to service_role;

create function public.public_hot_ranked_posts(p_limit integer default 8)
returns table(post_id uuid,valid_reads_24h bigint,hot_score numeric)
language plpgsql volatile security definer set search_path = ''
as $function$
declare v_now timestamptz := pg_catalog.clock_timestamp(); v_minimum integer;
begin
  if p_limit is null or p_limit not between 1 and 8 then raise exception 'unsupported result limit'; end if;
  select setting.minimum_reads_24h into v_minimum from private.analytics_valid_read_settings as setting
  where setting.singleton and setting.hot_enabled and setting.collection_enabled;
  if not found then return; end if;
  return query
  with reads as (
    select hourly.post_id,
      pg_catalog.sum(hourly.valid_reads) filter (where hourly.read_hour >= v_now-interval '1 hour')::bigint as reads_1h,
      pg_catalog.sum(hourly.valid_reads) filter (where hourly.read_hour >= v_now-interval '6 hours')::bigint as reads_6h,
      pg_catalog.sum(hourly.valid_reads)::bigint as reads_24h
    from private.analytics_valid_read_hourly as hourly
    join private.posts as post_row on post_row.id=hourly.post_id and post_row.status='published'
    join private.areas as area on area.id=post_row.area_id and area.is_active
    join public.published_previews as preview on preview.post_id=post_row.id
    where hourly.read_hour > v_now-interval '24 hours' and hourly.read_hour <= v_now
    group by hourly.post_id
    having pg_catalog.sum(hourly.valid_reads) >= v_minimum
  )
  select reads.post_id,reads.reads_24h,
    (3*coalesce(reads.reads_1h,0)+2*coalesce(reads.reads_6h,0)+reads.reads_24h)::numeric
  from reads
  join private.posts as post_row on post_row.id=reads.post_id and post_row.status='published'
  order by 3 desc,post_row.last_published_at desc nulls last,reads.post_id asc
  limit p_limit;
end
$function$;
revoke all on function public.public_hot_ranked_posts(integer) from public, anon, authenticated, service_role;
grant execute on function public.public_hot_ranked_posts(integer) to anon, authenticated;

create function private.purge_expired_valid_read_data()
returns bigint language plpgsql volatile security definer set search_path = ''
as $function$
declare v_deleted bigint := 0; v_rows bigint;
begin
  delete from private.analytics_valid_read_dedup where expires_at <= pg_catalog.clock_timestamp();
  get diagnostics v_rows = row_count; v_deleted := v_deleted + v_rows;
  delete from private.analytics_valid_read_hourly where read_hour < pg_catalog.date_trunc('hour',pg_catalog.clock_timestamp())-interval '30 days';
  get diagnostics v_rows = row_count; v_deleted := v_deleted + v_rows;
  delete from private.analytics_valid_read_rate_limits where last_seen_at < pg_catalog.clock_timestamp()-interval '48 hours';
  get diagnostics v_rows = row_count; v_deleted := v_deleted + v_rows;
  delete from private.analytics_page_views_daily
  where view_date < (pg_catalog.timezone('UTC',pg_catalog.clock_timestamp())-interval '13 months')::date;
  get diagnostics v_rows = row_count; v_deleted := v_deleted + v_rows;
  return v_deleted;
end
$function$;
revoke all on function private.purge_expired_valid_read_data() from public, anon, authenticated, service_role;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
select cron.schedule('purge-expired-valid-read-data','31 3 * * *','select private.purge_expired_valid_read_data();');
