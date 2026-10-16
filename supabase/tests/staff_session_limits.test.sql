create extension if not exists pgtap with schema extensions;

begin;

select plan(18);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('9e000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'session-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('9e000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'session-admin@example.invalid', '', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('9e000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'session-member@example.invalid', '', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

insert into public.profiles (id, username)
values
  ('9e000000-0000-4000-8000-000000000001', 'sessionowner'),
  ('9e000000-0000-4000-8000-000000000002', 'sessionadmin'),
  ('9e000000-0000-4000-8000-000000000003', 'sessionmember');

insert into private.user_roles (user_id, role)
values
  ('9e000000-0000-4000-8000-000000000001', 'owner'),
  ('9e000000-0000-4000-8000-000000000002', 'admin');

insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values
  ('9e000000-0000-4000-8000-000000000011', '9e000000-0000-4000-8000-000000000001', pg_catalog.now(), pg_catalog.now(), 'aal2'),
  ('9e000000-0000-4000-8000-000000000012', '9e000000-0000-4000-8000-000000000002', pg_catalog.now(), pg_catalog.now(), 'aal2'),
  ('9e000000-0000-4000-8000-000000000013', '9e000000-0000-4000-8000-000000000003', pg_catalog.now(), pg_catalog.now(), 'aal2');

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'private.staff_session_activity'::regclass)
  and not has_table_privilege('anon', 'private.staff_session_activity', 'SELECT')
  and not has_table_privilege('authenticated', 'private.staff_session_activity', 'SELECT')
  and has_function_privilege('service_role', 'public.mmwr_touch_staff_session(uuid,uuid,boolean)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.mmwr_touch_staff_session(uuid,uuid,boolean)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.mmwr_touch_staff_session(uuid,uuid,boolean)', 'EXECUTE'),
  'staff lease storage is private and the activity RPC is service-role only'
);

set local role service_role;
select set_config('test.staff_touch_result', public.mmwr_touch_staff_session('9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000011', false), true);
reset role;
select is(current_setting('test.staff_touch_result'), 'not_staff', 'a session without the verified AAL2/TOTP assertion cannot start a staff lease');
select is((select pg_catalog.count(*)::integer from private.staff_session_activity), 0, 'rejected first access creates no lease');

set local role service_role;
select set_config('test.staff_touch_result', public.mmwr_touch_staff_session('9e000000-0000-4000-8000-000000000003', '9e000000-0000-4000-8000-000000000013', true), true);
reset role;
select is(current_setting('test.staff_touch_result'), 'not_staff', 'an ordinary member cannot start a staff lease');
select is((select pg_catalog.count(*)::integer from private.staff_session_activity), 0, 'ordinary member creates no staff lease');

set local role service_role;
select set_config('test.staff_touch_result', public.mmwr_touch_staff_session('9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000011', true), true);
reset role;
select is(current_setting('test.staff_touch_result'), 'started', 'eligible Owner first access starts a staff lease');

select set_config('request.jwt.claim.sub', '9e000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '9e000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '9e000000-0000-4000-8000-000000000011',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is(private.has_staff_role('owner'), true, 'Owner authorization succeeds while the exact lease is active');
reset role;

select set_config('test.staff_previous_activity', (select last_activity_at::text from private.staff_session_activity where session_id = '9e000000-0000-4000-8000-000000000011'), true);
set local role service_role;
select set_config('test.staff_touch_result', public.mmwr_touch_staff_session('9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000011', true), true);
reset role;
select is(current_setting('test.staff_touch_result'), 'active', 'valid foreground activity renews the active lease');
select ok((select last_activity_at > current_setting('test.staff_previous_activity')::timestamptz from private.staff_session_activity where session_id = '9e000000-0000-4000-8000-000000000011'), 'valid activity advances last_activity_at');

update private.staff_session_activity
set started_at = pg_catalog.clock_timestamp() - interval '16 minutes',
    last_activity_at = pg_catalog.clock_timestamp() - interval '15 minutes 1 second'
where session_id = '9e000000-0000-4000-8000-000000000011';
select set_config('test.staff_expired_activity', (select last_activity_at::text from private.staff_session_activity where session_id = '9e000000-0000-4000-8000-000000000011'), true);
set local role service_role;
select set_config('test.staff_touch_result', public.mmwr_touch_staff_session('9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000011', true), true);
reset role;
select is(current_setting('test.staff_touch_result'), 'expired', 'idle lease beyond 15 minutes expires');
select ok((select last_activity_at = current_setting('test.staff_expired_activity')::timestamptz from private.staff_session_activity where session_id = '9e000000-0000-4000-8000-000000000011'), 'expired idle activity cannot revive or advance the lease');
set local role authenticated;
select is(private.has_staff_role('owner'), false, 'expired idle lease denies staff database authorization');
reset role;

set local role service_role;
select set_config('test.staff_touch_result', public.mmwr_touch_staff_session('9e000000-0000-4000-8000-000000000002', '9e000000-0000-4000-8000-000000000012', true), true);
reset role;
select is(current_setting('test.staff_touch_result'), 'started', 'eligible Admin receives an independent lease');
update private.staff_session_activity
set started_at = pg_catalog.clock_timestamp() - interval '9 hours',
    last_activity_at = pg_catalog.clock_timestamp()
where session_id = '9e000000-0000-4000-8000-000000000012';
set local role service_role;
select set_config('test.staff_touch_result', public.mmwr_touch_staff_session('9e000000-0000-4000-8000-000000000002', '9e000000-0000-4000-8000-000000000012', true), true);
reset role;
select is(current_setting('test.staff_touch_result'), 'expired', 'eight-hour absolute lease expires despite recent activity');
set local role service_role;
select set_config('test.staff_touch_result', public.mmwr_touch_staff_session('9e000000-0000-4000-8000-000000000002', '9e000000-0000-4000-8000-000000000012', true), true);
reset role;
select is(current_setting('test.staff_touch_result'), 'expired', 'repeated heartbeat cannot restart an expired absolute lease');
select set_config('request.jwt.claim.sub', '9e000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '9e000000-0000-4000-8000-000000000002', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '9e000000-0000-4000-8000-000000000012',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is(private.has_staff_role('admin'), false, 'expired absolute lease denies staff database authorization');
reset role;

set local role service_role;
select set_config('test.staff_touch_result', public.mmwr_touch_staff_session('9e000000-0000-4000-8000-000000000003', '9e000000-0000-4000-8000-000000000011', true), true);
reset role;
select is(current_setting('test.staff_touch_result'), 'expired', 'a different user cannot touch another account session');

delete from auth.sessions where id = '9e000000-0000-4000-8000-000000000012';
select is((select pg_catalog.count(*)::integer from private.staff_session_activity where session_id = '9e000000-0000-4000-8000-000000000012'), 0, 'lease row cascades away with its Auth session');

select * from finish();
rollback;
