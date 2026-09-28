create extension if not exists pgtap with schema extensions;

begin;

select plan(20);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'identity-one@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{"role":"owner","username":"spoofed"}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'identity-two@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

insert into private.user_roles (user_id, role)
values ('10000000-0000-4000-8000-000000000001', 'owner');

insert into private.recovery_code_hashes (user_id, code_hash)
values (
  '10000000-0000-4000-8000-000000000001',
  decode(repeat('ab', 32), 'hex')
);

select ok(
  (select count(*) = 2 from public.profiles),
  'Auth user insertion creates profile rows'
);
select ok(
  (select username is null and display_name is null
   from public.profiles where id = '10000000-0000-4000-8000-000000000001'),
  'profile trigger does not copy email or user metadata'
);
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
  and not has_table_privilege('authenticated', 'private.security_events', 'SELECT')
  and not has_table_privilege('authenticated', 'private.recovery_code_hashes', 'SELECT'),
  'private role, security, and recovery records have no client table grants'
);
select ok(
  not has_function_privilege('anon', 'private.has_staff_role(text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'private.has_staff_role(text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'private.has_staff_role(text)', 'EXECUTE'),
  'staff helper is executable only by authenticated clients'
);
select ok(
  not has_function_privilege('anon', 'private.consume_recovery_code(bytea)', 'EXECUTE')
  and not has_function_privilege('service_role', 'private.consume_recovery_code(bytea)', 'EXECUTE')
  and has_function_privilege('authenticated', 'private.consume_recovery_code(bytea)', 'EXECUTE'),
  'recovery helper is executable only by authenticated clients'
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

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.profiles), 1, 'user sees only their profile');
select is(private.has_staff_role('owner'), false, 'AAL1 does not satisfy staff authorization');
select throws_ok(
  $$update public.profiles set username = 'changed_name' where id = '10000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'user cannot directly change username'
);
select throws_ok(
  $$update public.profiles set account_state = 'banned' where id = '10000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'user cannot change account state'
);
select throws_ok(
  $$insert into public.profiles (id) values ('10000000-0000-4000-8000-000000000003')$$,
  '42501', null, 'user cannot self-insert a profile'
);
select is(private.consume_recovery_code(decode(repeat('ab', 32), 'hex')), true, 'valid recovery hash is consumed once');
select is(private.consume_recovery_code(decode(repeat('ab', 32), 'hex')), false, 'replayed recovery hash fails');
reset role;

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
reset role;

select * from finish();
rollback;
