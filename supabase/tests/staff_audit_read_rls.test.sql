create extension if not exists pgtap with schema extensions;

begin;

select plan(11);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('9d000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'audit-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('9d000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'audit-admin@example.invalid', '', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('9d000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'audit-member@example.invalid', '', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

insert into public.profiles (id, username)
values
  ('9d000000-0000-4000-8000-000000000001', 'auditowner'),
  ('9d000000-0000-4000-8000-000000000002', 'auditadmin'),
  ('9d000000-0000-4000-8000-000000000003', 'auditmember');

insert into private.user_roles (user_id, role)
values
  ('9d000000-0000-4000-8000-000000000001', 'owner'),
  ('9d000000-0000-4000-8000-000000000002', 'admin');

insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values
  ('9d000000-0000-4000-8000-000000000011', '9d000000-0000-4000-8000-000000000001', pg_catalog.now(), pg_catalog.now(), 'aal2'),
  ('9d000000-0000-4000-8000-000000000012', '9d000000-0000-4000-8000-000000000002', pg_catalog.now(), pg_catalog.now(), 'aal2');

insert into private.staff_session_activity (session_id, started_at, last_activity_at)
values
  ('9d000000-0000-4000-8000-000000000011', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()),
  ('9d000000-0000-4000-8000-000000000012', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp());

insert into private.role_change_audit (actor_user_id, target_user_id, role, action, reason)
values ('9d000000-0000-4000-8000-000000000001', '9d000000-0000-4000-8000-000000000002', 'admin', 'granted', 'Synthetic RLS fixture');

insert into private.home_tag_settings_audit (
  actor_user_id, old_sort_mode, new_sort_mode, old_manual_tag_ids, new_manual_tag_ids, reason
)
values (
  '9d000000-0000-4000-8000-000000000001', 'smart_mix', 'manual', '{}'::uuid[], '{}'::uuid[], 'Synthetic RLS fixture'
);

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'private.role_change_audit'::regclass)
  and (select relrowsecurity from pg_catalog.pg_class where oid = 'private.home_tag_settings_audit'::regclass)
  and has_table_privilege('authenticated', 'private.role_change_audit', 'SELECT')
  and has_table_privilege('authenticated', 'private.home_tag_settings_audit', 'SELECT')
  and not has_table_privilege('anon', 'private.role_change_audit', 'SELECT')
  and not has_table_privilege('anon', 'private.home_tag_settings_audit', 'SELECT'),
  'Owner-readable audit tables enable RLS and grant reads only to authenticated for policy evaluation'
);
select ok(
  (select pg_catalog.pg_get_expr(polqual, polrelid) like '%has_staff_role%owner%'
   from pg_catalog.pg_policy where polrelid = 'private.role_change_audit'::regclass and polname = 'role_change_audit_owner_read')
  and (select pg_catalog.pg_get_expr(polqual, polrelid) like '%has_staff_role%owner%'
       from pg_catalog.pg_policy where polrelid = 'private.home_tag_settings_audit'::regclass and polname = 'home_tag_settings_audit_owner_read'),
  'both audit read policies restrict rows to active Owner authorization'
);
select ok(
  not has_table_privilege('authenticated', 'private.role_change_audit', 'INSERT,UPDATE,DELETE,TRUNCATE')
  and not has_table_privilege('authenticated', 'private.home_tag_settings_audit', 'INSERT,UPDATE,DELETE,TRUNCATE'),
  'authenticated has no direct audit mutation privileges'
);

select set_config('request.jwt.claim.sub', '9d000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '9d000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '9d000000-0000-4000-8000-000000000011',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is((select pg_catalog.count(*)::integer from private.role_change_audit), 1, 'Owner can read role-change audit rows');
select is((select pg_catalog.count(*)::integer from private.home_tag_settings_audit), 1, 'Owner can read home-tag settings audit rows');
reset role;

select set_config('request.jwt.claim.sub', '9d000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '9d000000-0000-4000-8000-000000000002', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '9d000000-0000-4000-8000-000000000012',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is((select pg_catalog.count(*)::integer from private.role_change_audit), 0, 'Admin cannot read Owner role-change audit rows');
select is((select pg_catalog.count(*)::integer from private.home_tag_settings_audit), 0, 'Admin cannot read Owner home-tag settings audit rows');
reset role;

select set_config('request.jwt.claim.sub', '9d000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"9d000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is((select pg_catalog.count(*)::integer from private.role_change_audit), 0, 'ordinary members cannot read role-change audit rows');
select is((select pg_catalog.count(*)::integer from private.home_tag_settings_audit), 0, 'ordinary members cannot read home-tag settings audit rows');
reset role;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$select * from private.role_change_audit$$, '42501', null, 'anon cannot read role-change audit table');
select throws_ok($$select * from private.home_tag_settings_audit$$, '42501', null, 'anon cannot read home-tag settings audit table');
reset role;

select * from finish();
rollback;
