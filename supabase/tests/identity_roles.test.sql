create extension if not exists pgtap with schema extensions;

begin;

select plan(24);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'identity-one@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{"role":"owner","username":"spoofed"}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'identity-two@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

insert into public.profiles (id, username, display_name)
values ('10000000-0000-4000-8000-000000000001', 'Owner One!', 'First User');

insert into private.user_roles (user_id, role)
values ('10000000-0000-4000-8000-000000000001', 'owner');

insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values ('91000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', pg_catalog.now(), pg_catalog.now(), 'aal2');
insert into private.staff_session_activity (session_id, started_at, last_activity_at)
values ('91000000-0000-4000-8000-000000000001', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp());

select is((select count(*)::integer from public.profiles), 1, 'Auth insertion alone does not create an active profile');
select ok(
  not exists (
    select 1 from private.user_roles
    where user_id = '10000000-0000-4000-8000-000000000002'
  ),
  'user editable Auth metadata never creates a database role'
);
select ok(
  not has_table_privilege('anon', 'public.profiles', 'SELECT'),
  'anon has no profile table grant'
);
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.profiles', 'username', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.profiles', 'account_state', 'UPDATE'),
  'authenticated can update only the editable display field'
);
select ok(
  not has_table_privilege('authenticated', 'private.user_roles', 'SELECT')
  and not has_table_privilege('authenticated', 'private.user_roles', 'INSERT')
  and not has_table_privilege('authenticated', 'private.user_roles', 'UPDATE')
  and not has_table_privilege('authenticated', 'private.user_roles', 'DELETE')
  and not has_table_privilege('authenticated', 'private.security_events', 'SELECT')
  and not has_table_privilege('authenticated', 'private.security_events', 'INSERT')
  and not has_table_privilege('authenticated', 'private.security_events', 'UPDATE')
  and not has_table_privilege('authenticated', 'private.security_events', 'DELETE'),
  'authenticated has no direct DML grants on private role or event tables'
);
select ok(
  not has_function_privilege('anon', 'private.has_staff_role(text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'private.has_staff_role(text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'private.has_staff_role(text)', 'EXECUTE'),
  'staff policy helper has only its authenticated execute grant'
);
select ok(
  (select c.relrowsecurity from pg_catalog.pg_class as c
   where c.oid = 'private.username_history'::regclass)
  and (select c.relrowsecurity from pg_catalog.pg_class as c
   where c.oid = 'private.user_roles'::regclass)
  and (select c.relrowsecurity from pg_catalog.pg_class as c
   where c.oid = 'private.security_events'::regclass),
  'all private identity tables have RLS enabled'
);
select throws_ok(
  $$insert into public.profiles (id, username) values ('10000000-0000-4000-8000-000000000002', null)$$,
  '23502', null, 'completed profiles require a username'
);
select throws_ok(
  $$insert into public.profiles (id, username) values ('10000000-0000-4000-8000-000000000002', '   ')$$,
  '23514', null, 'profile usernames cannot be blank'
);
select throws_ok(
  $$insert into public.profiles (id, username) values ('10000000-0000-4000-8000-000000000002', ' owner one! ')$$,
  '23505', null, 'username uniqueness ignores case and surrounding whitespace'
);

insert into public.profiles (id, username, display_name)
values ('10000000-0000-4000-8000-000000000002', 'User Two?', 'Second User');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.profiles), 1, 'user sees only their profile');
select lives_ok(
  $$update public.profiles set display_name = 'Updated Name' where id = '10000000-0000-4000-8000-000000000001'$$,
  'user can update their own display name'
);
select is(
  (select profile.display_name from public.profiles as profile where profile.id = '10000000-0000-4000-8000-000000000001'),
  'Updated Name', 'own display name change is persisted'
);
select throws_ok(
  $$update public.profiles set username = 'changed username' where id = '10000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'user cannot directly change username'
);
select throws_ok(
  $$update public.profiles set account_state = 'banned' where id = '10000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'user cannot change account state'
);
select throws_ok(
  $$insert into public.profiles (id, username) values ('10000000-0000-4000-8000-000000000003', 'new user')$$,
  '42501', null, 'user cannot self-insert a profile'
);
select is(private.has_staff_role('owner'), false, 'AAL1 does not satisfy staff authorization');
reset role;

select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '10000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '91000000-0000-4000-8000-000000000001',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is(private.has_staff_role('owner'), true, 'matching database owner role passes at AAL2');
select is(private.has_staff_role('admin'), false, 'AAL2 does not grant a database role the user lacks');
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2","amr":[{"method":"mfa/totp","timestamp":1000}]}', true);
set local role authenticated;
select is(private.has_staff_role('owner'), false, 'another user cannot inherit the owner role');
select is((select count(*)::integer from public.profiles), 1, 'second user sees only their own profile');
select lives_ok(
  $$update public.profiles set display_name = 'Tampered Name' where id = '10000000-0000-4000-8000-000000000001'$$,
  'another user update is filtered by row-level security'
);
reset role;
select is(
  (select profile.display_name from public.profiles as profile where profile.id = '10000000-0000-4000-8000-000000000001'),
  'Updated Name', 'another user cannot change the first user profile'
);

insert into private.username_history (user_id, username)
values ('10000000-0000-4000-8000-000000000001', 'Former Name');
delete from auth.users where id = '10000000-0000-4000-8000-000000000001';
select is(
  (select pg_catalog.count(*)::integer from private.username_history
   where user_id = '10000000-0000-4000-8000-000000000001'),
  0, 'Auth deletion removes the account historical usernames under the approved deletion policy'
);

select * from finish();
rollback;
