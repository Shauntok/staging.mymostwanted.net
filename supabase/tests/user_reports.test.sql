create extension if not exists pgtap with schema extensions;

begin;

select plan(19);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('85000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'report-member@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('85000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'report-admin@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

insert into public.profiles (id, username)
values
  ('85000000-0000-4000-8000-000000000001', 'reportmember'),
  ('85000000-0000-4000-8000-000000000002', 'reportadmin');

insert into private.user_roles (user_id, role)
values ('85000000-0000-4000-8000-000000000002', 'admin');

insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values ('85000000-0000-4000-8000-000000000012', '85000000-0000-4000-8000-000000000002', pg_catalog.now(), pg_catalog.now(), 'aal2');

insert into private.staff_session_activity (session_id, started_at, last_activity_at)
values ('85000000-0000-4000-8000-000000000012', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp());

create temporary table pgtap_report_ids (report_id uuid not null);
grant select, insert on pgtap_report_ids to authenticated, service_role;

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'private.user_reports'::regclass)
  and (select relrowsecurity from pg_catalog.pg_class where oid = 'private.user_report_audit'::regclass),
  'report records and staff audit tables both use RLS'
);
select ok(
  not has_table_privilege('anon', 'private.user_reports', 'SELECT')
  and not has_table_privilege('authenticated', 'private.user_reports', 'SELECT')
  and not has_table_privilege('authenticated', 'private.user_report_audit', 'SELECT'),
  'clients cannot enumerate reports or read report audit directly'
);
select ok(
  has_function_privilege('service_role', 'public.create_my_user_report(uuid,text,uuid,text,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.list_staff_user_reports(integer)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.update_staff_user_report(uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.create_my_user_report(uuid,text,uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.create_my_user_report(uuid,text,uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.update_staff_user_report(uuid,text,text)', 'EXECUTE'),
  'server-only report creation and staff review RPCs have bounded role grants'
);
select ok(
  pg_catalog.pg_get_function_result('public.list_staff_user_reports(integer)'::regprocedure) not ilike '%submitted_by%'
  and pg_catalog.pg_get_function_result('public.list_staff_user_reports(integer)'::regprocedure) not ilike '%email%'
  and pg_catalog.pg_get_function_result('public.list_staff_user_reports(integer)'::regprocedure) not ilike '%user_id%',
  'staff report list projection omits submitter identity fields'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is(public.create_my_user_report('85000000-0000-4000-8000-000000000001', 'feedback', '85000000-0000-4000-8000-000000000099', 'technical_issue', 'Invalid feedback target'), null::uuid, 'feedback cannot be attached to a post');
insert into pgtap_report_ids (report_id)
select public.create_my_user_report('85000000-0000-4000-8000-000000000001', 'feedback', null, 'technical_issue', '  Synthetic local feedback ')
from pg_catalog.generate_series(1, 5);
select is((select pg_catalog.count(*)::integer from pgtap_report_ids where report_id is not null), 5, 'active member can submit at most five valid feedback records');
select throws_ok(
  $$select public.create_my_user_report('85000000-0000-4000-8000-000000000001', 'feedback', null, 'technical_issue', 'sixth feedback')$$,
  'P0001', 'report_rate_limited', 'sixth feedback inside the rolling hour is rate limited'
);
reset role;

select is((select message from private.user_reports where id = (select report_id from pgtap_report_ids limit 1)), 'Synthetic local feedback', 'database trims surrounding whitespace before storing feedback');
update public.profiles set account_state = 'suspended' where id = '85000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is(public.create_my_user_report('85000000-0000-4000-8000-000000000001', 'feedback', null, 'technical_issue', 'Suspended account attempt'), null::uuid, 'suspended account cannot submit feedback');
reset role;

select set_config('request.jwt.claim.sub', '85000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '85000000-0000-4000-8000-000000000002', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '85000000-0000-4000-8000-000000000012',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is((select pg_catalog.count(*)::integer from public.list_staff_user_reports(100)), 5, 'recent-TOTP Admin reads a bounded feedback list');
select is(public.update_staff_user_report((select report_id from pgtap_report_ids limit 1), 'reviewing', 'Synthetic review action'), true, 'recent-TOTP Admin can move a report into review');
select is(public.update_staff_user_report((select report_id from pgtap_report_ids limit 1), 'reviewing', 'Duplicate status'), false, 'staff cannot create duplicate status transitions');
reset role;

select is((select pg_catalog.count(*)::integer from private.user_report_audit where action = 'opened'), 5, 'each opened report creates an audit event');
select is((select pg_catalog.count(*)::integer from private.user_report_audit where action = 'status_changed' and status_before = 'received' and status_after = 'reviewing' and reason = 'Synthetic review action'), 1, 'status audit records the transition and required reason');
select is((select status from private.user_reports where id = (select report_id from pgtap_report_ids limit 1)), 'reviewing', 'staff status change is persisted on the report');
select throws_ok(
  $$update private.user_report_audit set reason = 'tampered' where action = 'opened'$$,
  '42501', null, 'report audit is append-only'
);
select lives_ok(
  $$update private.user_report_audit set actor_user_id = null where actor_user_id = '85000000-0000-4000-8000-000000000002'$$,
  'retained report audit permits only actor anonymization for Auth deletion'
);
select is(
  (select pg_catalog.count(*)::integer from private.user_report_audit where actor_user_id is null and action in ('opened', 'status_changed')),
  6,
  'actor anonymization preserves every report audit row and action'
);
select throws_ok(
  $$truncate private.user_report_audit$$,
  '42501', null, 'report audit cannot be truncated'
);

select * from finish();
rollback;
