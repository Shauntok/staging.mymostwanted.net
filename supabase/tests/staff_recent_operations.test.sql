create extension if not exists pgtap with schema extensions;

begin;

select plan(38);

-- Every record is synthetic and rolls back. Future timestamps make the bounded
-- feed deterministic even when the local database contains older test data.
insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('9e000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'recent-admin@example.invalid', '', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('9e000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'recent-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('9e000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'recent-member@example.invalid', '', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());
insert into public.profiles (id, username) values
  ('9e000000-0000-4000-8000-000000000001', 'recentadmin'),
  ('9e000000-0000-4000-8000-000000000002', 'recentowner'),
  ('9e000000-0000-4000-8000-000000000003', 'recentmember');
insert into private.user_roles (user_id, role) values
  ('9e000000-0000-4000-8000-000000000001', 'admin'),
  ('9e000000-0000-4000-8000-000000000002', 'owner');
insert into auth.sessions (id, user_id, created_at, updated_at, aal) values
  ('9e000000-0000-4000-8000-000000000011', '9e000000-0000-4000-8000-000000000001', pg_catalog.now(), pg_catalog.now(), 'aal2'),
  ('9e000000-0000-4000-8000-000000000012', '9e000000-0000-4000-8000-000000000002', pg_catalog.now(), pg_catalog.now(), 'aal2'),
  ('9e000000-0000-4000-8000-000000000013', '9e000000-0000-4000-8000-000000000003', pg_catalog.now(), pg_catalog.now(), 'aal2');
insert into private.staff_session_activity (session_id, started_at, last_activity_at)
select id, pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
from auth.sessions where id in (
  '9e000000-0000-4000-8000-000000000011',
  '9e000000-0000-4000-8000-000000000012',
  '9e000000-0000-4000-8000-000000000013'
);

create function pg_temp.recent_operations_claims(
  p_user_id uuid, p_session_id uuid, p_method text default 'mfa/totp',
  p_age interval default interval '0 seconds', p_aal text default 'aal2'
)
returns void language plpgsql as $function$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user_id::text, ''), true);
  perform set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
    'sub', p_user_id, 'role', 'authenticated', 'aal', p_aal,
    'session_id', p_session_id,
    'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'method', p_method,
      'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp() - p_age))::bigint
    ))
  )::text, true);
end;
$function$;

insert into private.areas (id, area_name, area_type)
values ('9e000000-0000-4000-8000-000000000101', 'Synthetic recent operations area', 'state');
insert into private.posts (
  id, area_id, approved_title, primary_name, public_excerpt, full_body, risk_level
) values
  ('9e000000-0000-4000-8000-000000000201', '9e000000-0000-4000-8000-000000000101', 'Synthetic ordinary post', 'Synthetic ordinary subject', 'PRIVATE_FIXTURE_MARKER', 'PRIVATE_FIXTURE_MARKER', 'ordinary'),
  ('9e000000-0000-4000-8000-000000000202', '9e000000-0000-4000-8000-000000000101', 'Synthetic high post', 'Synthetic high subject', 'PRIVATE_FIXTURE_MARKER', 'PRIVATE_FIXTURE_MARKER', 'high');
insert into private.submissions (id, submitted_title, original_source, risk_level) values
  ('9e000000-0000-4000-8000-000000000301', 'Synthetic ordinary submission', 'PRIVATE_FIXTURE_MARKER', 'ordinary'),
  ('9e000000-0000-4000-8000-000000000302', 'Synthetic high submission', 'PRIVATE_FIXTURE_MARKER', 'high'),
  ('9e000000-0000-4000-8000-000000000303', 'Synthetic unassessed submission', 'PRIVATE_FIXTURE_MARKER', 'unassessed');
insert into private.evidence_metadata (id, submission_id, object_path, mime_type, scan_state, visibility) values
  ('9e000000-0000-4000-8000-000000000401', '9e000000-0000-4000-8000-000000000301', 'PRIVATE_FIXTURE_MARKER/ordinary.png', 'image/png', 'clean', 'internal_only'),
  ('9e000000-0000-4000-8000-000000000402', '9e000000-0000-4000-8000-000000000302', 'PRIVATE_FIXTURE_MARKER/high.png', 'image/png', 'clean', 'internal_only'),
  ('9e000000-0000-4000-8000-000000000403', '9e000000-0000-4000-8000-000000000303', 'PRIVATE_FIXTURE_MARKER/unassessed.png', 'image/png', 'clean', 'internal_only');
insert into private.staff_evidence_access_audit (evidence_id, submission_id, actor_user_id, occurred_at) values
  ('9e000000-0000-4000-8000-000000000401', '9e000000-0000-4000-8000-000000000301', '9e000000-0000-4000-8000-000000000002', '2099-01-01 00:00:11+00'),
  ('9e000000-0000-4000-8000-000000000402', '9e000000-0000-4000-8000-000000000302', '9e000000-0000-4000-8000-000000000002', '2099-01-01 00:00:12+00'),
  ('9e000000-0000-4000-8000-000000000403', '9e000000-0000-4000-8000-000000000303', '9e000000-0000-4000-8000-000000000002', '2099-01-01 00:00:13+00'),
  ('9e000000-0000-4000-8000-000000000499', '9e000000-0000-4000-8000-000000000399', '9e000000-0000-4000-8000-000000000002', '2099-01-01 00:00:14+00'),
  ('9e000000-0000-4000-8000-000000000499', '9e000000-0000-4000-8000-000000000301', '9e000000-0000-4000-8000-000000000002', '2099-01-01 00:00:15+00'),
  ('9e000000-0000-4000-8000-000000000402', '9e000000-0000-4000-8000-000000000301', '9e000000-0000-4000-8000-000000000002', '2099-01-01 00:00:16+00');

insert into private.user_reports (id, report_kind, post_id, reason, message) values
  ('9e000000-0000-4000-8000-000000000601', 'report', '9e000000-0000-4000-8000-000000000201', 'other', 'PRIVATE_FIXTURE_MARKER'),
  ('9e000000-0000-4000-8000-000000000602', 'report', '9e000000-0000-4000-8000-000000000202', 'other', 'PRIVATE_FIXTURE_MARKER'),
  ('9e000000-0000-4000-8000-000000000603', 'feedback', null, 'other', 'PRIVATE_FIXTURE_MARKER');

-- Submission/report insert triggers already create some Owner notifications.
-- Fill only absent variants, including an ordinary notice for a high-risk item.
insert into private.staff_notifications (recipient_user_id, event_type, entity_id, priority, title, message)
select '9e000000-0000-4000-8000-000000000002'::uuid, fixture.event_type, fixture.entity_id,
  'important', 'Synthetic operations notice', 'PRIVATE_FIXTURE_MARKER'
from (values
  ('submission_high_risk', '9e000000-0000-4000-8000-000000000302'::uuid),
  ('submission_received', '9e000000-0000-4000-8000-000000000302'::uuid),
  ('submission_received', '9e000000-0000-4000-8000-000000000301'::uuid),
  ('user_report_received', '9e000000-0000-4000-8000-000000000601'::uuid),
  ('user_report_received', '9e000000-0000-4000-8000-000000000602'::uuid),
  ('user_report_received', '9e000000-0000-4000-8000-000000000603'::uuid),
  ('submission_high_risk', '9e000000-0000-4000-8000-000000000301'::uuid)
) as fixture(event_type, entity_id)
on conflict (recipient_user_id, event_type, entity_id) do nothing;
insert into private.staff_notification_audit (notification_id, actor_user_id, status_before, status_after, occurred_at)
select notification.id, '9e000000-0000-4000-8000-000000000002'::uuid, 'unread', 'read', fixture.occurred_at
from (values
  ('submission_high_risk', '9e000000-0000-4000-8000-000000000302'::uuid, '2099-01-01 00:00:21+00'::timestamptz),
  ('submission_received', '9e000000-0000-4000-8000-000000000302'::uuid, '2099-01-01 00:00:22+00'::timestamptz),
  ('submission_received', '9e000000-0000-4000-8000-000000000301'::uuid, '2099-01-01 00:00:23+00'::timestamptz),
  ('user_report_received', '9e000000-0000-4000-8000-000000000601'::uuid, '2099-01-01 00:00:24+00'::timestamptz),
  ('user_report_received', '9e000000-0000-4000-8000-000000000602'::uuid, '2099-01-01 00:00:25+00'::timestamptz),
  ('user_report_received', '9e000000-0000-4000-8000-000000000603'::uuid, '2099-01-01 00:00:26+00'::timestamptz),
  ('submission_high_risk', '9e000000-0000-4000-8000-000000000301'::uuid, '2099-01-01 00:00:28+00'::timestamptz)
) as fixture(event_type, entity_id, occurred_at)
join private.staff_notifications as notification
  on notification.event_type = fixture.event_type and notification.entity_id = fixture.entity_id
  and notification.recipient_user_id = '9e000000-0000-4000-8000-000000000002';
insert into private.staff_notification_audit (actor_user_id, status_before, status_after, occurred_at)
values ('9e000000-0000-4000-8000-000000000002', 'unread', 'read', '2099-01-01 00:00:27+00');

insert into private.moderation_events (actor_user_id, post_id, action, reason, risk_level, occurred_at) values
  ('9e000000-0000-4000-8000-000000000002', '9e000000-0000-4000-8000-000000000201', 'publish', 'PRIVATE_FIXTURE_MARKER', 'ordinary', '2099-01-01 00:00:31+00'),
  ('9e000000-0000-4000-8000-000000000002', '9e000000-0000-4000-8000-000000000202', 'publish', 'PRIVATE_FIXTURE_MARKER', 'high', '2099-01-01 00:00:32+00'),
  ('9e000000-0000-4000-8000-000000000002', '9e000000-0000-4000-8000-000000000201', 'hide', 'PRIVATE_FIXTURE_MARKER', 'high', '2099-01-01 00:00:33+00'),
  ('9e000000-0000-4000-8000-000000000002', '9e000000-0000-4000-8000-000000000202', 'hide', 'PRIVATE_FIXTURE_MARKER', 'ordinary', '2099-01-01 00:00:34+00');
insert into private.post_revision_events (post_id, actor_user_id, reason, before_value, after_value, occurred_at) values
  ('9e000000-0000-4000-8000-000000000201', '9e000000-0000-4000-8000-000000000002', 'PRIVATE_FIXTURE_MARKER', '{"body":"PRIVATE_FIXTURE_MARKER"}', '{"body":"PRIVATE_FIXTURE_MARKER"}', '2099-01-01 00:00:41+00'),
  ('9e000000-0000-4000-8000-000000000202', '9e000000-0000-4000-8000-000000000002', 'PRIVATE_FIXTURE_MARKER', '{"body":"PRIVATE_FIXTURE_MARKER"}', '{"body":"PRIVATE_FIXTURE_MARKER"}', '2099-01-01 00:00:42+00');
insert into private.submission_staff_audit (submission_id, actor_user_id, action, reason, occurred_at) values
  ('9e000000-0000-4000-8000-000000000301', '9e000000-0000-4000-8000-000000000002', 'status_changed', 'PRIVATE_FIXTURE_MARKER', '2099-01-01 00:00:51+00'),
  ('9e000000-0000-4000-8000-000000000302', '9e000000-0000-4000-8000-000000000002', 'status_changed', 'PRIVATE_FIXTURE_MARKER', '2099-01-01 00:00:52+00'),
  ('9e000000-0000-4000-8000-000000000303', '9e000000-0000-4000-8000-000000000002', 'status_changed', 'PRIVATE_FIXTURE_MARKER', '2099-01-01 00:00:53+00');
insert into private.user_report_audit (report_id, actor_user_id, action, reason, occurred_at) values
  ('9e000000-0000-4000-8000-000000000601', '9e000000-0000-4000-8000-000000000002', 'status_changed', 'PRIVATE_FIXTURE_MARKER', '2099-01-01 00:01:01+00'),
  ('9e000000-0000-4000-8000-000000000602', '9e000000-0000-4000-8000-000000000002', 'status_changed', 'PRIVATE_FIXTURE_MARKER', '2099-01-01 00:01:02+00'),
  ('9e000000-0000-4000-8000-000000000603', '9e000000-0000-4000-8000-000000000002', 'status_changed', 'PRIVATE_FIXTURE_MARKER', '2099-01-01 00:01:03+00');
insert into private.role_change_audit (actor_user_id, target_user_id, role, action, reason, occurred_at)
values ('9e000000-0000-4000-8000-000000000002', '9e000000-0000-4000-8000-000000000001', 'admin', 'granted', 'PRIVATE_FIXTURE_MARKER', '2099-01-01 00:01:11+00');
insert into private.account_sanction_events (target_user_id, actor_user_id, action, reason, occurred_at)
select '9e000000-0000-4000-8000-000000000003'::uuid, '9e000000-0000-4000-8000-000000000002'::uuid,
  'warning', 'PRIVATE_FIXTURE_MARKER', '2098-01-01 00:00:00+00'::timestamptz + fixture.n * interval '1 second'
from pg_catalog.generate_series(1, 40) as fixture(n);

select is(pg_catalog.pg_get_function_result('public.staff_list_recent_operations(integer)'::regprocedure),
  'TABLE(occurred_at timestamp with time zone, event_type text, action text, actor_username text)',
  'the public feed retains exactly its four response fields and types');
select ok(
  has_function_privilege('authenticated', 'public.staff_list_recent_operations(integer)', 'EXECUTE')
  and has_function_privilege('authenticated', 'private.staff_list_recent_operations(integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.staff_list_recent_operations(integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.staff_list_recent_operations(integer)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.staff_list_recent_operations(integer)', 'EXECUTE')
  and not has_function_privilege('service_role', 'private.staff_list_recent_operations(integer)', 'EXECUTE'),
  'only authenticated callers have feed execution privileges');
select ok(not has_table_privilege('authenticated', 'private.staff_evidence_access_audit', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'private.staff_notifications', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'private.staff_notification_audit', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'private.staff_evidence_access_audit', 'SELECT'),
  'feed access does not grant direct client access to private source tables');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'private.staff_evidence_access_audit'::regclass)
  and (select relrowsecurity from pg_catalog.pg_class where oid = 'private.staff_notification_audit'::regclass),
  'private feed audit sources retain RLS');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_catalog.pg_proc
    where oid = 'private.staff_list_recent_operations(integer)'::regprocedure)
  and not (select prosecdef from pg_catalog.pg_proc where oid = 'public.staff_list_recent_operations(integer)'::regprocedure),
  'the guarded private reader retains an empty search path and the public wrapper is invoker');

select pg_temp.recent_operations_claims('9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000011');
set local role authenticated;
select is((select count(*)::integer from public.staff_list_recent_operations(30) where event_type = 'evidence_reviewed' and occurred_at = '2099-01-01 00:00:11+00'), 1, 'Admin sees ordinary evidence activity');
select is((select count(*)::integer from public.staff_list_recent_operations(30) where event_type = 'evidence_reviewed' and occurred_at = '2099-01-01 00:00:13+00'), 1, 'Admin retains eligible unassessed evidence activity');
select is((select count(*)::integer from public.staff_list_recent_operations(30) where event_type = 'evidence_reviewed' and occurred_at in ('2099-01-01 00:00:12+00', '2099-01-01 00:00:14+00', '2099-01-01 00:00:15+00', '2099-01-01 00:00:16+00')), 0, 'Admin cannot see high-risk, orphaned, missing-evidence or mismatched evidence activity');
select is((select count(*)::integer from public.staff_list_recent_operations(30) where event_type = 'notification_updated' and occurred_at in ('2099-01-01 00:00:21+00', '2099-01-01 00:00:22+00', '2099-01-01 00:00:25+00', '2099-01-01 00:00:27+00', '2099-01-01 00:00:28+00')), 0, 'Admin cannot see high-risk or unresolved notification activity, including Owner-only event types');
select is((select count(*)::integer from public.staff_list_recent_operations(30) where event_type = 'notification_updated' and occurred_at in ('2099-01-01 00:00:23+00', '2099-01-01 00:00:24+00', '2099-01-01 00:00:26+00')), 3, 'Admin sees ordinary submission, ordinary report and feedback notification activity');
select is((select count(*)::integer from public.staff_list_recent_operations(30) where occurred_at in ('2099-01-01 00:00:32+00', '2099-01-01 00:00:33+00', '2099-01-01 00:00:34+00', '2099-01-01 00:00:42+00', '2099-01-01 00:00:52+00', '2099-01-01 00:01:02+00')), 0, 'Admin high-risk filtering holds across moderation, revision, submission and report branches');
select is((select count(*)::integer from public.staff_list_recent_operations(30) where occurred_at in ('2099-01-01 00:00:31+00', '2099-01-01 00:00:41+00', '2099-01-01 00:00:51+00', '2099-01-01 00:01:01+00')), 4, 'ordinary activity remains visible across all existing content branches');
select is((select count(*)::integer from public.staff_list_recent_operations(30) where occurred_at = '2099-01-01 00:00:53+00'), 1, 'unassessed submission review activity remains eligible');
select is((select count(*)::integer from public.staff_list_recent_operations(30) where event_type = 'report_reviewed' and occurred_at = '2099-01-01 00:01:03+00'), 1, 'feedback activity remains visible without a post parent');
select ok((select bool_and((select count(*) from pg_catalog.jsonb_object_keys(to_jsonb(feed))) = 4
    and to_jsonb(feed)::text not like '%PRIVATE_FIXTURE_MARKER%'
    and to_jsonb(feed)::text not like '%9e000000-%') from public.staff_list_recent_operations(30) as feed),
  'responses contain no source text, reasons, entity IDs or evidence paths');
select is((select count(*)::integer from public.staff_list_recent_operations(1000)), 30, 'the global response is bounded at 30');
select is((select count(*)::integer from public.staff_list_recent_operations()), 20, 'the default limit remains 20');
select is((select count(*)::integer from public.staff_list_recent_operations(null)), 20, 'a null limit uses the default');
select is((select count(*)::integer from public.staff_list_recent_operations(0)), 1, 'a zero limit is clamped to one');
select is((select count(*)::integer from public.staff_list_recent_operations(-1)), 1, 'a negative limit is clamped to one');
select is((select count(*)::integer from public.staff_list_recent_operations(3)), 3, 'a smaller positive limit is honored');
select results_eq($$select occurred_at from public.staff_list_recent_operations(3)$$,
  $$values ('2099-01-01 00:01:03+00'::timestamptz), ('2099-01-01 00:01:01+00'::timestamptz), ('2099-01-01 00:00:53+00'::timestamptz)$$,
  'eligible sources are filtered before limiting and returned newest first');
reset role;

select pg_temp.recent_operations_claims('9e000000-0000-4000-8000-000000000002', '9e000000-0000-4000-8000-000000000012');
set local role authenticated;
select is((select count(*)::integer from public.staff_list_recent_operations(30) where event_type = 'evidence_reviewed' and occurred_at = '2099-01-01 00:00:12+00'), 1, 'Owner retains authorized high-risk evidence activity');
select is((select count(*)::integer from public.staff_list_recent_operations(30) where event_type = 'evidence_reviewed' and occurred_at in ('2099-01-01 00:00:14+00', '2099-01-01 00:00:15+00', '2099-01-01 00:00:16+00')), 3, 'Owner retains evidence audit summaries whose metadata is unavailable or inconsistent');
select is((select count(*)::integer from public.staff_list_recent_operations(30) where event_type = 'notification_updated' and occurred_at in ('2099-01-01 00:00:21+00', '2099-01-01 00:00:22+00', '2099-01-01 00:00:25+00', '2099-01-01 00:00:28+00')), 4, 'Owner retains high-risk and Owner-only notification activity');
select is((select count(*)::integer from public.staff_list_recent_operations(30) where event_type = 'notification_updated' and occurred_at = '2099-01-01 00:00:27+00'), 1, 'Owner retains audit summaries after notification retention removes the parent');
select is((select count(*)::integer from public.staff_list_recent_operations(30) where occurred_at in ('2099-01-01 00:00:32+00', '2099-01-01 00:00:33+00', '2099-01-01 00:00:34+00', '2099-01-01 00:00:42+00', '2099-01-01 00:00:52+00', '2099-01-01 00:01:02+00')), 6, 'Owner retains high-risk activity across existing content branches');
select is((select count(*)::integer from public.staff_list_recent_operations(30) where event_type = 'evidence_reviewed' and occurred_at in ('2099-01-01 00:00:11+00', '2099-01-01 00:00:13+00')), 2, 'Owner also retains ordinary and unassessed evidence activity');
select is((select count(*)::integer from public.staff_list_recent_operations(30) where event_type = 'role_updated' and occurred_at = '2099-01-01 00:01:11+00'), 1, 'Owner-exclusive categories remain available to Owner');
reset role;

select pg_temp.recent_operations_claims('9e000000-0000-4000-8000-000000000003', '9e000000-0000-4000-8000-000000000013');
set local role authenticated;
select throws_ok($$select public.staff_list_recent_operations(30)$$, '42501', 'Staff access and recent TOTP required', 'fresh TOTP does not grant an ordinary member staff access');
reset role;
select pg_temp.recent_operations_claims(null, null);
set local role authenticated;
select throws_ok($$select public.staff_list_recent_operations(30)$$, '42501', 'Staff access and recent TOTP required', 'a caller without an Auth identity is rejected');
reset role;
select pg_temp.recent_operations_claims('9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000011', 'password', interval '0 seconds', 'aal1');
set local role authenticated;
select throws_ok($$select public.staff_list_recent_operations(30)$$, '42501', 'Staff access and recent TOTP required', 'Admin AAL1 cannot read operations');
reset role;
select pg_temp.recent_operations_claims('9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000011', 'mfa/recovery_code');
set local role authenticated;
select throws_ok($$select public.staff_list_recent_operations(30)$$, '42501', 'Staff access and recent TOTP required', 'recovery-code AAL2 cannot replace a TOTP proof');
reset role;
select pg_temp.recent_operations_claims('9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000011', 'mfa/totp', interval '11 minutes');
set local role authenticated;
select throws_ok($$select public.staff_list_recent_operations(30)$$, '42501', 'Staff access and recent TOTP required', 'expired TOTP cannot read operations even with an active staff session');
reset role;
select pg_temp.recent_operations_claims('9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000011');
update private.staff_session_activity set last_activity_at = pg_catalog.clock_timestamp() - interval '16 minutes',
  started_at = pg_catalog.clock_timestamp() - interval '20 minutes'
where session_id = '9e000000-0000-4000-8000-000000000011';
set local role authenticated;
select throws_ok($$select public.staff_list_recent_operations(30)$$, '42501', 'Staff access and recent TOTP required', 'fresh TOTP cannot bypass an expired staff-session lease');
reset role;
update private.staff_session_activity set started_at = pg_catalog.now(), last_activity_at = pg_catalog.clock_timestamp()
where session_id = '9e000000-0000-4000-8000-000000000011';
select pg_temp.recent_operations_claims('9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000012');
set local role authenticated;
select throws_ok($$select public.staff_list_recent_operations(30)$$, '42501', 'Staff access and recent TOTP required', 'an Auth session belonging to another staff user is rejected');
reset role;
select pg_temp.recent_operations_claims('9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000011');
delete from private.user_roles where user_id = '9e000000-0000-4000-8000-000000000001' and role = 'admin';
set local role authenticated;
select throws_ok($$select public.staff_list_recent_operations(30)$$, '42501', 'Staff access and recent TOTP required', 'a revoked staff role cannot keep reading through a previously valid session');
select throws_ok($$select * from private.staff_evidence_access_audit$$, '42501', 'permission denied for table staff_evidence_access_audit', 'authenticated clients cannot bypass the feed through the evidence audit table');
reset role;

select * from finish();
rollback;
