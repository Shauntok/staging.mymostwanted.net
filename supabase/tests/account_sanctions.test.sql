create extension if not exists pgtap with schema extensions;

begin;

select plan(28);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('89000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'sanction-owner@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('89000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'sanction-admin@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('89000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'sanction-member@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('89000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'sanction-admin-target@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

insert into public.profiles (id, username)
values
  ('89000000-0000-4000-8000-000000000001', 'sanctionowner'),
  ('89000000-0000-4000-8000-000000000002', 'sanctionadmin'),
  ('89000000-0000-4000-8000-000000000003', 'sanctionmember'),
  ('89000000-0000-4000-8000-000000000004', 'sanctionadmintarget');

insert into private.user_roles (user_id, role)
values
  ('89000000-0000-4000-8000-000000000001', 'owner'),
  ('89000000-0000-4000-8000-000000000002', 'admin'),
  ('89000000-0000-4000-8000-000000000004', 'admin');

insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values
  ('89000000-0000-4000-8000-000000000011', '89000000-0000-4000-8000-000000000001', pg_catalog.now(), pg_catalog.now(), 'aal2'),
  ('89000000-0000-4000-8000-000000000012', '89000000-0000-4000-8000-000000000002', pg_catalog.now(), pg_catalog.now(), 'aal2'),
  ('89000000-0000-4000-8000-000000000013', '89000000-0000-4000-8000-000000000004', pg_catalog.now(), pg_catalog.now(), 'aal2');

insert into private.staff_session_activity (session_id, started_at, last_activity_at)
values
  ('89000000-0000-4000-8000-000000000011', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()),
  ('89000000-0000-4000-8000-000000000012', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()),
  ('89000000-0000-4000-8000-000000000013', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp());

create temporary table pgtap_sanction_ids (kind text primary key, event_id bigint);
grant select, insert on pgtap_sanction_ids to authenticated;

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'private.account_sanction_events'::regclass)
  and not has_table_privilege('anon', 'private.account_sanction_events', 'SELECT')
  and not has_table_privilege('authenticated', 'private.account_sanction_events', 'SELECT')
  and not has_table_privilege('service_role', 'private.account_sanction_events', 'SELECT'),
  'sanction history is RLS-protected with no direct client or service reads'
);
select ok(
  has_function_privilege('authenticated', 'public.staff_apply_account_sanction(uuid,text,timestamp with time zone,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.staff_lift_account_sanction(bigint,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.staff_apply_account_sanction(uuid,text,timestamp with time zone,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'private.staff_apply_account_sanction(uuid,text,timestamp with time zone,text)', 'EXECUTE'),
  'authenticated callers can reach the guarded sanction RPCs while anon cannot reach the public writer'
);

select set_config('request.jwt.claim.sub', '89000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '89000000-0000-4000-8000-000000000002', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '89000000-0000-4000-8000-000000000012',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is(
  public.staff_apply_account_sanction('89000000-0000-4000-8000-000000000003', 'permanent_ban', null, 'Admin cannot ban'),
  null::bigint,
  'Admin cannot issue permanent bans'
);
select is(
  public.staff_apply_account_sanction('89000000-0000-4000-8000-000000000004', 'account_suspension', pg_catalog.clock_timestamp() + interval '1 day', 'Admin cannot sanction staff'),
  null::bigint,
  'Admin cannot sanction another Admin'
);
insert into pgtap_sanction_ids
select 'warning', public.staff_apply_account_sanction('89000000-0000-4000-8000-000000000003', 'warning', null, '  Synthetic warning  ');
select ok((select event_id is not null from pgtap_sanction_ids where kind = 'warning'), 'Admin can record a warning for an active ordinary account');
reset role;
select is((select reason from private.account_sanction_events where id = (select event_id from pgtap_sanction_ids where kind = 'warning')), 'Synthetic warning', 'sanction reasons are trimmed before the audit insert');
set local role authenticated;
insert into pgtap_sanction_ids
select 'submission_suspension', public.staff_apply_account_sanction('89000000-0000-4000-8000-000000000003', 'submission_suspension', pg_catalog.clock_timestamp() + interval '1 day', 'Synthetic suspension');
select ok((select event_id is not null from pgtap_sanction_ids where kind = 'submission_suspension'), 'Admin can set a future submission-only suspension');
select is(
  public.staff_apply_account_sanction('89000000-0000-4000-8000-000000000003', 'submission_suspension', pg_catalog.clock_timestamp() + interval '2 days', 'Duplicate suspension'),
  null::bigint,
  'a duplicate active suspension of the same type is rejected'
);
reset role;

select set_config('request.jwt.claim.sub', '89000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '89000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '89000000-0000-4000-8000-000000000011',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
insert into pgtap_sanction_ids
select 'permanent_ban', public.staff_apply_account_sanction('89000000-0000-4000-8000-000000000003', 'permanent_ban', null, 'Synthetic permanent ban');
select ok((select event_id is not null from pgtap_sanction_ids where kind = 'permanent_ban'), 'Owner can issue a permanent ban for an active ordinary account');
reset role;
select is((select account_state from public.profiles where id = '89000000-0000-4000-8000-000000000003'), 'banned', 'permanent ban updates the account state');

select set_config('request.jwt.claim.sub', '89000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '89000000-0000-4000-8000-000000000002', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '89000000-0000-4000-8000-000000000012',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is(public.staff_lift_account_sanction((select event_id from pgtap_sanction_ids where kind = 'permanent_ban'), 'Admin cannot lift a ban'), false, 'Admin cannot lift a permanent ban');
reset role;

select set_config('request.jwt.claim.sub', '89000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '89000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '89000000-0000-4000-8000-000000000011',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is(public.staff_lift_account_sanction((select event_id from pgtap_sanction_ids where kind = 'permanent_ban'), 'Owner reinstatement'), true, 'Owner can lift a permanent ban with a reason');
reset role;
select is((select account_state from public.profiles where id = '89000000-0000-4000-8000-000000000003'), 'active', 'lifting a permanent ban restores the profile account state');
select ok(
  exists (
    select 1 from private.account_sanction_events as lift
    where lift.action = 'lift'
      and lift.target_event_id = (select event_id from pgtap_sanction_ids where kind = 'permanent_ban')
      and lift.reason = 'Owner reinstatement'
  ),
  'lifting a sanction appends a linked audit event without altering the original event'
);

select set_config('request.jwt.claim.sub', '89000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '89000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '89000000-0000-4000-8000-000000000011',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
insert into pgtap_sanction_ids
select 'admin_suspension', public.staff_apply_account_sanction('89000000-0000-4000-8000-000000000004', 'account_suspension', pg_catalog.clock_timestamp() + interval '1 day', 'Synthetic staff suspension');
select ok((select event_id is not null from pgtap_sanction_ids where kind = 'admin_suspension'), 'Owner can suspend an Admin account');
reset role;
select is((select action from private.account_sanction_events where id = (select event_id from pgtap_sanction_ids where kind = 'admin_suspension')), 'account_suspension', 'staff suspension is recorded against the intended sanction type');
select is(private.account_has_active_sanction('89000000-0000-4000-8000-000000000004', 'account_suspension'), true, 'active account suspension is recognized by the shared authorization helper');

select set_config('request.jwt.claim.sub', '89000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '89000000-0000-4000-8000-000000000004', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '89000000-0000-4000-8000-000000000013',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is(auth.uid(), '89000000-0000-4000-8000-000000000004'::uuid, 'session subject matches the sanctioned Admin');
select is(private.has_staff_role('admin'), false, 'an active AAL2 session loses staff access while its account is suspended');
reset role;

select set_config('request.jwt.claim.sub', '89000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '89000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '89000000-0000-4000-8000-000000000011',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is(public.staff_lift_account_sanction((select event_id from pgtap_sanction_ids where kind = 'admin_suspension'), 'Restore synthetic Admin'), true, 'Owner can lift an active staff account suspension');
reset role;

select set_config('request.jwt.claim.sub', '89000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '89000000-0000-4000-8000-000000000004', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '89000000-0000-4000-8000-000000000013',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is(private.has_staff_role('admin'), true, 'lifting the account suspension restores staff authorization');
select is(public.staff_apply_account_sanction('89000000-0000-4000-8000-000000000003', 'account_suspension', pg_catalog.clock_timestamp() - interval '1 second', 'Already expired'), null::bigint, 'expired suspension requests are rejected');
select is(public.staff_apply_account_sanction('89000000-0000-4000-8000-000000000003', 'unknown_action', null, 'Unknown action'), null::bigint, 'unknown sanction actions are rejected');
select is(public.staff_apply_account_sanction('89000000-0000-4000-8000-000000000003', 'warning', null, '   '), null::bigint, 'blank sanction reasons are rejected');
select is(public.staff_apply_account_sanction('89000000-0000-4000-8000-000000000002', 'warning', null, 'Self sanction'), null::bigint, 'staff cannot sanction their own account');
select is((select pg_catalog.count(*)::integer from public.staff_list_account_sanctions('sanctionmember')), 3, 'authorized staff can list bounded history for a matching username');
reset role;

select throws_ok(
  $$update private.account_sanction_events set reason = 'tampered' where id = (select event_id from pgtap_sanction_ids where kind = 'warning')$$,
  '42501', null, 'sanction events cannot be edited'
);
select throws_ok(
  $$truncate private.account_sanction_events$$,
  '42501', null, 'sanction history cannot be truncated'
);

select * from finish();
rollback;
