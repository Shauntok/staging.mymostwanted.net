create extension if not exists pgtap with schema extensions;

begin;

select plan(27);

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

insert into private.recovery_code_hashes (user_id, code_hash)
values (
  '10000000-0000-4000-8000-000000000001',
  decode(repeat('ab', 32), 'hex')
);

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
  and not has_table_privilege('authenticated', 'private.security_events', 'DELETE')
  and not has_table_privilege('authenticated', 'private.recovery_code_hashes', 'SELECT')
  and not has_table_privilege('authenticated', 'private.recovery_code_hashes', 'INSERT')
  and not has_table_privilege('authenticated', 'private.recovery_code_hashes', 'UPDATE')
  and not has_table_privilege('authenticated', 'private.recovery_code_hashes', 'DELETE'),
  'authenticated has no direct DML grants on private role, event, or recovery tables'
);
select ok(
  not has_function_privilege('anon', 'private.has_staff_role(text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'private.has_staff_role(text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'private.has_staff_role(text)', 'EXECUTE'),
  'staff policy helper has only its authenticated execute grant'
);
select ok(
  not has_function_privilege('anon', 'private.consume_recovery_code(bytea)', 'EXECUTE')
  and not has_function_privilege('service_role', 'private.consume_recovery_code(bytea)', 'EXECUTE')
  and has_function_privilege('authenticated', 'private.consume_recovery_code(bytea)', 'EXECUTE'),
  'private recovery helper is callable only through the authenticated boundary'
);
select ok(
  not has_function_privilege('anon', 'public.redeem_recovery_code(bytea)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.redeem_recovery_code(bytea)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.redeem_recovery_code(bytea)', 'EXECUTE'),
  'exposed public recovery RPC is executable only by authenticated users'
);
select ok(
  (select c.relrowsecurity from pg_catalog.pg_class as c
   where c.oid = 'private.username_history'::regclass)
  and (select c.relrowsecurity from pg_catalog.pg_class as c
   where c.oid = 'private.user_roles'::regclass)
  and (select c.relrowsecurity from pg_catalog.pg_class as c
   where c.oid = 'private.recovery_code_hashes'::regclass)
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
select is(
  (with updated as (
    update public.profiles set display_name = 'Updated Name'
    where id = '10000000-0000-4000-8000-000000000001'
    returning display_name
  ) select pg_catalog.max(display_name) from updated),
  'Updated Name', 'user can update their own display name'
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
select is(public.redeem_recovery_code(decode(repeat('ab', 32), 'hex')), true, 'valid recovery hash is consumed once through the public RPC');
select is(public.redeem_recovery_code(decode(repeat('ab', 32), 'hex')), false, 'sequential recovery-code replay fails through the public RPC');
select is(private.has_staff_role('owner'), false, 'AAL1 does not satisfy staff authorization');
reset role;

select is(
  (select count(*)::integer from private.security_events where event_type = 'recovery_code_redeemed'),
  2, 'recovery success and replay are recorded without exposing the hash'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is(private.has_staff_role('owner'), true, 'matching database owner role passes at AAL2');
select is(private.has_staff_role('admin'), false, 'AAL2 does not grant a database role the user lacks');
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is(private.has_staff_role('owner'), false, 'another user cannot inherit the owner role');
select is((select count(*)::integer from public.profiles), 1, 'second user sees only their own profile');
select is(
  (with changed as (
    update public.profiles set display_name = 'Tampered Name'
    where id = '10000000-0000-4000-8000-000000000001'
    returning id
  ) select pg_catalog.count(*)::integer from changed),
  0, 'second user cannot update the first user profile'
);
reset role;

insert into private.username_history (user_id, username)
values ('10000000-0000-4000-8000-000000000001', 'Former Name');
select throws_ok(
  $$delete from auth.users where id = '10000000-0000-4000-8000-000000000001'$$,
  '23503', null, 'Auth deletion is blocked while username history requires policy cleanup'
);

select * from finish();
rollback;
