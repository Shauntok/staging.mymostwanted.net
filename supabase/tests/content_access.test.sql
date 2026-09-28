create extension if not exists pgtap with schema extensions;

begin;

select plan(53);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('20000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'submitter@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('20000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'admin@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('20000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'owner@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('20000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'other@example.invalid', '', null, '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('20000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'suspended@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

insert into public.profiles (id, username, display_name, account_state)
values
  ('20000000-0000-4000-8000-000000000001', 'submitter one', 'Submitter', 'active'),
  ('20000000-0000-4000-8000-000000000002', 'moderator two', 'Moderator', 'active'),
  ('20000000-0000-4000-8000-000000000003', 'owner three', 'Owner', 'active'),
  ('20000000-0000-4000-8000-000000000004', 'other four', 'Other', 'active'),
  ('20000000-0000-4000-8000-000000000005', 'suspended five', 'Suspended', 'suspended');

insert into private.user_roles (user_id, role)
values
  ('20000000-0000-4000-8000-000000000002', 'admin'),
  ('20000000-0000-4000-8000-000000000003', 'owner');

insert into private.areas (id, area_name, area_type)
values ('30000000-0000-4000-8000-000000000001', 'Fixture State', 'state');
insert into private.tags (id, slug, display_name)
values ('40000000-0000-4000-8000-000000000001', 'fixture-tag', 'Fixture Tag');

insert into private.posts (
  id, area_id, submitter_id, approved_title, primary_name, public_excerpt,
  full_body, risk_level, status
) values
  ('50000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Ordinary fixture', 'Fixture Person One', 'Approved public excerpt.', 'Private full body one.', 'ordinary', 'pending_review'),
  ('50000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'High risk fixture', 'Fixture Person Two', 'Approved high-risk excerpt.', 'Private high-risk body.', 'high', 'pending_review'),
  ('50000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Draft fixture', 'Fixture Person Three', 'Draft excerpt must stay private.', 'Draft private body.', 'ordinary', 'draft');

insert into private.post_tags (post_id, tag_id)
values ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001');
insert into private.evidence_metadata (
  id, post_id, uploaded_by, object_path, mime_type, scan_state, visibility
) values (
  '60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001', 'fixture/private/path.jpg', 'image/jpeg', 'clean', 'public_thumbnail'
);

insert into private.submissions (
  id, submitter_id, submitted_title, original_source, status, risk_level
) values
  ('70000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Ordinary source', 'Private source text', 'received', 'ordinary'),
  ('70000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'High source', 'Private high-risk source', 'received', 'high'),
  ('70000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000005', 'Suspended source', 'Private suspended source', 'needs_more_information', 'ordinary');

select throws_ok(
  $$update private.posts set public_excerpt = pg_catalog.repeat('x', 201) where id = '50000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'public excerpt is bounded to the compact preview payload cap'
);

select is(
  (select pg_catalog.count(*)::integer from pg_catalog.pg_class as relation
   where relation.relrowsecurity
     and relation.oid in (
       'public.published_previews'::regclass, 'public.reaction_counts'::regclass,
       'private.areas'::regclass, 'private.tags'::regclass, 'private.posts'::regclass,
       'private.post_tags'::regclass, 'private.aliases'::regclass, 'private.submissions'::regclass,
       'private.submission_addenda'::regclass, 'private.submission_reviews'::regclass,
       'private.evidence_metadata'::regclass, 'private.reactions'::regclass,
       'private.moderation_events'::regclass
     )),
  13, 'RLS is enabled on every new app table'
);
select ok(
  not has_table_privilege('anon', 'private.posts', 'SELECT')
  and not has_table_privilege('authenticated', 'private.posts', 'SELECT')
  and not has_table_privilege('authenticated', 'private.posts', 'INSERT')
  and not has_table_privilege('authenticated', 'private.posts', 'UPDATE')
  and not has_table_privilege('authenticated', 'private.posts', 'DELETE')
  and not has_table_privilege('authenticated', 'private.areas', 'SELECT')
  and not has_table_privilege('authenticated', 'private.tags', 'SELECT')
  and not has_table_privilege('authenticated', 'private.post_tags', 'SELECT')
  and not has_table_privilege('authenticated', 'private.aliases', 'SELECT')
  and not has_table_privilege('authenticated', 'private.submissions', 'SELECT')
  and not has_table_privilege('authenticated', 'private.submissions', 'INSERT')
  and not has_table_privilege('authenticated', 'private.submission_addenda', 'SELECT')
  and not has_table_privilege('authenticated', 'private.submission_reviews', 'INSERT')
  and not has_table_privilege('authenticated', 'private.evidence_metadata', 'SELECT')
  and not has_table_privilege('authenticated', 'private.reactions', 'SELECT')
  and not has_table_privilege('authenticated', 'private.moderation_events', 'SELECT'),
  'clients have no direct grants on private content, evidence, reaction, or audit tables'
);
select ok(
  has_column_privilege('anon', 'public.published_previews', 'approved_title', 'SELECT')
  and has_column_privilege('anon', 'public.published_previews', 'public_tag_labels', 'SELECT')
  and not has_table_privilege('anon', 'public.published_previews', 'INSERT')
  and not has_table_privilege('authenticated', 'public.published_previews', 'UPDATE')
  and has_column_privilege('anon', 'public.published_previews', 'first_published_at', 'SELECT')
  and has_column_privilege('anon', 'public.published_previews', 'last_listed_at', 'SELECT')
  and not has_table_privilege('authenticated', 'public.reaction_counts', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.reaction_counts', 'INSERT'),
  'anonymous readers receive only the explicit safe-preview read grant'
);
select ok(
  not exists (
    select 1 from pg_catalog.pg_attribute as attribute
    where attribute.attrelid = 'public.published_previews'::regclass
      and not attribute.attisdropped
      and attribute.attname in ('full_body', 'submitter_id', 'email', 'risk_level', 'object_path', 'internal_notes')
  ),
  'public preview schema contains no body, identity, risk, evidence path, or review notes'
);
select ok(
  has_function_privilege('authenticated', 'public.create_submission(text,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.read_post_full_body(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.read_post_full_body(uuid)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.publish_post(uuid,text)', 'EXECUTE'),
  'public workflow RPC grants exclude anonymous body reads and service-role moderation'
);
select ok(
  coalesce((select policy.qual like '%published_previews%'
    from pg_catalog.pg_policies as policy
    where policy.schemaname = 'public' and policy.tablename = 'reaction_counts'
      and policy.policyname = 'reaction_counts_public_read'), false),
  'reaction aggregate policy requires a matching public preview'
);
select ok(
  (with function_definitions as (
     select pg_catalog.pg_get_functiondef('private.set_own_reaction(uuid)'::regprocedure) as set_definition,
            pg_catalog.pg_get_functiondef('private.remove_own_reaction(uuid)'::regprocedure) as remove_definition
   )
   select set_definition ilike '%area.is_active%'
     and pg_catalog.strpos(set_definition, 'auth.users') < pg_catalog.strpos(set_definition, 'for key share')
     and pg_catalog.strpos(set_definition, 'for key share') < pg_catalog.strpos(set_definition, 'private.posts')
     and pg_catalog.strpos(set_definition, 'private.posts') < pg_catalog.strpos(set_definition, 'for update')
     and pg_catalog.strpos(remove_definition, 'auth.users') < pg_catalog.strpos(remove_definition, 'for key share')
     and pg_catalog.strpos(remove_definition, 'for key share') < pg_catalog.strpos(remove_definition, 'private.posts')
     and pg_catalog.strpos(remove_definition, 'private.posts') < pg_catalog.strpos(remove_definition, 'for update')
   from function_definitions),
  'all authenticated reaction RPCs lock Auth before post and reaction rows'
);

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000004","role":"anon","aal":"aal1"}', true);
set local role anon;
select is((select pg_catalog.count(*)::integer from public.published_previews), 0, 'draft and pending posts have no anonymous preview');
reset role;

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is(public.publish_post('50000000-0000-4000-8000-000000000001', 'fixture approval'), false, 'Admin at AAL1 cannot publish');
reset role;

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is(public.publish_post('50000000-0000-4000-8000-000000000001', 'fixture approval'), true, 'AAL2 Admin can publish ordinary content');
select is(public.publish_post('50000000-0000-4000-8000-000000000002', 'fixture approval'), false, 'Admin cannot publish high-risk content');
select is((select pg_catalog.count(*)::integer from public.review_submission('70000000-0000-4000-8000-000000000002')), 0, 'Admin cannot inspect high-risk submission source');
select is(public.record_submission_review('70000000-0000-4000-8000-000000000002', 'reviewing', 'high', 'private', null), false, 'Admin cannot assign high risk during review');
select is(public.record_submission_review('70000000-0000-4000-8000-000000000001', 'needs_more_information', 'ordinary', 'Private moderation note', 'Please add supporting detail.'), true, 'AAL2 Admin can request more information on an ordinary submission');
select is(public.read_post_full_body('50000000-0000-4000-8000-000000000002'), null::text, 'Admin cannot read high-risk body');
select is(public.hide_post('50000000-0000-4000-8000-000000000001', 'not owner'), false, 'Admin cannot emergency-hide a post');
select is((select pg_catalog.count(*)::integer from public.published_previews), 1, 'published ordinary post has one safe preview');
select is((select public_area_name from public.published_previews where post_id = '50000000-0000-4000-8000-000000000001'), 'Fixture State', 'public preview resolves the approved public area label');
select is((select public_tag_labels[1] from public.published_previews where post_id = '50000000-0000-4000-8000-000000000001'), 'Fixture Tag', 'public preview resolves only the approved public tag label');
select is((select thumbnail_available from public.published_previews where post_id = '50000000-0000-4000-8000-000000000001'), true, 'preview exposes thumbnail availability without an object path');
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}', true);
select is(public.read_post_full_body('50000000-0000-4000-8000-000000000001'), 'Private full body one.', 'authenticated reader can open a published full body');
select is(public.read_post_full_body('50000000-0000-4000-8000-000000000003'), null::text, 'ordinary reader cannot open a draft body');
select is(public.set_own_reaction('50000000-0000-4000-8000-000000000001'), true, 'active signed-in user may React without email verification');
select is(public.set_own_reaction('50000000-0000-4000-8000-000000000001'), true, 'repeated reaction set is idempotent');
select is((select reaction_count from public.reaction_counts where post_id = '50000000-0000-4000-8000-000000000001'), 1::bigint, 'reaction counter records one reaction per user and post');
select is((select pg_catalog.count(*)::integer from public.my_reaction_post_ids()), 1, 'reaction RPC returns only the caller own post ids');
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
reset role;
set local role authenticated;
select is(public.remove_own_reaction('50000000-0000-4000-8000-000000000001'), false, 'a user cannot remove another user reaction');
reset role;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is(public.remove_own_reaction('50000000-0000-4000-8000-000000000001'), true, 'user can remove their own reaction');
select is((select pg_catalog.count(*)::integer from public.reaction_counts where post_id = '50000000-0000-4000-8000-000000000001'), 0, 'reaction counter is removed when the final user removes their reaction');
reset role;

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select pg_catalog.count(*)::integer from public.my_submission_statuses()), 2, 'submitter sees only their two existing submission status rows');
select is((select safe_reviewer_response from public.my_submission_statuses() where submission_id = '70000000-0000-4000-8000-000000000001'), 'Please add supporting detail.', 'submitter status response is the safe reviewer response');
select is(public.append_submission_information('70000000-0000-4000-8000-000000000001', 'Additional context from submitter'), true, 'submitter can append information when requested');
select ok(public.create_submission('Verified fixture submission', 'Private verified source') is not null, 'verified active account can submit source material');
reset role;

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select pg_catalog.count(*)::integer from public.my_submission_statuses()), 0, 'another user cannot see a submitter status row');
select is(public.append_submission_information('70000000-0000-4000-8000-000000000001', 'Tampered addition'), false, 'another user cannot append to a submission');
select is((select pg_catalog.count(*)::integer from public.my_reaction_post_ids()), 0, 'another user cannot inspect the first user reaction roster');
select is(public.create_submission('Unverified attempt', 'Should not be retained'), null::uuid, 'unverified account cannot submit source material');
reset role;

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is(public.append_submission_information('70000000-0000-4000-8000-000000000003', 'Suspended append attempt'), false, 'suspended submitter cannot append supplementary information');
reset role;

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is(public.set_own_reaction('50000000-0000-4000-8000-000000000001'), true, 'reaction can be recreated before Auth deletion');
reset role;

delete from auth.users where id = '20000000-0000-4000-8000-000000000004';
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is(public.set_own_reaction('50000000-0000-4000-8000-000000000001'), false, 'reaction set fails when the Auth identity row is missing');
select is(public.remove_own_reaction('50000000-0000-4000-8000-000000000001'), false, 'reaction removal fails when the Auth identity row is missing');
reset role;
select is((select pg_catalog.count(*)::integer from public.reaction_counts where post_id = '50000000-0000-4000-8000-000000000001'), 0, 'Auth cascade deletion recounts and removes the final public reaction count');

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is(public.publish_post('50000000-0000-4000-8000-000000000002', 'fixture high risk'), false, 'Owner at AAL1 cannot publish high-risk content');
reset role;

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is(public.publish_post('50000000-0000-4000-8000-000000000002', 'fixture high risk'), true, 'AAL2 Owner can publish high-risk content');
reset role;
select set_config('mmwr.test.first_published_at', (select published_at::text from private.posts where id = '50000000-0000-4000-8000-000000000002'), true);
select set_config('mmwr.test.last_published_at', (select last_published_at::text from private.posts where id = '50000000-0000-4000-8000-000000000002'), true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is(public.hide_post('50000000-0000-4000-8000-000000000002', 'fixture safety hide'), true, 'AAL2 Owner can hide a post with a reason');
select is((select pg_catalog.count(*)::integer from public.published_previews where post_id = '50000000-0000-4000-8000-000000000002'), 0, 'hidden post is removed from public preview');

reset role;
insert into public.reaction_counts (post_id, reaction_count)
values ('50000000-0000-4000-8000-000000000002', 1);
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000004","role":"anon","aal":"aal1"}', true);
set local role anon;
select is((select pg_catalog.count(*)::integer from public.reaction_counts where post_id = '50000000-0000-4000-8000-000000000002'), 0, 'reaction aggregate RLS hides rows without a current public preview');
reset role;
delete from public.reaction_counts where post_id = '50000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is(public.restore_post('50000000-0000-4000-8000-000000000002', 'fixture restore'), true, 'AAL2 Owner can restore a hidden post');
select is((select pg_catalog.count(*)::integer from public.published_previews where post_id = '50000000-0000-4000-8000-000000000002'), 1, 'restored post returns to public preview');
reset role;
select ok(
  (select post_row.published_at = pg_catalog.current_setting('mmwr.test.first_published_at')::timestamptz
      and post_row.last_published_at > pg_catalog.current_setting('mmwr.test.last_published_at')::timestamptz
      and preview.first_published_at = post_row.published_at
      and preview.last_listed_at = post_row.last_published_at
   from private.posts as post_row
   join public.published_previews as preview on preview.post_id = post_row.id
   where post_row.id = '50000000-0000-4000-8000-000000000002'),
  'restore preserves first publication while refreshing the current listing timestamp'
);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is(public.remove_post('50000000-0000-4000-8000-000000000002', 'fixture removal'), true, 'AAL2 Owner can permanently remove a post');
select is((select pg_catalog.count(*)::integer from public.published_previews where post_id = '50000000-0000-4000-8000-000000000002'), 0, 'removed post is absent from public preview');
reset role;

select * from finish();
rollback;
