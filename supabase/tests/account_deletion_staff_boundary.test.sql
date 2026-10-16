create extension if not exists pgtap with schema extensions;

begin;

select plan(30);

-- These fixtures and all enabled flags disappear at the final rollback.
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  ('85000000-0000-4000-8000-' || pg_catalog.lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated',
  'deletion-staff-boundary-' || n::text || '@example.invalid', '', pg_catalog.now(),
  '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()
from pg_catalog.generate_series(1, 11) as fixture(n);

insert into public.profiles (id, username)
select
  ('85000000-0000-4000-8000-' || pg_catalog.lpad(n::text, 12, '0'))::uuid,
  'deletionstaffboundary' || n::text
from pg_catalog.generate_series(1, 11) as fixture(n);

insert into private.user_roles (user_id, role)
values
  ('85000000-0000-4000-8000-000000000001', 'owner'),
  ('85000000-0000-4000-8000-000000000003', 'admin'),
  ('85000000-0000-4000-8000-000000000004', 'admin'),
  ('85000000-0000-4000-8000-000000000005', 'owner');

insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values
  ('85000000-0000-4000-8000-000000000101', '85000000-0000-4000-8000-000000000001', pg_catalog.now(), pg_catalog.now(), 'aal2'),
  ('85000000-0000-4000-8000-000000000103', '85000000-0000-4000-8000-000000000003', pg_catalog.now(), pg_catalog.now(), 'aal2');

insert into private.staff_session_activity (session_id, started_at, last_activity_at)
values
  ('85000000-0000-4000-8000-000000000101', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()),
  ('85000000-0000-4000-8000-000000000103', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp());

select ok(
  has_function_privilege('authenticated', 'public.change_staff_role(uuid,text,boolean,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'private.change_staff_role(uuid,text,boolean,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.change_staff_role(uuid,text,boolean,text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'private.change_staff_role(uuid,text,boolean,text)', 'EXECUTE'),
  'staff role assignment keeps its authenticated-only RPC grants'
);
select ok(
  has_function_privilege('service_role', 'public.begin_account_deletion_auth_attempt(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.begin_account_deletion_auth_attempt(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.begin_account_deletion_auth_attempt(uuid)', 'EXECUTE'),
  'the final Auth deletion checkpoint remains service-only'
);
select is((select enabled from private.runtime_flags where flag = 'account_deletion'), false, 'deletion requests default off');
select is((select enabled from private.runtime_flags where flag = 'account_deletion_cleanup'), false, 'irreversible cleanup defaults off');

select set_config('request.jwt.claim.sub', '85000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '85000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '85000000-0000-4000-8000-000000000101',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is(public.change_staff_role('85000000-0000-4000-8000-000000000002', 'admin', true, '  Boundary grant  '), true, 'recent-TOTP Owner can grant a role to an active target');
reset role;
select ok(
  exists (
    select 1 from private.user_roles
    where user_id = '85000000-0000-4000-8000-000000000002'
      and role = 'admin' and granted_by = '85000000-0000-4000-8000-000000000001'
  ),
  'the role grant retains its assigning Owner'
);
select is(
  (select pg_catalog.count(*)::integer from private.role_change_audit
   where target_user_id = '85000000-0000-4000-8000-000000000002'
     and action = 'granted' and reason = 'Boundary grant'),
  1, 'a successful role grant appends its trimmed reason once'
);
set local role authenticated;
select is(public.change_staff_role('85000000-0000-4000-8000-000000000002', 'admin', true, 'Duplicate grant'), false, 'an unchanged role grant remains a no-op');
reset role;
select is(
  (select pg_catalog.count(*)::integer from private.role_change_audit
   where target_user_id = '85000000-0000-4000-8000-000000000002'),
  1, 'an unchanged role grant writes no audit event'
);

update private.runtime_flags set enabled = true where flag = 'account_deletion';
select set_config('request.jwt.claim.sub', '85000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"85000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is(public.request_my_account_deletion(), false, 'a role assigned first excludes the target from ordinary deletion');
reset role;

select set_config('request.jwt.claim.sub', '85000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '85000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '85000000-0000-4000-8000-000000000101',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is(public.change_staff_role('85000000-0000-4000-8000-000000000002', 'admin', false, 'Boundary revoke'), true, 'recent-TOTP Owner can still revoke an active target role');
reset role;
select is(
  (select pg_catalog.count(*)::integer from private.user_roles
   where user_id = '85000000-0000-4000-8000-000000000002'),
  0, 'the active target no longer has its revoked staff role'
);
select is(
  (select pg_catalog.count(*)::integer from private.role_change_audit
   where target_user_id = '85000000-0000-4000-8000-000000000002'),
  2, 'grant and revoke each append one role audit event'
);

select set_config('request.jwt.claim.sub', '85000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"85000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is(public.request_my_account_deletion(), true, 'an ordinary target can request deletion after its role is revoked');
reset role;

update public.profiles set account_state = 'deletion_review_required', deletion_review_reason = 'evidence_owned'
where id = '85000000-0000-4000-8000-000000000008';
update public.profiles set account_state = 'suspended' where id = '85000000-0000-4000-8000-000000000010';
update public.profiles set account_state = 'banned' where id = '85000000-0000-4000-8000-000000000011';

select set_config('request.jwt.claim.sub', '85000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '85000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '85000000-0000-4000-8000-000000000101',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is(public.change_staff_role('85000000-0000-4000-8000-000000000002', 'admin', true, 'Cannot grant pending'), false, 'a deletion request completed first prevents a later role grant');
select is(public.change_staff_role('85000000-0000-4000-8000-000000000008', 'admin', true, 'Cannot grant review'), false, 'an account awaiting deletion review cannot become staff');
select is(public.change_staff_role('85000000-0000-4000-8000-000000000010', 'admin', true, 'Cannot grant suspended'), false, 'a suspended target cannot become staff');
select is(public.change_staff_role('85000000-0000-4000-8000-000000000011', 'admin', true, 'Cannot grant banned'), false, 'a banned target cannot become staff');
reset role;
select is(
  (select pg_catalog.count(*)::integer from private.role_change_audit
   where actor_user_id = '85000000-0000-4000-8000-000000000001' and reason like 'Cannot grant%'),
  0, 'denied target-state grants write no role audit'
);

select set_config('request.jwt.claim.sub', '85000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '85000000-0000-4000-8000-000000000003', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '85000000-0000-4000-8000-000000000103',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is(public.change_staff_role('85000000-0000-4000-8000-000000000009', 'admin', true, 'Admin denied'), false, 'Admin cannot acquire the Owner-only role writer');
reset role;

select set_config('request.jwt.claim.sub', '85000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '85000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '85000000-0000-4000-8000-000000000101',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp() - interval '11 minutes'))::bigint
  ))
)::text, true);
set local role authenticated;
select is(public.change_staff_role('85000000-0000-4000-8000-000000000009', 'admin', true, 'Stale Owner denied'), false, 'stale-TOTP Owner cannot assign a role');
reset role;

-- Simulate privileged/manual role assignments retained on processing rows.
-- The final worker checkpoint must independently reject both staff roles.
update public.profiles set
  account_state = 'deletion_processing',
  deletion_requested_at = pg_catalog.clock_timestamp() - interval '8 days',
  deletion_claimed_at = pg_catalog.clock_timestamp()
where id in (
  '85000000-0000-4000-8000-000000000004',
  '85000000-0000-4000-8000-000000000005',
  '85000000-0000-4000-8000-000000000006',
  '85000000-0000-4000-8000-000000000007'
);
update private.runtime_flags set enabled = true where flag = 'account_deletion_cleanup';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is(public.begin_account_deletion_auth_attempt('85000000-0000-4000-8000-000000000004'), false, 'the final deletion checkpoint rejects an Admin assigned after a claim');
select is(public.begin_account_deletion_auth_attempt('85000000-0000-4000-8000-000000000005'), false, 'the final deletion checkpoint rejects an Owner assigned after a claim');
reset role;
select is(
  (select pg_catalog.count(*)::integer from public.profiles
   where id in ('85000000-0000-4000-8000-000000000004', '85000000-0000-4000-8000-000000000005')
     and account_state = 'deletion_processing' and deletion_auth_attempted_at is null),
  2, 'staff rejection leaves both processing states and Auth attempt markers unchanged'
);
set local role service_role;
select is(public.begin_account_deletion_auth_attempt('85000000-0000-4000-8000-000000000006'), true, 'a no-evidence ordinary processing account can still checkpoint once');
select is(public.begin_account_deletion_auth_attempt('85000000-0000-4000-8000-000000000006'), false, 'ordinary checkpoint replay remains denied');
reset role;

update private.runtime_flags set enabled = false where flag = 'account_deletion_cleanup';
set local role service_role;
select is(public.begin_account_deletion_auth_attempt('85000000-0000-4000-8000-000000000007'), false, 'the cleanup gate continues to prevent a fresh checkpoint');
reset role;
select is(
  (select deletion_auth_attempted_at from public.profiles where id = '85000000-0000-4000-8000-000000000007'),
  null::timestamptz, 'a disabled-gate checkpoint does not mark an Auth attempt'
);

set local role authenticated;
select throws_ok(
  $$select public.begin_account_deletion_auth_attempt('85000000-0000-4000-8000-000000000006')$$,
  '42501', null, 'authenticated cannot call the irreversible checkpoint directly'
);
reset role;
set local role anon;
select throws_ok(
  $$select public.begin_account_deletion_auth_attempt('85000000-0000-4000-8000-000000000006')$$,
  '42501', null, 'anonymous cannot call the irreversible checkpoint directly'
);
reset role;

select * from finish();
rollback;
