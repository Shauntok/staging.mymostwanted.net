create extension if not exists pgtap with schema extensions;

begin;

select plan(26);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('9a000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'revision-owner@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('9a000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'revision-admin@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('9a000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'revision-member@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

insert into public.profiles (id, username)
values
  ('9a000000-0000-4000-8000-000000000001', 'revisionowner'),
  ('9a000000-0000-4000-8000-000000000002', 'revisionadmin'),
  ('9a000000-0000-4000-8000-000000000003', 'revisionmember');

insert into private.user_roles (user_id, role)
values
  ('9a000000-0000-4000-8000-000000000001', 'owner'),
  ('9a000000-0000-4000-8000-000000000002', 'admin');

insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values
  ('9a000000-0000-4000-8000-000000000011', '9a000000-0000-4000-8000-000000000001', pg_catalog.now(), pg_catalog.now(), 'aal2'),
  ('9a000000-0000-4000-8000-000000000012', '9a000000-0000-4000-8000-000000000002', pg_catalog.now(), pg_catalog.now(), 'aal2');

insert into private.staff_session_activity (session_id, started_at, last_activity_at)
values
  ('9a000000-0000-4000-8000-000000000011', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()),
  ('9a000000-0000-4000-8000-000000000012', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp());

insert into private.areas (id, area_name, area_type)
values ('9a000000-0000-4000-8000-000000000101', 'Revision Fixture State', 'state');

insert into private.tags (id, slug, display_name, is_active)
values
  ('9a000000-0000-4000-8000-000000000201', 'revision-tag-a', 'Revision Tag A', true),
  ('9a000000-0000-4000-8000-000000000202', 'revision-tag-b', 'Revision Tag B', true),
  ('9a000000-0000-4000-8000-000000000203', 'revision-tag-inactive', 'Inactive Revision Tag', false);

insert into private.posts (
  id, area_id, submitter_id, approved_title, primary_name, public_excerpt,
  full_body, risk_level, status, published_at, last_published_at
) values
  ('9a000000-0000-4000-8000-000000000301', '9a000000-0000-4000-8000-000000000101', '9a000000-0000-4000-8000-000000000003', 'Ordinary revision fixture', 'Protected Person A', 'Original excerpt.', 'Original public body.', 'ordinary', 'published', pg_catalog.now(), pg_catalog.now()),
  ('9a000000-0000-4000-8000-000000000302', '9a000000-0000-4000-8000-000000000101', '9a000000-0000-4000-8000-000000000003', 'High risk revision fixture', 'Protected Person B', 'High-risk excerpt.', 'High-risk public body.', 'high', 'published', pg_catalog.now(), pg_catalog.now());

insert into private.post_tags (post_id, tag_id)
values
  ('9a000000-0000-4000-8000-000000000301', '9a000000-0000-4000-8000-000000000201'),
  ('9a000000-0000-4000-8000-000000000302', '9a000000-0000-4000-8000-000000000201');

create temporary table pgtap_revision_state (kind text primary key, value timestamptz);
create temporary table pgtap_revision_events (kind text primary key, event_id bigint);
grant select, insert on pgtap_revision_state, pgtap_revision_events to authenticated;
insert into pgtap_revision_state
select 'ordinary_initial', updated_at from private.posts where id = '9a000000-0000-4000-8000-000000000301';
insert into pgtap_revision_state
select 'high_initial', updated_at from private.posts where id = '9a000000-0000-4000-8000-000000000302';

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'private.post_revision_events'::regclass)
  and not has_table_privilege('anon', 'private.post_revision_events', 'SELECT')
  and not has_table_privilege('authenticated', 'private.post_revision_events', 'SELECT')
  and has_function_privilege('authenticated', 'public.staff_save_post_revision(uuid,timestamp with time zone,text,text,text,uuid[],text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.staff_save_post_revision(uuid,timestamp with time zone,text,text,text,uuid[],text)', 'EXECUTE'),
  'revision history is private and only authenticated sessions can reach the guarded public RPC'
);

select set_config('request.jwt.claim.sub', '9a000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '9a000000-0000-4000-8000-000000000002', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '9a000000-0000-4000-8000-000000000012',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is((select pg_catalog.count(*)::integer from public.staff_list_posts_for_revision(null)), 1, 'Admin list omits the high-risk post');
select is((select pg_catalog.count(*)::integer from public.staff_get_post_for_revision('9a000000-0000-4000-8000-000000000301')), 1, 'Admin can load an ordinary published post for revision');
select is((select pg_catalog.count(*)::integer from public.staff_get_post_for_revision('9a000000-0000-4000-8000-000000000302')), 0, 'Admin cannot load a high-risk post for revision');

insert into pgtap_revision_events
select 'ordinary', public.staff_save_post_revision(
  '9a000000-0000-4000-8000-000000000301',
  (select value from pgtap_revision_state where kind = 'ordinary_initial'),
  '  Revised ordinary title  ', '  Revised public excerpt  ', 'Revised public body.',
  array['9a000000-0000-4000-8000-000000000201'::uuid, '9a000000-0000-4000-8000-000000000202'::uuid],
  '  Synthetic correction reason  '
);
select ok((select event_id is not null from pgtap_revision_events where kind = 'ordinary'), 'Admin can save an ordinary post revision with a recent TOTP');
reset role;

select is((select approved_title from private.posts where id = '9a000000-0000-4000-8000-000000000301'), 'Revised ordinary title', 'revision trims the title');
select is((select public_excerpt from private.posts where id = '9a000000-0000-4000-8000-000000000301'), 'Revised public excerpt', 'revision trims the excerpt');
select is((select full_body from private.posts where id = '9a000000-0000-4000-8000-000000000301'), 'Revised public body.', 'revision updates the approved public body');
select ok(
  (select primary_name = 'Protected Person A' and area_id = '9a000000-0000-4000-8000-000000000101' and risk_level = 'ordinary' and status = 'published'
   from private.posts where id = '9a000000-0000-4000-8000-000000000301'),
  'revision leaves identity, geography, risk and publication state unchanged'
);
select ok(
  (select approved_title = 'Revised ordinary title' and public_excerpt = 'Revised public excerpt'
   from public.published_previews where post_id = '9a000000-0000-4000-8000-000000000301'),
  'public projection updates in the same transaction as the revision'
);
select ok(
  (select before_value ->> 'approved_title' = 'Ordinary revision fixture'
      and after_value ->> 'approved_title' = 'Revised ordinary title'
      and after_value ->> 'full_body' = 'Revised public body.'
      and reason = 'Synthetic correction reason'
   from private.post_revision_events where id = (select event_id from pgtap_revision_events where kind = 'ordinary')),
  'append-only revision audit stores the exact before/after copy and trimmed reason'
);
select is((select pg_catalog.count(*)::integer from private.post_tags where post_id = '9a000000-0000-4000-8000-000000000301'), 2, 'revision applies the selected active tags');
insert into pgtap_revision_state
select 'ordinary_current', updated_at from private.posts where id = '9a000000-0000-4000-8000-000000000301';

select set_config('request.jwt.claim.sub', '9a000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '9a000000-0000-4000-8000-000000000002', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '9a000000-0000-4000-8000-000000000012',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select throws_ok(
  $$select public.staff_save_post_revision('9a000000-0000-4000-8000-000000000302', (select value from pgtap_revision_state where kind = 'high_initial'), 'Admin edit', 'High excerpt.', 'High body.', array['9a000000-0000-4000-8000-000000000201'::uuid], 'Admin attempt')$$,
  '42501', 'Post is unavailable for this reviewer', 'Admin cannot revise a high-risk post'
);
select throws_ok(
  $$select public.staff_save_post_revision('9a000000-0000-4000-8000-000000000301', (select value from pgtap_revision_state where kind = 'ordinary_initial'), 'Stale title', 'Stale excerpt.', 'Stale body.', array['9a000000-0000-4000-8000-000000000201'::uuid], 'Stale form')$$,
  '40001', 'Post changed after it was opened; reload before saving', 'stale version token rejects a concurrent old form'
);
select throws_ok(
  $$select public.staff_save_post_revision('9a000000-0000-4000-8000-000000000301', (select value from pgtap_revision_state where kind = 'ordinary_current'), 'Invalid tag title', 'Excerpt.', 'Body.', array['9a000000-0000-4000-8000-000000000201'::uuid, '9a000000-0000-4000-8000-000000000203'::uuid], 'Inactive tag')$$,
  '22023', 'One or more tags are unavailable', 'new inactive tags cannot be added through a revision'
);
select throws_ok(
  $$select public.staff_save_post_revision('9a000000-0000-4000-8000-000000000301', (select value from pgtap_revision_state where kind = 'ordinary_current'), 'Duplicate tag title', 'Excerpt.', 'Body.', array['9a000000-0000-4000-8000-000000000201'::uuid, '9a000000-0000-4000-8000-000000000201'::uuid], 'Duplicate tag')$$,
  '22023', null, 'duplicate tag selections are rejected'
);
select throws_ok(
  $$select public.staff_save_post_revision('9a000000-0000-4000-8000-000000000301', (select value from pgtap_revision_state where kind = 'ordinary_current'), 'Blank reason title', 'Excerpt.', 'Body.', array['9a000000-0000-4000-8000-000000000201'::uuid], '   ')$$,
  '22023', 'Invalid revision request or staff access', 'blank reasons are rejected'
);
select throws_ok(
  $$select public.staff_save_post_revision('9a000000-0000-4000-8000-000000000301', (select value from pgtap_revision_state where kind = 'ordinary_current'), 'Revised ordinary title', 'Revised public excerpt', 'Revised public body.', array['9a000000-0000-4000-8000-000000000201'::uuid, '9a000000-0000-4000-8000-000000000202'::uuid], 'No change')$$,
  '22023', 'No changes to save', 'identical revisions are rejected without creating duplicate history'
);
reset role;
select is((select pg_catalog.count(*)::integer from private.post_revision_events where post_id = '9a000000-0000-4000-8000-000000000301'), 1, 'rejected revision requests leave the event count unchanged');
set local role authenticated;
select is((select pg_catalog.count(*)::integer from public.staff_list_post_revision_history('9a000000-0000-4000-8000-000000000301', 1000)), 1, 'authorized history reads are clamped to the stored revision rows');
select ok(
  pg_catalog.pg_get_function_result('public.staff_list_post_revision_history(uuid,integer)'::regprocedure) not ilike '%actor_user_id%'
  and pg_catalog.pg_get_function_result('public.staff_list_post_revision_history(uuid,integer)'::regprocedure) not ilike '%actor_uuid%',
  'revision history projection exposes no actor UUID field'
);
reset role;

select throws_ok(
  $$update private.post_revision_events set reason = 'tampered' where id = (select event_id from pgtap_revision_events where kind = 'ordinary')$$,
  '42501', 'post revision history is append-only', 'revision history cannot be edited'
);
select throws_ok(
  $$delete from private.post_revision_events where id = (select event_id from pgtap_revision_events where kind = 'ordinary')$$,
  '42501', 'post revision history is append-only', 'revision history cannot be deleted'
);
select throws_ok(
  $$truncate private.post_revision_events$$,
  '42501', 'post revision history is append-only', 'revision history cannot be truncated'
);

insert into pgtap_revision_state
select 'high_current', updated_at from private.posts where id = '9a000000-0000-4000-8000-000000000302';
select set_config('request.jwt.claim.sub', '9a000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '9a000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '9a000000-0000-4000-8000-000000000011',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is((select pg_catalog.count(*)::integer from public.staff_get_post_for_revision('9a000000-0000-4000-8000-000000000302')), 1, 'Owner can load high-risk content for revision');
select is(
  public.staff_save_post_revision(
    '9a000000-0000-4000-8000-000000000302',
    (select value from pgtap_revision_state where kind = 'high_current'),
    'Owner revised high-risk title', 'Owner revised excerpt.', 'Owner revised body.',
    array['9a000000-0000-4000-8000-000000000201'::uuid], 'Owner-only synthetic review'
  ) is not null,
  true,
  'Owner can revise a high-risk post with recent TOTP'
);
reset role;

select * from finish();
rollback;
