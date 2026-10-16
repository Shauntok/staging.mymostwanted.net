create extension if not exists pgtap with schema extensions;

begin;

select plan(24);

select ok(
  (select pg_catalog.count(*) = 7
   from pg_catalog.pg_class as relation
   join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
   where namespace.nspname = 'private'
     and relation.relname in (
       'analytics_page_views_daily', 'analytics_page_view_rate_limits',
       'analytics_valid_read_settings', 'analytics_valid_read_dedup',
       'analytics_valid_read_hourly', 'analytics_valid_read_rate_limits',
       'analytics_valid_read_settings_audit'
     )
     and relation.relrowsecurity)
  and not has_table_privilege('anon', 'private.analytics_page_views_daily', 'SELECT')
  and not has_table_privilege('authenticated', 'private.analytics_valid_read_hourly', 'SELECT')
  and not has_table_privilege('service_role', 'private.analytics_valid_read_settings', 'SELECT'),
  'analytics tables use RLS and do not grant direct table access to client or service roles'
);

select ok(
  has_function_privilege('service_role', 'public.record_analytics_page_view(text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.record_analytics_page_view(text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.record_analytics_page_view(text,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.record_analytics_valid_read(uuid,text,text,integer,integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.record_analytics_valid_read(uuid,text,text,integer,integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.record_analytics_valid_read(uuid,text,text,integer,integer)', 'EXECUTE')
  and has_function_privilege('anon', 'public.public_hot_ranked_posts(integer,integer)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.public_hot_ranked_posts(integer,integer)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.public_hot_ranked_posts(integer,integer)', 'EXECUTE'),
  'write RPCs are server-only and the public ranking RPC exposes no event writer'
);

select is(
  (select pg_catalog.count(*)::integer
   from private.analytics_valid_read_settings
   where singleton and not collection_enabled and not hot_enabled and minimum_reads_24h = 100),
  1,
  'Valid Read and Hot are disabled by default at the database layer'
);

select is(public.record_analytics_page_view('submit', pg_catalog.repeat('a', 64)), false,
  'the legacy submission route is rejected by the active route allowlist');
select is(public.record_analytics_page_view('account', pg_catalog.repeat('a', 64)), false,
  'private account routes are rejected');
select is(public.record_analytics_page_view('home', 'not-a-digest'), false,
  'page-view writes reject malformed keyed digests');
select is(
  (select pg_catalog.count(*)::integer from private.analytics_page_views_daily where route_key = 'submit'),
  0,
  'rejected submission traffic does not create a daily aggregate'
);

select is(public.record_analytics_page_view('home', pg_catalog.repeat('a', 64)), true,
  'an allowlisted public route is accepted');
select is(
  (select page_views from private.analytics_page_views_daily
   where view_date = (pg_catalog.clock_timestamp() at time zone 'UTC')::date and route_key = 'home'),
  1::bigint,
  'the accepted route increments only its daily aggregate'
);
select is(public.record_analytics_page_view('home', pg_catalog.repeat('a', 64)), true,
  'a refresh remains a separate page view');
select is(
  (select page_views from private.analytics_page_views_daily
   where view_date = (pg_catalog.clock_timestamp() at time zone 'UTC')::date and route_key = 'home'),
  2::bigint,
  'refreshes are counted without visitor deduplication'
);

select is(
  (select pg_catalog.count(*)::integer
   from pg_catalog.generate_series(1, 61) as attempt(n)
   where public.record_analytics_page_view('latest', pg_catalog.repeat('b', 64))),
  60,
  'page-view writes enforce the 60-per-minute ceiling'
);
select is(
  (select page_views from private.analytics_page_views_daily
   where view_date = (pg_catalog.clock_timestamp() at time zone 'UTC')::date and route_key = 'latest'),
  60::bigint,
  'rate-limited requests do not increment route totals'
);
select ok(
  (select client_key_hash ~ '^[0-9a-f]{64}$'
   from private.analytics_page_view_rate_limits where client_key_hash = pg_catalog.repeat('b', 64))
  and not exists (
    select 1 from information_schema.columns
    where table_schema = 'private' and table_name = 'analytics_page_view_rate_limits'
      and column_name in ('ip_address', 'raw_ip', 'visitor_id', 'session_id')
  ),
  'rate limiting stores only a keyed digest and no raw address or analytics identity'
);

select is(public.record_analytics_valid_read(
  'ffffffff-ffff-4fff-8fff-ffffffffffff', pg_catalog.repeat('c', 64), pg_catalog.repeat('d', 64), 10, 50
), false, 'Valid Read refuses events while collection is disabled');
select is(
  (select pg_catalog.count(*)::integer from private.analytics_valid_read_dedup),
  0,
  'disabled Valid Read requests create no deduplication record'
);
select is(
  (select pg_catalog.count(*)::integer from public.public_hot_ranked_posts(8, 0)),
  0,
  'public Hot returns no ranking while its collection gates are disabled'
);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '83000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'analytics-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()
);
insert into public.profiles (id, username)
values ('83000000-0000-4000-8000-000000000001', 'analyticsowner');
insert into private.user_roles (user_id, role)
values ('83000000-0000-4000-8000-000000000001', 'owner');
insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values ('83000000-0000-4000-8000-000000000011', '83000000-0000-4000-8000-000000000001', pg_catalog.now(), pg_catalog.now(), 'aal2');
insert into private.staff_session_activity (session_id, started_at, last_activity_at)
values ('83000000-0000-4000-8000-000000000011', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp());
insert into private.analytics_page_views_daily (view_date, route_key, page_views)
values
  ((pg_catalog.clock_timestamp() at time zone 'UTC')::date, 'home', 4),
  ((pg_catalog.clock_timestamp() at time zone 'UTC')::date, 'submit', 99)
on conflict (view_date, route_key) do update
set page_views = excluded.page_views;

select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '83000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '83000000-0000-4000-8000-000000000011',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is((select pg_catalog.count(*)::integer from public.staff_analytics_daily_page_views(7)), 2,
  'recently verified staff can read public-route totals within an allowed window');
select is((select pg_catalog.count(*)::integer from public.staff_analytics_daily_page_views(7) where route_key = 'submit'), 0,
  'staff analytics hides historical submission aggregates');
select throws_ok($$select * from public.staff_analytics_daily_page_views(14)$$, 'P0001', null,
  'staff analytics rejects unsupported date windows');
select set_config('request.jwt.claims', '{"sub":"83000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"83000000-0000-4000-8000-000000000011","amr":[{"method":"mfa/totp","timestamp":1000}]}', true);
select throws_ok($$select * from public.staff_analytics_daily_page_views(7)$$, '42501', null,
  'stale TOTP cannot read analytics totals');
reset role;

insert into private.analytics_valid_read_dedup(post_id, visitor_post_hash, read_date, expires_at)
values ('ffffffff-ffff-4fff-8fff-ffffffffffff', pg_catalog.repeat('e', 64), (pg_catalog.now() at time zone 'UTC')::date, pg_catalog.now() - interval '1 second');
insert into private.analytics_valid_read_hourly(post_id, read_hour, valid_reads)
values ('ffffffff-ffff-4fff-8fff-ffffffffffff', pg_catalog.date_trunc('hour', pg_catalog.now()) - interval '31 days', 1);
insert into private.analytics_valid_read_rate_limits(client_key_hash, minute_bucket, minute_requests, hour_bucket, hour_requests, last_seen_at)
values (pg_catalog.repeat('f', 64), pg_catalog.now() - interval '49 hours', 1, pg_catalog.now() - interval '49 hours', 1, pg_catalog.now() - interval '49 hours');
insert into private.analytics_page_view_rate_limits(client_key_hash, minute_bucket, minute_requests, hour_bucket, hour_requests, last_seen_at)
values (pg_catalog.repeat('0', 64), pg_catalog.now() - interval '49 hours', 1, pg_catalog.now() - interval '49 hours', 1, pg_catalog.now() - interval '49 hours');
insert into private.analytics_page_views_daily(view_date, route_key, page_views)
values (((pg_catalog.now() at time zone 'UTC')::date - interval '14 months')::date, 'legal', 1);
select is(private.purge_expired_valid_read_data(), 5::bigint,
  'local cleanup removes expired dedup, hourly, rate-limit, and route-total records');
select is((select pg_catalog.count(*)::integer from private.analytics_valid_read_dedup), 0,
  'expired per-post deduplication material is removed');
select is((select pg_catalog.count(*)::integer from private.analytics_page_views_daily where route_key = 'legal'), 0,
  'daily route totals older than 13 months are removed');

select * from finish();
rollback;
