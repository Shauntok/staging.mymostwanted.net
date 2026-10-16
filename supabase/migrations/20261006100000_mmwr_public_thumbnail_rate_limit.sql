-- Public derivative responses perform a database lookup and a private Storage read.
-- Persist only a keyed client hash; never store the proxy address itself.
create table private.public_thumbnail_rate_limits (
  client_key_hash text primary key
    check (client_key_hash ~ '^[0-9a-f]{64}$'),
  minute_bucket timestamptz not null,
  minute_requests integer not null check (minute_requests between 0 and 181),
  hour_bucket timestamptz not null,
  hour_requests integer not null check (hour_requests between 0 and 3001),
  last_seen_at timestamptz not null
);

alter table private.public_thumbnail_rate_limits enable row level security;
revoke all on table private.public_thumbnail_rate_limits from public, anon, authenticated, service_role;
create index public_thumbnail_rate_limits_last_seen_idx
  on private.public_thumbnail_rate_limits (last_seen_at);

create function public.check_public_thumbnail_rate_limit(p_client_hash text)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_minute_bucket timestamptz := pg_catalog.date_trunc('minute', v_now);
  v_hour_bucket timestamptz := pg_catalog.date_trunc('hour', v_now);
  v_minute_requests integer;
  v_hour_requests integer;
begin
  if p_client_hash is null or p_client_hash !~ '^[0-9a-f]{64}$' then
    return query select false, 3600;
    return;
  end if;

  delete from private.public_thumbnail_rate_limits as stale
  where stale.last_seen_at < v_now - interval '48 hours';

  insert into private.public_thumbnail_rate_limits as rate_limit (
    client_key_hash, minute_bucket, minute_requests,
    hour_bucket, hour_requests, last_seen_at
  ) values (
    p_client_hash, v_minute_bucket, 1,
    v_hour_bucket, 1, v_now
  )
  on conflict (client_key_hash) do update
  set minute_requests = case
        when rate_limit.minute_bucket = excluded.minute_bucket
          then least(rate_limit.minute_requests, 180) + 1
        else 1
      end,
      minute_bucket = excluded.minute_bucket,
      hour_requests = case
        when rate_limit.hour_bucket = excluded.hour_bucket
          then least(rate_limit.hour_requests, 3000) + 1
        else 1
      end,
      hour_bucket = excluded.hour_bucket,
      last_seen_at = excluded.last_seen_at
  returning minute_requests, hour_requests
  into v_minute_requests, v_hour_requests;

  if v_hour_requests > 3000 then
    return query select false,
      greatest(1, pg_catalog.ceil(pg_catalog.date_part('epoch', (v_hour_bucket + interval '1 hour' - v_now)))::integer);
  elsif v_minute_requests > 180 then
    return query select false,
      greatest(1, pg_catalog.ceil(pg_catalog.date_part('epoch', (v_minute_bucket + interval '1 minute' - v_now)))::integer);
  else
    return query select true, 0;
  end if;
end
$function$;

revoke all on function public.check_public_thumbnail_rate_limit(text) from public, anon, authenticated, service_role;
grant execute on function public.check_public_thumbnail_rate_limit(text) to service_role;
