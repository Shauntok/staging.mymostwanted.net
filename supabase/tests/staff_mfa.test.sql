create extension if not exists pgtap with schema extensions;

begin;

select plan(9);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('81000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'staff@example.invalid', '', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('81000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'member@example.invalid', '', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

insert into public.profiles (id, username)
values
  ('81000000-0000-4000-8000-000000000001', 'stafffixture'),
  ('81000000-0000-4000-8000-000000000002', 'memberfixture');

insert into private.user_roles (user_id, role)
values ('81000000-0000-4000-8000-000000000001', 'owner');

insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values ('81000000-0000-4000-8000-000000000011', '81000000-0000-4000-8000-000000000001', pg_catalog.now(), pg_catalog.now(), 'aal2');
insert into private.staff_session_activity (session_id, started_at, last_activity_at)
values ('81000000-0000-4000-8000-000000000011', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp());

select ok(
  has_function_privilege('authenticated', 'public.has_staff_identity()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.has_staff_identity()', 'EXECUTE')
  and not has_function_privilege('anon', 'private.has_staff_identity()', 'EXECUTE'),
  'staff discovery is restricted to the authenticated caller and is not public'
);
select ok(
  has_function_privilege('authenticated', 'private.has_staff_role(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.has_staff_role(text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'private.has_staff_role(text)', 'EXECUTE'),
  'staff authorization helper is callable only by authenticated sessions'
);

select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is(public.has_staff_identity(), true, 'AAL1 can discover that the caller must complete staff MFA');
select is(private.has_staff_role('owner'), false, 'AAL1 cannot access staff authorization');
reset role;

select set_config('request.jwt.claims', '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","amr":[{"method":"mfa/recovery_code","timestamp":1000}]}', true);
set local role authenticated;
select is(private.has_staff_role('owner'), false, 'recovery-code AAL2 can recover the factor but cannot authorize staff data');
reset role;

select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '81000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '81000000-0000-4000-8000-000000000011',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is(private.has_staff_role('owner'), true, 'database-assigned Owner passes the AAL2 staff gate');
select is(private.has_staff_role('admin'), false, 'AAL2 does not create an unassigned staff role');
reset role;

select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2","amr":[{"method":"mfa/totp","timestamp":1000}]}', true);
set local role authenticated;
select is(public.has_staff_identity(), false, 'ordinary member is not identified as staff');
select is(private.has_staff_role('owner'), false, 'ordinary member cannot inherit the Owner role');
reset role;

select * from finish();
rollback;
