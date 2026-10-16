create extension if not exists pgtap with schema extensions;

begin;

select plan(30);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('84000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'deletion-member@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('84000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'deletion-clean@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('84000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'deletion-evidence@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('84000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'deletion-uncertain@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('84000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'deletion-owner@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('84000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'deletion-admin@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('84000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'deletion-restored-object@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('84000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'deletion-restored-thumbnail@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

insert into public.profiles (id, username)
values
  ('84000000-0000-4000-8000-000000000001', 'deletionmember'),
  ('84000000-0000-4000-8000-000000000002', 'deletionclean'),
  ('84000000-0000-4000-8000-000000000003', 'deletionevidence'),
  ('84000000-0000-4000-8000-000000000004', 'deletionuncertain'),
  ('84000000-0000-4000-8000-000000000005', 'deletionowner'),
  ('84000000-0000-4000-8000-000000000006', 'deletionadmin'),
  ('84000000-0000-4000-8000-000000000007', 'deletionrestoredobject'),
  ('84000000-0000-4000-8000-000000000008', 'deletionrestoredthumb');

insert into private.user_roles (user_id, role)
values
  ('84000000-0000-4000-8000-000000000005', 'owner'),
  ('84000000-0000-4000-8000-000000000006', 'admin');

insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values ('84000000-0000-4000-8000-000000000015', '84000000-0000-4000-8000-000000000005', pg_catalog.now(), pg_catalog.now(), 'aal2');

insert into private.staff_session_activity (session_id, started_at, last_activity_at)
values ('84000000-0000-4000-8000-000000000015', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp());

insert into private.areas (id, area_name, area_type)
values ('84000000-0000-4000-8000-000000000020', 'Deletion fixture state', 'state');

insert into private.submissions (id, submitter_id, submitted_title, original_source, status, risk_level)
values ('84000000-0000-4000-8000-000000000030', '84000000-0000-4000-8000-000000000003', 'Evidence fixture', 'Synthetic source', 'received', 'ordinary');

insert into private.evidence_metadata (id, submission_id, uploaded_by, object_path, mime_type, scan_state, visibility)
values ('84000000-0000-4000-8000-000000000040', '84000000-0000-4000-8000-000000000030', '84000000-0000-4000-8000-000000000003', 'synthetic/evidence.pdf', 'application/pdf', 'pending', 'internal_only');

-- Storage API service-role restores leave owner_id NULL. Keep the original
-- uploader UUID in the object path, as the evidence upload policy requires.
insert into storage.objects (id, bucket_id, name, owner_id, metadata)
values (
  '84000000-0000-4000-8000-000000000017', 'mmwr-evidence-quarantine',
  '84000000-0000-4000-8000-000000000007/84000000-0000-4000-8000-000000000018/84000000-0000-4000-8000-000000000019.pdf',
  null, '{"size":1024,"mimetype":"application/pdf","cacheControl":"3600"}'::jsonb
);

-- An orphaned restored derivative must still protect its uploader at the final
-- Auth-deletion checkpoint, even when its evidence row is no longer present.
insert into storage.objects (id, bucket_id, name, owner_id, metadata)
values (
  '84000000-0000-4000-8000-000000000021', 'mmwr-public-thumbnail-derivatives',
  '84000000-0000-4000-8000-000000000008/84000000-0000-4000-8000-000000000022/84000000-0000-4000-8000-000000000023.webp',
  null, '{"size":512,"mimetype":"image/webp","cacheControl":"3600"}'::jsonb
);

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'private.account_deletion_review_events'::regclass)
  and not has_table_privilege('anon', 'private.account_deletion_review_events', 'SELECT')
  and not has_table_privilege('authenticated', 'private.account_deletion_review_events', 'SELECT'),
  'deletion review events use RLS and have no client read grants'
);
select is((select enabled from private.runtime_flags where flag = 'account_deletion'), false, 'account deletion starts disabled');
select is((select enabled from private.runtime_flags where flag = 'account_deletion_cleanup'), false, 'irreversible cleanup starts disabled');
select ok(
  has_function_privilege('service_role', 'public.claim_expired_account_deletions(integer)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.begin_account_deletion_auth_attempt(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.claim_expired_account_deletions(integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.begin_account_deletion_auth_attempt(uuid)', 'EXECUTE'),
  'irreversible worker RPCs are service-role only'
);

select set_config('request.jwt.claim.sub', '84000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"84000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is(public.request_my_account_deletion(), false, 'user deletion request is denied while its feature flag is off');
reset role;

update private.runtime_flags set enabled = true where flag = 'account_deletion';
select set_config('request.jwt.claim.sub', '84000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"84000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is(public.request_my_account_deletion(), true, 'active ordinary member can request deletion after the gate is enabled');
select is(public.request_my_account_deletion(), false, 'member cannot submit a duplicate deletion request');
select is(public.cancel_my_account_deletion(), true, 'member can cancel during the seven-day cooling period');
reset role;
select is((select account_state from public.profiles where id = '84000000-0000-4000-8000-000000000001'), 'active', 'cancellation restores the member account to active');

update public.profiles
set account_state = 'deletion_pending', deletion_requested_at = pg_catalog.clock_timestamp() - interval '7 days'
where id = '84000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub', '84000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"84000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is(public.cancel_my_account_deletion(), false, 'cancellation is rejected at the seven-day deadline');
reset role;
update public.profiles set account_state = 'active', deletion_requested_at = null where id = '84000000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.sub', '84000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"84000000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is(public.request_my_account_deletion(), false, 'Owner cannot request deletion through the ordinary-member flow');
reset role;

update public.profiles set
  account_state = 'deletion_pending',
  deletion_requested_at = pg_catalog.clock_timestamp() - interval '8 days'
where id in ('84000000-0000-4000-8000-000000000002', '84000000-0000-4000-8000-000000000003');
update public.profiles set
  account_state = 'deletion_pending',
  deletion_requested_at = pg_catalog.clock_timestamp() - interval '8 days'
where id = '84000000-0000-4000-8000-000000000007';
update public.profiles set
  account_state = 'deletion_pending',
  deletion_requested_at = pg_catalog.clock_timestamp() - interval '8 days'
where id = '84000000-0000-4000-8000-000000000008';
update public.profiles set
  account_state = 'deletion_processing',
  deletion_requested_at = pg_catalog.clock_timestamp() - interval '9 days',
  deletion_claimed_at = pg_catalog.clock_timestamp() - interval '40 minutes',
  deletion_auth_attempted_at = pg_catalog.clock_timestamp() - interval '35 minutes'
where id = '84000000-0000-4000-8000-000000000004';

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is((select pg_catalog.count(*)::integer from public.claim_expired_account_deletions(10)), 0, 'worker returns no claims while the cleanup gate remains off');
reset role;

update private.runtime_flags set enabled = true where flag = 'account_deletion_cleanup';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is(
  (select user_id from public.claim_expired_account_deletions(10) limit 1),
  '84000000-0000-4000-8000-000000000002'::uuid,
  'worker claims only the expired eligible member with no evidence'
);
select is(public.begin_account_deletion_auth_attempt('84000000-0000-4000-8000-000000000002'), true, 'worker persists its Auth deletion checkpoint before external deletion');
select is(public.begin_account_deletion_auth_attempt('84000000-0000-4000-8000-000000000002'), false, 'Auth deletion checkpoint cannot be replayed');
select is(public.mark_account_deletion_review_required('84000000-0000-4000-8000-000000000002', 'auth_cleanup_uncertain'), true, 'ambiguous Auth result moves account to manual review');
select is(public.mark_account_deletion_review_required('84000000-0000-4000-8000-000000000002', 'auth_cleanup_failed'), false, 'worker cannot overwrite an already recorded review outcome');
reset role;

select is((select account_state from public.profiles where id = '84000000-0000-4000-8000-000000000002'), 'deletion_review_required', 'ambiguous Auth outcome remains in Owner review');
select is((select deletion_review_reason from public.profiles where id = '84000000-0000-4000-8000-000000000002'), 'auth_cleanup_uncertain', 'review retains the fixed uncertain outcome');
select is((select account_state from public.profiles where id = '84000000-0000-4000-8000-000000000003'), 'deletion_review_required', 'any recorded evidence diverts the account before Auth deletion');
select is((select deletion_review_reason from public.profiles where id = '84000000-0000-4000-8000-000000000003'), 'evidence_owned', 'evidence review uses its fixed reason');
select ok(
  (select owner_id is null from storage.objects where id = '84000000-0000-4000-8000-000000000017')
  and (select account_state = 'deletion_review_required' and deletion_review_reason = 'evidence_owned'
    from public.profiles where id = '84000000-0000-4000-8000-000000000007'),
  'ownerless restored evidence remains deletion-protected by its uploader UUID path'
);
select is((select account_state from public.profiles where id = '84000000-0000-4000-8000-000000000008'), 'deletion_processing', 'orphaned ownerless thumbnail reaches the final checkpoint with its path retained');
select is(public.begin_account_deletion_auth_attempt('84000000-0000-4000-8000-000000000008'), false, 'orphaned ownerless thumbnail blocks the Auth deletion checkpoint');
select ok(
  (select owner_id is null from storage.objects where id = '84000000-0000-4000-8000-000000000021')
  and (select account_state = 'deletion_review_required' and deletion_review_reason = 'evidence_owned'
    from public.profiles where id = '84000000-0000-4000-8000-000000000008'),
  'ownerless restored thumbnail is sent to Owner review by its uploader UUID path'
);
select is((select account_state from public.profiles where id = '84000000-0000-4000-8000-000000000004'), 'deletion_review_required', 'expired claim with prior Auth attempt is not retried');
select is((select deletion_review_reason from public.profiles where id = '84000000-0000-4000-8000-000000000004'), 'auth_cleanup_uncertain', 'expired at-most-once claim is marked uncertain');
select is((select pg_catalog.count(*)::integer from private.account_deletion_review_events), 5, 'each review outcome appends one private review event');

select set_config('request.jwt.claim.sub', '84000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '84000000-0000-4000-8000-000000000005', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '84000000-0000-4000-8000-000000000015',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is((select pg_catalog.count(*)::integer from public.owner_list_account_deletion_reviews_page(null, null, 10)), 5, 'recent-TOTP Owner sees the bounded deletion review rows');
reset role;

select set_config('request.jwt.claim.sub', '84000000-0000-4000-8000-000000000006', true);
select set_config('request.jwt.claims', '{"sub":"84000000-0000-4000-8000-000000000006","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select throws_ok(
  $$select * from public.owner_list_account_deletion_reviews_page(null, null, 10)$$,
  '42501', null, 'Admin cannot inspect the Owner-only deletion review queue'
);
reset role;

select * from finish();
rollback;
