create extension if not exists pgtap with schema extensions;

begin;

select plan(55);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('c3000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'publication-owner@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('c3000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'publication-admin@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('c3000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'publication-member@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

insert into public.profiles (id, username)
values
  ('c3000000-0000-4000-8000-000000000001', 'publicationowner'),
  ('c3000000-0000-4000-8000-000000000002', 'publicationadmin'),
  ('c3000000-0000-4000-8000-000000000003', 'publicationmember');
insert into private.user_roles (user_id, role)
values
  ('c3000000-0000-4000-8000-000000000001', 'owner'),
  ('c3000000-0000-4000-8000-000000000002', 'admin');
insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values
  ('c3000000-0000-4000-8000-000000000011', 'c3000000-0000-4000-8000-000000000001', pg_catalog.now(), pg_catalog.now(), 'aal2'),
  ('c3000000-0000-4000-8000-000000000012', 'c3000000-0000-4000-8000-000000000002', pg_catalog.now(), pg_catalog.now(), 'aal2');
insert into private.staff_session_activity (session_id, started_at, last_activity_at)
values
  ('c3000000-0000-4000-8000-000000000011', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()),
  ('c3000000-0000-4000-8000-000000000012', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp());

insert into private.areas (id, area_name, area_type, is_active)
values
  ('c3000000-0000-4000-8000-000000000101', 'Reviewed Publication Fixture State', 'state', true),
  ('c3000000-0000-4000-8000-000000000102', 'Inactive Publication Fixture State', 'state', false);
insert into private.tags (id, slug, display_name, is_active)
values
  ('c3000000-0000-4000-8000-000000000201', 'publication-tag-one', 'Publication Tag One', true),
  ('c3000000-0000-4000-8000-000000000202', 'publication-tag-two', 'Publication Tag Two', true),
  ('c3000000-0000-4000-8000-000000000203', 'publication-tag-inactive', 'Inactive Publication Tag', false);

create temporary table pgtap_reviewed_sources (
  kind text primary key,
  submission_id uuid unique not null,
  expected_updated_at timestamptz,
  expected_latest_addendum_id uuid
);
insert into pgtap_reviewed_sources (kind, submission_id)
values
  ('ordinary', 'c3000000-0000-4000-8000-000000000301'),
  ('high', 'c3000000-0000-4000-8000-000000000302'),
  ('invalid', 'c3000000-0000-4000-8000-000000000303'),
  ('closed', 'c3000000-0000-4000-8000-000000000304'),
  ('no_intake', 'c3000000-0000-4000-8000-000000000305'),
  ('inactive_area', 'c3000000-0000-4000-8000-000000000306'),
  ('stale_source', 'c3000000-0000-4000-8000-000000000307'),
  ('stale_addendum', 'c3000000-0000-4000-8000-000000000308'),
  ('late_expiry', 'c3000000-0000-4000-8000-000000000309'),
  ('late_revoke', 'c3000000-0000-4000-8000-000000000310'),
  ('timestamp', 'c3000000-0000-4000-8000-000000000311'),
  ('empty_choices', 'c3000000-0000-4000-8000-000000000312');

insert into private.submissions (id, submitter_id, submitted_title, original_source, status, risk_level)
select fixture.submission_id, 'c3000000-0000-4000-8000-000000000003'::uuid,
  'Synthetic source ' || fixture.kind, 'Original synthetic source ' || fixture.kind,
  case when fixture.kind = 'closed' then 'closed' else 'received' end,
  case when fixture.kind = 'high' then 'high' else 'ordinary' end
from pgtap_reviewed_sources as fixture;
insert into private.submission_intake_details (
  submission_id, primary_name, area_id, social_links, declaration_version, declared_at
)
select fixture.submission_id, 'Synthetic protected subject ' || fixture.kind,
  case when fixture.kind = 'inactive_area'
    then 'c3000000-0000-4000-8000-000000000102'::uuid
    else 'c3000000-0000-4000-8000-000000000101'::uuid end,
  '{"telegram":"https://t.me/mmwr_synthetic_profile","instagram":"https://www.instagram.com/mmwr_synthetic_profile"}'::jsonb,
  'synthetic-review-v1', pg_catalog.clock_timestamp()
from pgtap_reviewed_sources as fixture where fixture.kind <> 'no_intake';
update pgtap_reviewed_sources as fixture
set expected_updated_at = submission.updated_at
from private.submissions as submission where submission.id = fixture.submission_id;
insert into private.evidence_metadata (id, submission_id, uploaded_by, object_path, mime_type, scan_state, visibility)
values (
  'c3000000-0000-4000-8000-000000000401', 'c3000000-0000-4000-8000-000000000301',
  'c3000000-0000-4000-8000-000000000003', 'synthetic/internal-publication.png', 'image/png', 'clean', 'internal_only'
);

create temporary table pgtap_reviewed_results (kind text primary key, post_id uuid);
grant select on pgtap_reviewed_sources to authenticated;
grant select, insert on pgtap_reviewed_results to authenticated;

-- These helpers only supply fixture arguments and claims. Publication and all
-- authorization, validation, projection and auditing remain the real RPCs.
create function pg_temp.reviewed_claims(p_role text, p_age_seconds integer default 0)
returns text language plpgsql set search_path = '' as $function$
declare
  v_user_id uuid;
  v_session_id uuid;
begin
  v_user_id := case p_role
    when 'owner' then 'c3000000-0000-4000-8000-000000000001'::uuid
    when 'admin' then 'c3000000-0000-4000-8000-000000000002'::uuid
    else 'c3000000-0000-4000-8000-000000000003'::uuid end;
  v_session_id := case p_role
    when 'owner' then 'c3000000-0000-4000-8000-000000000011'::uuid
    when 'admin' then 'c3000000-0000-4000-8000-000000000012'::uuid
    else null end;
  perform pg_catalog.set_config('request.jwt.claim.sub', v_user_id::text, true);
  return pg_catalog.set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
    'sub', v_user_id, 'role', 'authenticated', 'aal', 'aal2', 'session_id', v_session_id,
    'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'method', 'mfa/totp',
      'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint - p_age_seconds
    ))
  )::text, true);
end;
$function$;

create function pg_temp.reviewed_publish(
  p_kind text,
  p_tag_ids uuid[] default array['c3000000-0000-4000-8000-000000000201'::uuid],
  p_risk_level text default 'ordinary',
  p_platforms text[] default array['telegram']::text[],
  p_reason text default 'Synthetic reviewed publication'
)
returns uuid language sql volatile security invoker set search_path = '' as $function$
  select public.publish_reviewed_submission(
    fixture.submission_id, 'Reviewed synthetic title', 'Reviewed public excerpt.',
    'Reviewed full body.', p_tag_ids, p_risk_level, p_reason,
    fixture.expected_updated_at, fixture.expected_latest_addendum_id, p_platforms
  ) from pg_temp.pgtap_reviewed_sources as fixture where fixture.kind = p_kind;
$function$;

select is((select enabled from private.runtime_flags where flag = 'submission_publication'), false, 'reviewed publication starts disabled');
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'private.submission_publications'::regclass)
  and not has_table_privilege('authenticated', 'private.submission_intake_details', 'INSERT')
  and not has_table_privilege('authenticated', 'private.submission_publications', 'SELECT')
  and has_function_privilege('authenticated', 'public.publish_reviewed_submission(uuid,text,text,text,uuid[],text,text,timestamptz,uuid,text[])', 'EXECUTE')
  and not has_function_privilege('anon', 'public.publish_reviewed_submission(uuid,text,text,text,uuid[],text,text,timestamptz,uuid,text[])', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.publish_reviewed_submission(uuid,text,text,text,uuid[],text,text,timestamptz,uuid,text[])', 'EXECUTE'),
  'guarded authenticated RPC preserves private intake/publication tables and least-privilege ACL'
);
select pg_temp.reviewed_claims('admin');
set local role authenticated;
select is((select pg_catalog.count(*)::integer from public.get_staff_submission_publication_source('c3000000-0000-4000-8000-000000000301')), 0, 'gate OFF hides publication source');
select is((select pg_catalog.count(*)::integer from public.list_staff_publication_tags()), 0, 'gate OFF hides publication tag choices');
select is(pg_temp.reviewed_publish('ordinary'), null::uuid, 'gate OFF denies otherwise-authorized publication');
reset role;
select is((select pg_catalog.count(*)::integer from private.submission_publications), 0, 'gate OFF creates no publication');

-- This gate change is local to the enclosing rolled-back fixture transaction.
update private.runtime_flags set enabled = true where flag = 'submission_publication';
select pg_temp.reviewed_claims('member');
set local role authenticated;
select is(pg_temp.reviewed_publish('ordinary'), null::uuid, 'ordinary member cannot publish');
reset role;
select pg_temp.reviewed_claims('admin');
select pg_catalog.set_config('request.jwt.claims', pg_catalog.jsonb_set(auth.jwt(), '{aal}', '"aal1"'::jsonb)::text, true);
set local role authenticated;
select is(pg_temp.reviewed_publish('ordinary'), null::uuid, 'AAL1 Admin cannot publish');
reset role;
select pg_temp.reviewed_claims('admin', 601);
set local role authenticated;
select is(pg_temp.reviewed_publish('ordinary'), null::uuid, 'stale TOTP cannot publish');
reset role;
select pg_temp.reviewed_claims('admin');
set local role authenticated;
select is((select pg_catalog.count(*)::integer from public.get_staff_submission_publication_source('c3000000-0000-4000-8000-000000000302')), 0, 'Admin cannot inspect high-risk publication source');
select is(pg_temp.reviewed_publish('high'), null::uuid, 'Admin cannot downgrade and publish a high-risk source');
select is(pg_temp.reviewed_publish('ordinary', p_risk_level => 'high'), null::uuid, 'Admin cannot publish an ordinary source with high-risk classification');
select is(pg_temp.reviewed_publish('invalid', array['c3000000-0000-4000-8000-000000000201'::uuid, 'c3000000-0000-4000-8000-000000000201'::uuid]), null::uuid, 'duplicate tags fail atomically');
select is(pg_temp.reviewed_publish('invalid', array['c3000000-0000-4000-8000-000000000203'::uuid]), null::uuid, 'inactive tags fail atomically');
select is(pg_temp.reviewed_publish('invalid', array['c3000000-0000-4000-8000-000000000299'::uuid]), null::uuid, 'unknown tags fail atomically');
select is(pg_temp.reviewed_publish('invalid', array[null::uuid]), null::uuid, 'NULL tag IDs fail atomically');
select is(pg_temp.reviewed_publish('invalid', p_platforms => array['telegram', 'telegram']), null::uuid, 'duplicate social platforms fail atomically');
select is(pg_temp.reviewed_publish('invalid', p_platforms => array['unknown']), null::uuid, 'unknown social platform fails atomically');
select is(pg_temp.reviewed_publish('closed'), null::uuid, 'closed source cannot be published');
select is(pg_temp.reviewed_publish('no_intake'), null::uuid, 'unstructured source cannot be published');
select is(pg_temp.reviewed_publish('inactive_area'), null::uuid, 'inactive area cannot be published');
select is(pg_temp.reviewed_publish('invalid', p_reason => '   '), null::uuid, 'blank publication reason fails atomically');
reset role;
update private.submission_intake_details set social_links = '{"telegram":"http://t.me/synthetic"}'::jsonb
where submission_id = 'c3000000-0000-4000-8000-000000000303';
set local role authenticated;
select is(pg_temp.reviewed_publish('invalid'), null::uuid, 'non-HTTPS social URL fails atomically');
reset role;
select ok(
  not exists (select 1 from private.posts)
  and not exists (select 1 from private.submission_publications)
  and not exists (select 1 from private.submission_reviews)
  and not exists (select 1 from private.submission_staff_audit where action = 'published')
  and not exists (select 1 from private.moderation_events),
  'denied publication requests create no post, review, relation or publication audit'
);
update private.submissions set updated_at = pg_catalog.clock_timestamp(), original_source = 'Changed synthetic source'
where id = 'c3000000-0000-4000-8000-000000000307';
insert into private.submission_addenda (submission_id, additional_information)
values ('c3000000-0000-4000-8000-000000000308', 'A newer synthetic addendum');
set local role authenticated;
select throws_ok($$select pg_temp.reviewed_publish('stale_source')$$, '40001', 'submission source changed; reload before publishing', 'stale source version fails instead of publishing old review');
select throws_ok($$select pg_temp.reviewed_publish('stale_addendum')$$, '40001', 'submission source changed; reload before publishing', 'new addendum invalidates the previously opened publication review');
reset role;
select is((select pg_catalog.count(*)::integer from private.submission_publications), 0, 'source conflicts leave no partial publication');
set local role authenticated;
select is((select pg_catalog.count(*)::integer from public.get_staff_submission_publication_source('c3000000-0000-4000-8000-000000000301')), 1, 'recent-TOTP Admin can inspect structured ordinary source');
insert into pgtap_reviewed_results (kind, post_id)
values ('ordinary', pg_temp.reviewed_publish('ordinary', array['c3000000-0000-4000-8000-000000000202'::uuid, 'c3000000-0000-4000-8000-000000000201'::uuid]));
select ok((select post_id is not null from pgtap_reviewed_results where kind = 'ordinary'), 'recent-TOTP Admin publishes a reviewed ordinary source');
reset role;
select ok(
  (select post_row.status = 'published' and post_row.primary_name = 'Synthetic protected subject ordinary'
      and post_row.area_id = 'c3000000-0000-4000-8000-000000000101'::uuid
      and post_row.submitter_id = 'c3000000-0000-4000-8000-000000000003'::uuid
      and post_row.approved_title = 'Reviewed synthetic title' and preview.approved_title = post_row.approved_title
   from private.posts as post_row join public.published_previews as preview on preview.post_id = post_row.id
   where post_row.id = (select post_id from pgtap_reviewed_results where kind = 'ordinary')),
  'publication preserves protected subject/area/submitter and creates the public preview'
);
select is((select pg_catalog.count(*)::integer from private.post_tags where post_id = (select post_id from pgtap_reviewed_results where kind = 'ordinary')), 2, 'publication applies only the selected active tags');
select ok(
  (select pg_catalog.count(*)::integer from public.published_social_links where post_id = (select post_id from pgtap_reviewed_results where kind = 'ordinary')) = 1
  and exists (select 1 from public.published_social_links where platform = 'telegram' and url = 'https://t.me/mmwr_synthetic_profile'),
  'only explicitly selected allowlisted social URL is projected'
);
select ok(
  (select status = 'published' and original_source = 'Original synthetic source ordinary' from private.submissions where id = 'c3000000-0000-4000-8000-000000000301')
  and (select declaration_version = 'synthetic-review-v1' from private.submission_intake_details where submission_id = 'c3000000-0000-4000-8000-000000000301'),
  'publication changes review state while preserving source and declaration'
);
select ok(
  (select publication.published_at = post_row.published_at and publication.published_at = review.created_at
      and publication.published_at = staff_audit.occurred_at and publication.published_at = moderation.occurred_at
      and publication.actor_user_id = 'c3000000-0000-4000-8000-000000000002'::uuid
   from private.submission_publications as publication
   join private.posts as post_row on post_row.id = publication.post_id
   join private.submission_reviews as review on review.submission_id = publication.submission_id and review.decision = 'approve'
   join private.submission_staff_audit as staff_audit on staff_audit.submission_id = publication.submission_id and staff_audit.action = 'published'
   join private.moderation_events as moderation on moderation.post_id = publication.post_id and moderation.action = 'publish'
   where publication.submission_id = 'c3000000-0000-4000-8000-000000000301'),
  'post, publication, review and both audits share one final publication timestamp and actor'
);
select ok(
  (select submission_id = 'c3000000-0000-4000-8000-000000000301'::uuid and post_id is null
      and object_path = 'synthetic/internal-publication.png' and scan_state = 'clean' and visibility = 'internal_only'
   from private.evidence_metadata where id = 'c3000000-0000-4000-8000-000000000401')
  and not exists (select 1 from private.staff_evidence_access_grants),
  'publication never moves or exposes clean internal evidence and never issues an evidence grant'
);
set local role authenticated;
select is(pg_temp.reviewed_publish('ordinary'), null::uuid, 'a published source cannot create a duplicate post');
reset role;
set local role anon;
select is((select pg_catalog.count(*)::integer from public.published_social_links), 1, 'anonymous reader sees only selected links for the published preview');
reset role;
select pg_temp.reviewed_claims('owner');
select ok(not private.is_valid_public_social_url('facebook', 'https://attacker@www.facebook.com/profile'), 'social allowlist rejects credential-bearing authority with an approved subdomain');
select ok(not private.is_valid_public_social_url('facebook', 'https://attacker%40www.facebook.com/profile'), 'social allowlist rejects encoded authority characters');
select ok(
  not private.is_valid_public_social_url('facebook', 'https://.www.facebook.com/profile')
  and not private.is_valid_public_social_url('facebook', 'https://www..facebook.com/profile')
  and not private.is_valid_public_social_url('facebook', 'https://-www.facebook.com/profile')
  and not private.is_valid_public_social_url('facebook', 'https://www-.facebook.com/profile'),
  'social allowlist rejects malformed DNS labels before applying subdomain rules'
);
set local role authenticated;
insert into pgtap_reviewed_results (kind, post_id)
values ('high', pg_temp.reviewed_publish('high', p_risk_level => 'high'));
select ok((select post_id is not null from pgtap_reviewed_results where kind = 'high'), 'Owner can publish high-risk reviewed source without a clean image');
reset role;
select ok(
  not exists (select 1 from private.evidence_metadata where submission_id = 'c3000000-0000-4000-8000-000000000302')
  and exists (select 1 from private.posts where id = (select post_id from pgtap_reviewed_results where kind = 'high') and risk_level = 'high'),
  'absence of image evidence does not block the Owner human publication decision'
);

-- Inject a state transition during the last URL-validation stage. This models
-- eligibility changing after intake/Tag work without ten-minute sleeps or
-- committed fixtures. The publisher and real staff/TOTP helpers are unchanged.
-- Actual two-session row-lock waits remain an isolated Staging acceptance gate.
create temporary table pgtap_reviewed_saved_functions (definition text not null);
insert into pgtap_reviewed_saved_functions
select pg_catalog.pg_get_functiondef('private.is_valid_public_social_url(text,text)'::regprocedure);
do $block$
begin
  execute pg_catalog.replace(
    (select definition from pgtap_reviewed_saved_functions),
    'private.is_valid_public_social_url(', 'pg_temp.reviewed_original_social_validator('
  );
end;
$block$;
create or replace function private.is_valid_public_social_url(p_platform text, p_url text)
returns boolean language plpgsql volatile set search_path = '' as $function$
declare
  v_valid boolean := pg_temp.reviewed_original_social_validator(p_platform, p_url);
  v_transition text := pg_catalog.current_setting('mmwr.test.publication_validation_transition', true);
begin
  if not v_valid then return false; end if;
  if v_transition = 'expire_totp' then
    perform pg_catalog.set_config('request.jwt.claims', pg_catalog.jsonb_set(auth.jwt(), '{amr}',
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint - 601
      )))::text, true);
  elsif v_transition = 'revoke_role' then
    delete from private.user_roles where user_id = auth.uid() and role = 'admin';
  end if;
  perform pg_catalog.set_config('mmwr.test.publication_validation_completed_at', pg_catalog.clock_timestamp()::text, true);
  return true;
end;
$function$;

select pg_temp.reviewed_claims('admin');
select pg_catalog.set_config('mmwr.test.publication_validation_transition', 'expire_totp', true);
set local role authenticated;
select is(pg_temp.reviewed_publish('late_expiry'), null::uuid, 'TOTP expiring after intake/Tag validation cannot authorize publication');
reset role;
select ok(
  not exists (select 1 from private.submission_publications where submission_id = 'c3000000-0000-4000-8000-000000000309')
  and not exists (select 1 from private.submission_staff_audit where submission_id = 'c3000000-0000-4000-8000-000000000309' and action = 'published')
  and (select status = 'received' from private.submissions where id = 'c3000000-0000-4000-8000-000000000309'),
  'late TOTP expiry leaves source, relation and publication audit unchanged'
);
select pg_temp.reviewed_claims('admin');
select pg_catalog.set_config('mmwr.test.publication_validation_transition', 'revoke_role', true);
set local role authenticated;
select is(pg_temp.reviewed_publish('late_revoke'), null::uuid, 'staff role revoked after intake/Tag validation cannot authorize publication');
reset role;
select ok(
  not exists (select 1 from private.submission_publications where submission_id = 'c3000000-0000-4000-8000-000000000310')
  and not exists (select 1 from private.submission_reviews where submission_id = 'c3000000-0000-4000-8000-000000000310')
  and (select status = 'received' from private.submissions where id = 'c3000000-0000-4000-8000-000000000310'),
  'late role revocation leaves source, relation and review unchanged'
);
insert into private.user_roles (user_id, role) values ('c3000000-0000-4000-8000-000000000002', 'admin');
select pg_temp.reviewed_claims('admin');
select pg_catalog.set_config('mmwr.test.publication_validation_transition', 'record_time_only', true);
set local role authenticated;
insert into pgtap_reviewed_results (kind, post_id) values ('timestamp', pg_temp.reviewed_publish('timestamp'));
select ok((select post_id is not null from pgtap_reviewed_results where kind = 'timestamp'), 'valid authorization still publishes after final validation');
reset role;
select ok(
  (select published_at >= pg_catalog.current_setting('mmwr.test.publication_validation_completed_at')::timestamptz
      and created_at = published_at and updated_at = published_at
   from private.posts where id = (select post_id from pgtap_reviewed_results where kind = 'timestamp')),
  'publication timestamps are sampled after the last validation stage'
);
do $block$
begin
  execute (select definition from pgtap_reviewed_saved_functions);
end;
$block$;

set local role authenticated;
insert into pgtap_reviewed_results (kind, post_id)
values ('empty_choices', pg_temp.reviewed_publish('empty_choices', array[]::uuid[], 'ordinary', array[]::text[]));
select ok((select post_id is not null from pgtap_reviewed_results where kind = 'empty_choices'), 'empty Tag/social selections are valid for otherwise-approved content');
reset role;
select ok(
  not exists (select 1 from private.post_tags where post_id = (select post_id from pgtap_reviewed_results where kind = 'empty_choices'))
  and not exists (select 1 from public.published_social_links where post_id = (select post_id from pgtap_reviewed_results where kind = 'empty_choices')),
  'empty selections create no accidental tags or social links'
);
select throws_ok($$update private.submission_publications set reason = 'Tampered synthetic reason'$$, '55000', 'submission publication record is immutable', 'publication audit relation cannot be edited');
select throws_ok($$delete from private.submission_publications$$, '55000', 'submission publication record is immutable', 'publication audit relation cannot be deleted');
select throws_ok($$truncate private.submission_publications$$, '55000', 'submission publication record is immutable', 'publication audit relation cannot be truncated');
update private.runtime_flags set enabled = false where flag = 'submission_publication';
select pg_temp.reviewed_claims('owner');
set local role authenticated;
select is(pg_temp.reviewed_publish('late_expiry'), null::uuid, 'turning publication OFF prevents a later valid Owner attempt');
reset role;
select ok(
  not exists (select 1 from private.runtime_flags where enabled and flag in ('submission_publication', 'staff_evidence_preview', 'owner_evidence_visibility', 'submission_risk_scanning'))
  and not has_function_privilege('authenticated', 'public.create_submission(text,text)', 'EXECUTE'),
  'fixture keeps intake and evidence/risk gates closed and leaves publication OFF before rollback'
);

select * from finish();
rollback;
