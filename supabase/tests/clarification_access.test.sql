create extension if not exists pgtap with schema extensions;

begin;

select plan(25);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('83000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'clarification-owner@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('83000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'clarification-admin@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('83000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'clarification-former-staff@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

insert into public.profiles (id, username)
values
  ('83000000-0000-4000-8000-000000000001', 'clarificationowner'),
  ('83000000-0000-4000-8000-000000000002', 'clarificationadmin');

insert into private.user_roles (user_id, role)
values
  ('83000000-0000-4000-8000-000000000001', 'owner'),
  ('83000000-0000-4000-8000-000000000002', 'admin');

insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values
  ('83000000-0000-4000-8000-000000000011', '83000000-0000-4000-8000-000000000001', pg_catalog.now(), pg_catalog.now(), 'aal2'),
  ('83000000-0000-4000-8000-000000000012', '83000000-0000-4000-8000-000000000002', pg_catalog.now(), pg_catalog.now(), 'aal2');

insert into private.staff_session_activity (session_id, started_at, last_activity_at)
values
  ('83000000-0000-4000-8000-000000000011', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()),
  ('83000000-0000-4000-8000-000000000012', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp());

insert into private.areas (id, area_name, area_type)
values ('83000000-0000-4000-8000-000000000021', 'Clarification Fixture State', 'state');

insert into private.posts (
  id, area_id, submitter_id, approved_title, primary_name, public_excerpt,
  full_body, risk_level, status, post_type
) values (
  '83000000-0000-4000-8000-000000000031', '83000000-0000-4000-8000-000000000021',
  '83000000-0000-4000-8000-000000000001', 'Original story fixture', 'Fixture Subject',
  'Public story preview only.', 'Private story body must stay behind login.', 'ordinary', 'pending_review', 'story'
);

create temporary table pgtap_clarification_fixture (clarification_post_id uuid not null);
grant select, insert on pgtap_clarification_fixture to anon, authenticated;
select set_config('test.clarification_updated_at', '', true);

select is(
  (select pg_catalog.count(*)::integer from pg_catalog.pg_class relation
   where relation.relrowsecurity and relation.oid in (
     'private.clarification_settings'::regclass,
     'private.post_relationships'::regclass,
     'private.clarification_audit_events'::regclass,
     'private.clarification_removal_proposals'::regclass
   )),
  4,
  'all private Clarification control, relation, audit, and proposal tables use RLS'
);
select ok(
  not has_table_privilege('anon', 'private.post_relationships', 'SELECT')
  and not has_table_privilege('authenticated', 'private.post_relationships', 'SELECT')
  and not has_table_privilege('authenticated', 'private.clarification_audit_events', 'SELECT')
  and not has_table_privilege('authenticated', 'private.clarification_removal_proposals', 'SELECT'),
  'clients have no direct access to private Clarification links or audit records'
);
select is((select publication_enabled from private.clarification_settings where singleton), false, 'Clarification publication starts disabled');
select ok(
  has_function_privilege('anon', 'public.public_clarification_directory(integer,integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.staff_create_clarification(uuid,text,text,text,uuid[],text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.staff_create_clarification(uuid,text,text,text,uuid[],text)', 'EXECUTE'),
  'public readers can query only the public directory while writes require an authenticated staff role'
);

select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '83000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '83000000-0000-4000-8000-000000000011',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is(public.publish_post('83000000-0000-4000-8000-000000000031', 'publish synthetic story'), true, 'Owner can publish the synthetic parent story');
insert into pgtap_clarification_fixture
select public.staff_create_clarification(
  '83000000-0000-4000-8000-000000000031',
  'Synthetic clarification',
  'A limited public clarification preview.',
  'Private full clarification text remains for signed-in readers.',
  '{}'::uuid[],
  'Create local test clarification'
);
select ok((select clarification_post_id is not null from pgtap_clarification_fixture), 'staff creates a draft linked to an already published story');
reset role;
select set_config('test.clarification_updated_at', (
  select updated_at::text from private.posts
  where id = (select clarification_post_id from pgtap_clarification_fixture)
), true);
set local role authenticated;
select is(
  public.staff_publish_clarification(
    (select clarification_post_id from pgtap_clarification_fixture),
    pg_catalog.current_setting('test.clarification_updated_at')::timestamptz,
    'Gate must stay closed'
  ),
  false,
  'publication RPC cannot bypass the disabled publication gate'
);
reset role;

select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '83000000-0000-4000-8000-000000000002', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '83000000-0000-4000-8000-000000000012',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is(public.owner_set_clarification_publication(true, 'Admin cannot open gate'), false, 'Admin cannot change the Owner-controlled publication gate');
reset role;

select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '83000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '83000000-0000-4000-8000-000000000011',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is(public.owner_set_clarification_publication(true, 'Enable synthetic local publication test'), true, 'Owner with recent TOTP can change publication gate');
reset role;
select is((select pg_catalog.count(*)::integer from private.clarification_audit_events where event_type = 'publication_gate_changed'), 1, 'gate change is audited');
set local role authenticated;
select is(
  public.staff_publish_clarification(
    (select clarification_post_id from pgtap_clarification_fixture),
    pg_catalog.current_setting('test.clarification_updated_at')::timestamptz,
    'Publish synthetic clarification'
  ),
  true,
  'staff can publish the linked clarification only after Owner enables the gate'
);
reset role;

select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"83000000-0000-4000-8000-000000000003","role":"anon","aal":"aal1"}', true);
set local role anon;
select is((select pg_catalog.count(*)::integer from public.public_clarification_directory(10, 0)), 1, 'anonymous reader sees only the now-published Clarification preview');
select is((select content_type from public.public_clarification_directory(10, 0) limit 1), 'clarification', 'public directory identifies the published item type');
select is((select son_title from public.public_clarification_directory(10, 0) limit 1), 'Original story fixture', 'public Clarification links only the approved parent title');
select is((select pg_catalog.count(*)::integer from public.public_clarification_for_story('83000000-0000-4000-8000-000000000031')), 1, 'public reader can resolve the published clarification for its parent story');
select is((select pg_catalog.count(*)::integer from public.public_referenced_story_for_clarification((select clarification_post_id from pgtap_clarification_fixture))), 1, 'public Clarification reference exposes its published parent projection');
reset role;

update private.posts set status = 'temporarily_hidden' where id = '83000000-0000-4000-8000-000000000031';
set local role anon;
select is((select son_post_id from public.public_clarification_directory(10, 0) limit 1), null::uuid, 'a hidden parent story is not returned in the public Clarification list');
select is((select son_title from public.public_clarification_directory(10, 0) limit 1), null::text, 'a hidden parent title is withheld from the public Clarification list');
select is((select son_primary_name from public.public_clarification_directory(10, 0) limit 1), null::text, 'a hidden parent name is withheld from the public Clarification list');
select is((select son_area_name from public.public_clarification_directory(10, 0) limit 1), null::text, 'a hidden parent area is withheld from the public Clarification list');
reset role;

select throws_ok(
  $$update private.post_relationships set created_at = created_at + interval '1 second' where clarification_post_id = (select clarification_post_id from pgtap_clarification_fixture)$$,
  '42501', null, 'relationship binding cannot be changed outside the Owner RPC'
);
select throws_ok(
  $$update private.clarification_audit_events set reason = 'tampered' where event_type = 'created'$$,
  '42501', null, 'Clarification audit records are append-only'
);
insert into private.clarification_audit_events(actor_user_id,event_type,reason)
values ('83000000-0000-4000-8000-000000000004','created','Synthetic retained audit event');
select throws_ok(
  $$delete from private.clarification_audit_events where reason = 'Synthetic retained audit event'$$,
  '42501', null, 'Clarification audit records cannot be deleted'
);
select lives_ok(
  $$delete from auth.users where id = '83000000-0000-4000-8000-000000000004'$$,
  'Auth identity deletion can anonymize its retained Clarification audit actor'
);
select is(
  (select pg_catalog.count(*)::integer from private.clarification_audit_events where actor_user_id is null and reason = 'Synthetic retained audit event'),
  1,
  'Clarification audit history remains after its actor is deleted'
);

select * from finish();
rollback;
