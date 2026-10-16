create extension if not exists pgtap with schema extensions;

begin;

select plan(20);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('9b000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'notification-admin@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('9b000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'notification-owner@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('9b000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'notification-member@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

insert into public.profiles (id, username)
values
  ('9b000000-0000-4000-8000-000000000001', 'notificationadmin'),
  ('9b000000-0000-4000-8000-000000000002', 'notificationowner'),
  ('9b000000-0000-4000-8000-000000000003', 'notificationmember');

insert into private.user_roles (user_id, role)
values
  ('9b000000-0000-4000-8000-000000000001', 'admin'),
  ('9b000000-0000-4000-8000-000000000002', 'owner');

insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values
  ('9b000000-0000-4000-8000-000000000011', '9b000000-0000-4000-8000-000000000001', pg_catalog.now(), pg_catalog.now(), 'aal2'),
  ('9b000000-0000-4000-8000-000000000012', '9b000000-0000-4000-8000-000000000002', pg_catalog.now(), pg_catalog.now(), 'aal2');

insert into private.staff_session_activity (session_id, started_at, last_activity_at)
values
  ('9b000000-0000-4000-8000-000000000011', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()),
  ('9b000000-0000-4000-8000-000000000012', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp());

insert into private.staff_notifications (
  id, recipient_user_id, event_type, entity_id, priority, status, title, message, created_at, updated_at
) values
  ('9b000000-0000-4000-8000-000000000101', '9b000000-0000-4000-8000-000000000001', 'submission_received', '9b000000-0000-4000-8000-000000000201', 'normal', 'unread', 'Synthetic recent notice', 'Fixed local fixture message', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()),
  ('9b000000-0000-4000-8000-000000000102', '9b000000-0000-4000-8000-000000000001', 'user_report_received', '9b000000-0000-4000-8000-000000000202', 'important', 'unread', 'Synthetic expired notice', 'Fixed expired fixture message', pg_catalog.clock_timestamp() - interval '91 days', pg_catalog.clock_timestamp() - interval '91 days'),
  ('9b000000-0000-4000-8000-000000000103', '9b000000-0000-4000-8000-000000000002', 'submission_high_risk', '9b000000-0000-4000-8000-000000000203', 'critical', 'unread', 'Synthetic Owner notice', 'Fixed Owner fixture message', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp());

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'private.staff_notifications'::regclass)
  and (select relrowsecurity from pg_catalog.pg_class where oid = 'private.staff_notification_audit'::regclass)
  and not has_table_privilege('anon', 'private.staff_notifications', 'SELECT')
  and not has_table_privilege('authenticated', 'private.staff_notifications', 'SELECT')
  and not has_table_privilege('authenticated', 'private.staff_notification_audit', 'SELECT'),
  'notifications and status audit use RLS without direct client reads'
);
select ok(
  has_function_privilege('authenticated', 'public.list_staff_notifications(integer)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.update_staff_notification_status(uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.list_staff_notifications(integer)', 'EXECUTE'),
  'notification reads and transitions are exposed only through the authenticated staff wrappers'
);

select set_config('request.jwt.claim.sub', '9b000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '9b000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '9b000000-0000-4000-8000-000000000011',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is((select pg_catalog.count(*)::integer from public.list_staff_notifications(1000)), 1, 'staff list is capped and excludes notifications older than 90 days');
select is((select pg_catalog.count(*)::integer from public.list_staff_notifications(100) where id = '9b000000-0000-4000-8000-000000000101'), 1, 'Admin receives its own recent notification');
select is((select pg_catalog.count(*)::integer from public.list_staff_notifications(100) where id = '9b000000-0000-4000-8000-000000000103'), 0, 'Admin cannot read an Owner-only notification');
select is(public.update_staff_notification_status('9b000000-0000-4000-8000-000000000101', 'read'), true, 'unread notification can move to read');
select is(public.update_staff_notification_status('9b000000-0000-4000-8000-000000000101', 'read'), false, 'duplicate notification transitions are rejected');
select is(public.update_staff_notification_status('9b000000-0000-4000-8000-000000000101', 'resolved'), false, 'notification cannot skip the in-progress state');
select is(public.update_staff_notification_status('9b000000-0000-4000-8000-000000000101', 'unknown'), false, 'unknown notification states are rejected');
select is(public.update_staff_notification_status('9b000000-0000-4000-8000-000000000103', 'read'), false, 'staff cannot update a different recipient notification');
select is(public.update_staff_notification_status('9b000000-0000-4000-8000-000000000102', 'read'), false, 'expired notification cannot be changed before the purge job runs');
select is(public.update_staff_notification_status('9b000000-0000-4000-8000-000000000101', 'in_progress'), true, 'read notification can move to in progress');
select is(public.update_staff_notification_status('9b000000-0000-4000-8000-000000000101', 'resolved'), true, 'in-progress notification can move to resolved');
reset role;

select ok(
  (select status = 'resolved' and read_at is not null and in_progress_at is not null and resolved_at is not null
   from private.staff_notifications where id = '9b000000-0000-4000-8000-000000000101'),
  'valid transitions preserve the ordered lifecycle timestamps'
);
select is((select pg_catalog.count(*)::integer from private.staff_notification_audit where notification_id = '9b000000-0000-4000-8000-000000000101'), 3, 'each accepted transition appends exactly one audit row');

select set_config('request.jwt.claim.sub', '9b000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"9b000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select throws_ok($$select public.list_staff_notifications(100)$$, '42501', 'Staff notification access denied', 'staff notification list requires recent TOTP');
reset role;

select set_config('request.jwt.claim.sub', '9b000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '9b000000-0000-4000-8000-000000000002', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '9b000000-0000-4000-8000-000000000012',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is((select pg_catalog.count(*)::integer from public.list_staff_notifications(100)), 1, 'Owner receives only its own notification');
select is(public.update_staff_notification_status('9b000000-0000-4000-8000-000000000101', 'read'), false, 'Owner cannot mutate an Admin recipient notification');
reset role;

select throws_ok(
  $$update private.staff_notification_audit set status_after = 'read' where notification_id = '9b000000-0000-4000-8000-000000000101'$$,
  '42501', 'staff notification audit is append-only', 'notification audit rows cannot be edited'
);
select throws_ok(
  $$truncate private.staff_notification_audit$$,
  '42501', 'staff notification audit is append-only', 'notification audit cannot be truncated'
);

select * from finish();
rollback;
