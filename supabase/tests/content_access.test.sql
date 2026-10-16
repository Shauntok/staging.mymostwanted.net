create extension if not exists pgtap with schema extensions;

begin;

select plan(97);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('20000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'submitter@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('20000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'admin@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('20000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'owner@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('20000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'other@example.invalid', '', null, '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('20000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'suspended@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

insert into public.profiles (id, username, display_name, account_state, submission_email_verified_at)
values
  ('20000000-0000-4000-8000-000000000001', 'submitter one', 'Submitter', 'active', pg_catalog.now()),
  ('20000000-0000-4000-8000-000000000002', 'moderator two', 'Moderator', 'active', null),
  ('20000000-0000-4000-8000-000000000003', 'owner three', 'Owner', 'active', null),
  ('20000000-0000-4000-8000-000000000004', 'other four', 'Other', 'active', null),
  ('20000000-0000-4000-8000-000000000005', 'suspended five', 'Suspended', 'suspended', null);

insert into private.user_roles (user_id, role)
values
  ('20000000-0000-4000-8000-000000000002', 'admin'),
  ('20000000-0000-4000-8000-000000000003', 'owner');

insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values
  ('20000000-0000-4000-8000-000000000021', '20000000-0000-4000-8000-000000000002', pg_catalog.now(), pg_catalog.now(), 'aal2'),
  ('20000000-0000-4000-8000-000000000022', '20000000-0000-4000-8000-000000000003', pg_catalog.now(), pg_catalog.now(), 'aal2');
insert into private.staff_session_activity (session_id, started_at, last_activity_at)
values
  ('20000000-0000-4000-8000-000000000021', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()),
  ('20000000-0000-4000-8000-000000000022', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp());

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
  ('50000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Draft fixture', 'Fixture Person Three', 'Draft excerpt must stay private.', 'Draft private body.', 'ordinary', 'draft'),
  ('50000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Fixture Person One', 'Another Public Person', 'Second public excerpt.', 'Private full body four.', 'ordinary', 'pending_review');

insert into private.aliases (id, post_id, alias_text, state)
values
  ('51000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'Approved Fixture Alias', 'approved'),
  ('51000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001', 'Proposed Fixture Alias', 'proposed');

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
      and attribute.attname in ('full_body', 'submitter_id', 'email', 'risk_level', 'object_path', 'thumbnail_object_path', 'internal_notes')
  ),
  'public preview schema contains no body, identity, risk, evidence path, or review notes'
);
select ok(
  not has_function_privilege('authenticated', 'public.create_submission(text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.append_submission_information(uuid,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.register_submission_evidence(uuid,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.read_published_post_body(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.read_published_post_body(uuid)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.publish_post(uuid,text)', 'EXECUTE'),
  'public workflow keeps reading while all user submission write RPCs remain closed'
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
     select pg_catalog.pg_get_functiondef('public.toggle_my_post_reaction(uuid,text)'::regprocedure) as toggle_definition
   )
   select toggle_definition ilike '%area.is_active%'
     and pg_catalog.strpos(toggle_definition, 'auth.users') < pg_catalog.strpos(toggle_definition, 'for key share')
     and pg_catalog.strpos(toggle_definition, 'for key share') < pg_catalog.strpos(toggle_definition, 'private.posts')
     and pg_catalog.strpos(toggle_definition, 'private.posts') < pg_catalog.strpos(toggle_definition, 'for update')
     and pg_catalog.strpos(toggle_definition, 'private.reactions') > pg_catalog.strpos(toggle_definition, 'for update')
     and substring(toggle_definition from pg_catalog.strpos(toggle_definition, 'private.reactions')) ilike '%for update%'
   from function_definitions),
  'typed reaction RPC locks Auth before post and reaction rows'
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

select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '20000000-0000-4000-8000-000000000002', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '20000000-0000-4000-8000-000000000021',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is(public.publish_post('50000000-0000-4000-8000-000000000001', 'fixture approval'), true, 'AAL2 Admin can publish ordinary content');
select is(public.publish_post('50000000-0000-4000-8000-000000000002', 'fixture approval'), false, 'Admin cannot publish high-risk content');
select is((select pg_catalog.count(*)::integer from public.get_staff_submission('70000000-0000-4000-8000-000000000002')), 0, 'Admin cannot inspect high-risk submission source');
select is(public.update_staff_submission_triage('70000000-0000-4000-8000-000000000002', 'reviewing', 'Private moderation note', null), false, 'Admin cannot triage a high-risk submission');
select is(public.update_staff_submission_triage('70000000-0000-4000-8000-000000000001', 'needs_more_information', 'Private moderation note', 'Please add supporting detail.'), true, 'AAL2 Admin can request more information on an ordinary submission');
select is(public.read_published_post_body('50000000-0000-4000-8000-000000000002'), null::text, 'Admin cannot read high-risk body');
select is(public.hide_post('50000000-0000-4000-8000-000000000001', 'not owner'), false, 'Admin cannot emergency-hide a post');
select is((select pg_catalog.count(*)::integer from public.published_previews), 1, 'published ordinary post has one safe preview');
select is((select public_area_name from public.published_previews where post_id = '50000000-0000-4000-8000-000000000001'), 'Fixture State', 'public preview resolves the approved public area label');
select is((select public_tag_labels[1] from public.published_previews where post_id = '50000000-0000-4000-8000-000000000001'), 'Fixture Tag', 'public preview resolves only the approved public tag label');
select is(
  (select pg_catalog.array_agg(tag_id order by tag_id)::text from public.public_sitemap_tag_ids()),
  '{40000000-0000-4000-8000-000000000001}',
  'sitemap tag IDs contain each tag once and only while it is attached to public content'
);
select ok(
  has_function_privilege('anon', 'public.public_sitemap_tag_ids()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.public_sitemap_tag_ids()', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.public_sitemap_tag_ids()', 'EXECUTE'),
  'sitemap tag ID function is granted only to public and authenticated site roles'
);
select is((select thumbnail_available from public.published_previews where post_id = '50000000-0000-4000-8000-000000000001'), false, 'preview stays image-free until a sanitized derivative exists');
select is((select public_thumbnail_count from public.published_previews where post_id = '50000000-0000-4000-8000-000000000001'), 0, 'public preview reports zero deliverable derivatives before scanner generation');
select is(public.publish_post('50000000-0000-4000-8000-000000000004', 'fixture approval'), true, 'AAL2 Admin can publish the title-ranking fixture');
select is(
  (select pg_catalog.count(*)::integer from public.search_published_previews('Fixture Person One', 13, 0)),
  2,
  'public search returns both exact primary-name and title matches'
);
select is(
  (select result.post_id
   from public.search_published_previews('Fixture Person One', 13, 0) with ordinality as result(post_id, approved_title, primary_name, public_excerpt, last_listed_at, public_tag_labels, public_area_name, content_type, position)
   order by result.position
   limit 1),
  '50000000-0000-4000-8000-000000000001'::uuid,
  'exact primary-name match ranks ahead of exact title match'
);
select is(
  (select pg_catalog.count(*)::integer from public.search_published_previews('Approved Fixture Alias', 13, 0)),
  1,
  'approved aliases work as private search keys'
);
select is(
  (select primary_name from public.search_published_previews('Approved Fixture Alias', 13, 0) limit 1),
  'Fixture Person One',
  'alias search results still expose only the approved canonical name'
);
select is(
  (select pg_catalog.count(*)::integer from public.search_published_previews('Proposed Fixture Alias', 13, 0)),
  0,
  'proposed aliases are not searchable before approval'
);
select is(
  (select pg_catalog.count(*)::integer from public.search_published_previews('Private full body one', 13, 0)),
  0,
  'search does not match the authenticated-only full post body'
);
select is(
  (select pg_catalog.count(*)::integer from public.search_published_previews('F', 13, 0)),
  0,
  'single-character queries return no public search results'
);
select ok(
  has_function_privilege('anon', 'public.search_published_previews(text,integer,integer,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.search_published_previews(text,integer,integer,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.recommend_similar_published_previews(text,uuid[],integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.recommend_similar_published_previews(text,uuid[],integer)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.recommend_similar_published_previews(text,uuid[],integer)', 'EXECUTE'),
  'public exact search and server-only fuzzy suggestions have separate grants'
);
select is(
  (select pg_catalog.count(*)::integer from public.public_home_tag_spotlight(12)),
  1,
  'homepage Smart Mix includes tags from published public previews only'
);
select is(
  (select public_post_count from public.public_home_tag_spotlight(12) where tag_label = 'Fixture Tag'),
  1::bigint,
  'homepage Smart Mix count reflects the public post projection'
);
select ok(
  has_column_privilege('anon', 'public.published_previews', 'content_type', 'SELECT')
  and has_column_privilege('authenticated', 'public.published_previews', 'content_type', 'SELECT'),
  'both public reader roles can read only the projection type needed by Smart Mix'
);
reset role;
select is((select public from storage.buckets where id = 'mmwr-public-thumbnail-derivatives'), false, 'thumbnail derivative bucket is private');
select is((select enabled from private.runtime_flags where flag = 'public_thumbnails'), false, 'public thumbnail delivery is disabled by default in the database');
select ok(
  not has_function_privilege('anon', 'public.mmwr_get_scanner_thumbnail_target(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.mmwr_get_scanner_thumbnail_target(uuid,uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.mmwr_get_scanner_thumbnail_target(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.mmwr_register_evidence_thumbnail(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.mmwr_register_evidence_thumbnail(uuid,uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.mmwr_register_evidence_thumbnail(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.mmwr_public_thumbnail_path(uuid,integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.mmwr_public_thumbnail_path(uuid,integer)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.mmwr_public_thumbnail_path(uuid,integer)', 'EXECUTE'),
  'all thumbnail object-path RPCs are restricted to the service role'
);
update private.runtime_flags set enabled = true where flag = 'public_thumbnails';
update private.evidence_metadata
set thumbnail_object_path = '20000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000099.webp'
where id = '60000000-0000-4000-8000-000000000001';
select is((select public_thumbnail_count from public.published_previews where post_id = '50000000-0000-4000-8000-000000000001'), 1, 'published preview count updates after a derivative is registered');
select is(
  public.mmwr_public_thumbnail_path('50000000-0000-4000-8000-000000000001', 0),
  '20000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000099.webp',
  'server-side resolver returns the derivative for a published post'
);
select is(public.mmwr_public_thumbnail_path('50000000-0000-4000-8000-000000000001', 3), null::text, 'thumbnail resolver rejects slots outside the three-image card limit');
select is(public.mmwr_public_thumbnail_path('50000000-0000-4000-8000-000000000099', 0), null::text, 'thumbnail resolver does not expose an unknown post');
update private.runtime_flags set enabled = false where flag = 'public_thumbnails';
select is(public.mmwr_public_thumbnail_path('50000000-0000-4000-8000-000000000001', 0), null::text, 'disabling the database gate immediately prevents derivative resolution');
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000004","role":"anon","aal":"aal1"}', true);
set local role anon;
select is(
  (select pg_catalog.count(*)::integer from public.public_home_tag_spotlight(12)),
  1,
  'anonymous visitors can load homepage Smart Mix tags'
);
reset role;
set local role service_role;
select is(
  (select pg_catalog.count(*)::integer from public.recommend_similar_published_previews('Fixture Person Oen', array[]::uuid[], 5)),
  1,
  'server fuzzy suggestions return a published canonical name for a typo'
);
select is(
  (select pg_catalog.count(*)::integer from public.recommend_similar_published_previews('Fixture Person Oen', array['50000000-0000-4000-8000-000000000001']::uuid[], 5)),
  0,
  'server fuzzy suggestions honor excluded exact-search results'
);
select is(
  (select pg_catalog.count(*)::integer from public.recommend_similar_published_previews('Fix', array[]::uuid[], 5)),
  0,
  'server fuzzy suggestions require at least four query characters'
);
reset role;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}', true);
select is(public.read_published_post_body('50000000-0000-4000-8000-000000000001'), 'Private full body one.', 'authenticated reader can open a published full body');
select is(public.read_published_post_body('50000000-0000-4000-8000-000000000003'), null::text, 'ordinary reader cannot open a draft body');
select is((select accepted from public.toggle_my_post_reaction('50000000-0000-4000-8000-000000000001', 'helpful')), true, 'active signed-in user may React without email verification');
select is((select accepted from public.toggle_my_post_reaction('50000000-0000-4000-8000-000000000001', 'helpful')), true, 'selecting the current reaction toggles it off');
select is(coalesce((select reaction_count from public.reaction_counts where post_id = '50000000-0000-4000-8000-000000000001'), 0::bigint), 0::bigint, 'reaction counter clears after cancellation');
select is((select accepted from public.toggle_my_post_reaction('50000000-0000-4000-8000-000000000001', 'thanks')), true, 'user can select a different supported reaction');
select is((select pg_catalog.count(*)::integer from public.my_reaction_post_ids()), 1, 'reaction RPC returns only the caller own post ids');
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
reset role;
set local role authenticated;
select ok(not has_function_privilege('authenticated', 'public.set_own_reaction(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.remove_own_reaction(uuid)', 'EXECUTE'),
  'legacy one-way reaction RPCs are disabled');
reset role;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select accepted from public.toggle_my_post_reaction('50000000-0000-4000-8000-000000000001', 'thanks')), true, 'user can remove their own reaction by toggling it');
select is((select pg_catalog.count(*)::integer from public.reaction_counts where post_id = '50000000-0000-4000-8000-000000000001'), 0, 'reaction counter is removed when the final user removes their reaction');
reset role;

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select pg_catalog.count(*)::integer from public.my_submission_statuses()), 2, 'submitter sees only their two existing submission status rows');
select is((select safe_reviewer_response from public.my_submission_statuses() where submission_id = '70000000-0000-4000-8000-000000000001'), 'Please add supporting detail.', 'submitter status response is the safe reviewer response');
select throws_ok($$select public.append_submission_information('70000000-0000-4000-8000-000000000001', 'Additional context from submitter')$$, '42501', null, 'verified submitter cannot append while the submission entry is closed');
select throws_ok($$select public.create_submission('Verified fixture submission', 'Private verified source')$$, '42501', null, 'verified submitter cannot create a submission while the entry is closed');
reset role;

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select pg_catalog.count(*)::integer from public.my_submission_statuses()), 0, 'another user cannot see a submitter status row');
select throws_ok($$select public.append_submission_information('70000000-0000-4000-8000-000000000001', 'Tampered addition')$$, '42501', null, 'another user cannot invoke the closed supplementary-information RPC');
select is((select pg_catalog.count(*)::integer from public.my_reaction_post_ids()), 0, 'another user cannot inspect the first user reaction roster');
select throws_ok($$select public.create_submission('Unverified attempt', 'Should not be retained')$$, '42501', null, 'unverified user cannot invoke the closed submission RPC');
reset role;

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select throws_ok($$select public.append_submission_information('70000000-0000-4000-8000-000000000003', 'Suspended append attempt')$$, '42501', null, 'suspended user cannot invoke the closed supplementary-information RPC');
reset role;

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select accepted from public.toggle_my_post_reaction('50000000-0000-4000-8000-000000000001', 'support')), true, 'reaction can be recreated before Auth deletion');
reset role;

delete from auth.users where id = '20000000-0000-4000-8000-000000000004';
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select accepted from public.toggle_my_post_reaction('50000000-0000-4000-8000-000000000001', 'support')), false, 'reaction set fails when the Auth identity row is missing');
select is((select accepted from public.toggle_my_post_reaction('50000000-0000-4000-8000-000000000001', 'thanks')), false, 'reaction removal fails when the Auth identity row is missing');
reset role;
select is((select pg_catalog.count(*)::integer from public.reaction_counts where post_id = '50000000-0000-4000-8000-000000000001'), 0, 'Auth cascade deletion recounts and removes the final public reaction count');

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is(public.publish_post('50000000-0000-4000-8000-000000000002', 'fixture high risk'), false, 'Owner at AAL1 cannot publish high-risk content');
reset role;

select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '20000000-0000-4000-8000-000000000003', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '20000000-0000-4000-8000-000000000022',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is(public.publish_post('50000000-0000-4000-8000-000000000002', 'fixture high risk'), true, 'AAL2 Owner can publish high-risk content');
reset role;
select set_config('mmwr.test.first_published_at', (select published_at::text from private.posts where id = '50000000-0000-4000-8000-000000000002'), true);
select set_config('mmwr.test.last_published_at', (select last_published_at::text from private.posts where id = '50000000-0000-4000-8000-000000000002'), true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '20000000-0000-4000-8000-000000000003', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '20000000-0000-4000-8000-000000000022',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
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
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '20000000-0000-4000-8000-000000000003', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '20000000-0000-4000-8000-000000000022',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
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
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '20000000-0000-4000-8000-000000000003', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '20000000-0000-4000-8000-000000000022',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is(public.remove_post('50000000-0000-4000-8000-000000000002', 'fixture removal'), true, 'AAL2 Owner can permanently remove a post');
select is((select pg_catalog.count(*)::integer from public.published_previews where post_id = '50000000-0000-4000-8000-000000000002'), 0, 'removed post is absent from public preview');
reset role;

-- A controlled 13-tag public dataset exercises each homepage sorting mode and
-- the 12-slot cap. It exists only inside this test transaction and rolls back.
insert into private.tags (id, slug, display_name)
select
  ('41000000-0000-4000-8000-' || pg_catalog.lpad(tag_number::text, 12, '0'))::uuid,
  'mix-fixture-' || tag_number::text,
  'Mix Tag ' || pg_catalog.lpad(tag_number::text, 2, '0')
from pg_catalog.generate_series(1, 13) as tag_numbers(tag_number);

with fixture_posts as (
  select tag_number, post_number,
    pg_catalog.row_number() over (order by tag_number, post_number)::bigint as fixture_number
  from pg_catalog.generate_series(1, 13) as tag_numbers(tag_number)
  cross join lateral pg_catalog.generate_series(1, 14 - tag_number) as post_numbers(post_number)
)
insert into private.posts (
  id, area_id, submitter_id, approved_title, primary_name, public_excerpt,
  full_body, risk_level, status
)
select
  ('52000000-0000-4000-8000-' || pg_catalog.lpad(fixture_number::text, 12, '0'))::uuid,
  '30000000-0000-4000-8000-000000000001'::uuid,
  '20000000-0000-4000-8000-000000000001'::uuid,
  'Mix Fixture Post ' || fixture_number::text,
  'Mix Fixture Person ' || fixture_number::text,
  'Synthetic public excerpt for homepage sorting.',
  'Synthetic private body for homepage sorting.',
  'ordinary', 'approved'
from fixture_posts;

with fixture_posts as (
  select tag_number,
    pg_catalog.row_number() over (order by tag_number, post_number)::bigint as fixture_number
  from pg_catalog.generate_series(1, 13) as tag_numbers(tag_number)
  cross join lateral pg_catalog.generate_series(1, 14 - tag_number) as post_numbers(post_number)
)
insert into private.post_tags (post_id, tag_id)
select
  ('52000000-0000-4000-8000-' || pg_catalog.lpad(fixture_number::text, 12, '0'))::uuid,
  ('41000000-0000-4000-8000-' || pg_catalog.lpad(tag_number::text, 12, '0'))::uuid
from fixture_posts;

update private.posts as post_row
set status = 'published',
    published_at = pg_catalog.statement_timestamp(),
    last_published_at = pg_catalog.statement_timestamp()
where post_row.id::text like '52000000-0000-4000-8000-%';

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '20000000-0000-4000-8000-000000000003', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '20000000-0000-4000-8000-000000000022',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is(public.owner_update_home_tag_settings('smart_mix', '{}'::uuid[], 'Smart Mix synthetic data test'), true, 'Owner can select Smart Mix using recent TOTP');
reset role;
select is((select pg_catalog.count(*)::integer from public.public_home_tag_spotlight(12)), 12, 'Smart Mix fills all twelve homepage slots from a rich public dataset');
select is((select pg_catalog.count(distinct tag_id)::integer from public.public_home_tag_spotlight(12)), 12, 'Smart Mix never repeats a Tag across its segments');
select is(
  (select pg_catalog.array_agg(item.tag_label order by item.position)
   from public.public_home_tag_spotlight(12) with ordinality as item(tag_id, tag_label, public_post_count, position)),
  array['Mix Tag 01','Mix Tag 02','Mix Tag 03','Mix Tag 04','Mix Tag 13','Mix Tag 12','Mix Tag 11','Mix Tag 10','Fixture Tag','Mix Tag 09','Mix Tag 08','Mix Tag 07']::text[],
  'Smart Mix orders popular, recent, and lower-exposure segments without duplicate Tags'
);

set local role authenticated;
select is(public.owner_update_home_tag_settings('most_posts', '{}'::uuid[], 'Most Posts synthetic data test'), true, 'Owner can select Most Posts using recent TOTP');
reset role;
select is(
  (select pg_catalog.array_agg(item.tag_label order by item.position)
   from public.public_home_tag_spotlight(12) with ordinality as item(tag_id, tag_label, public_post_count, position)),
  array['Mix Tag 01','Mix Tag 02','Mix Tag 03','Mix Tag 04','Mix Tag 05','Mix Tag 06','Mix Tag 07','Mix Tag 08','Mix Tag 09','Mix Tag 10','Mix Tag 11','Mix Tag 12']::text[],
  'Most Posts orders all twelve visible slots by public post count'
);

set local role authenticated;
select is(public.owner_update_home_tag_settings('manual', array[
  '41000000-0000-4000-8000-000000000008'::uuid,
  '41000000-0000-4000-8000-000000000002'::uuid
], 'Manual synthetic data test'), true, 'Owner can select a manual Tag order using recent TOTP');
select is(public.owner_update_home_tag_settings('manual', array[
  '41000000-0000-4000-8000-000000000014'::uuid
], 'Reject unpublished Tag test'), false, 'manual order rejects Tags with no public posts');
select is(public.owner_update_home_tag_settings('manual', array[
  '41000000-0000-4000-8000-000000000008'::uuid,
  '41000000-0000-4000-8000-000000000008'::uuid
], 'Reject duplicate Tag test'), false, 'manual order rejects duplicate Tag IDs');
reset role;
select is(
  (select pg_catalog.array_agg(item.tag_label order by item.position)
   from public.public_home_tag_spotlight(12) with ordinality as item(tag_id, tag_label, public_post_count, position)),
  array['Mix Tag 08','Mix Tag 02','Mix Tag 01','Mix Tag 03','Mix Tag 04','Mix Tag 05','Mix Tag 06','Mix Tag 07','Mix Tag 09','Mix Tag 10','Mix Tag 11','Mix Tag 12']::text[],
  'manual order is preserved and remaining slots fall back to Most Posts'
);
select is((select pg_catalog.count(*)::integer from public.public_home_tag_spotlight(0)), 1, 'homepage Tag limit clamps zero to one');
select is((select pg_catalog.count(*)::integer from public.public_home_tag_spotlight(99)), 12, 'homepage Tag limit clamps large values to twelve');

-- Verify that current publication and evidence visibility are rechecked when a
-- thumbnail is resolved, even after a derivative path was previously stored.
update private.runtime_flags set enabled = true where flag = 'public_thumbnails';
set local role service_role;
select is(
  public.mmwr_public_thumbnail_path('50000000-0000-4000-8000-000000000001', 0),
  '20000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000099.webp',
  'eligible derivative resolves while the post remains public'
);
reset role;
update private.evidence_metadata set visibility = 'internal_only'
where id = '60000000-0000-4000-8000-000000000001';
set local role service_role;
select is(public.mmwr_public_thumbnail_path('50000000-0000-4000-8000-000000000001', 0), null::text, 'switching evidence to internal-only immediately blocks derivative resolution');
reset role;
update private.evidence_metadata set visibility = 'public_thumbnail'
where id = '60000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '20000000-0000-4000-8000-000000000003', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '20000000-0000-4000-8000-000000000022',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is(public.hide_post('50000000-0000-4000-8000-000000000001', 'thumbnail revocation fixture'), true, 'Owner can hide the thumbnail fixture post');
reset role;
set local role service_role;
select is(public.mmwr_public_thumbnail_path('50000000-0000-4000-8000-000000000001', 0), null::text, 'hiding a post immediately blocks its derivative resolver');
reset role;

select * from finish();
rollback;
