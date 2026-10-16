create extension if not exists pgtap with schema extensions;

begin;

select plan(19);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('9d000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'reaction-admin@example.invalid', '', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('9d000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'reaction-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('9d000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'reaction-member@example.invalid', '', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

insert into public.profiles (id, username)
values
  ('9d000000-0000-4000-8000-000000000001', 'reactionadmin'),
  ('9d000000-0000-4000-8000-000000000002', 'reactionowner'),
  ('9d000000-0000-4000-8000-000000000003', 'reactionmember');

insert into private.user_roles (user_id, role)
values
  ('9d000000-0000-4000-8000-000000000001', 'admin'),
  ('9d000000-0000-4000-8000-000000000002', 'owner');

insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values
  ('9d000000-0000-4000-8000-000000000011', '9d000000-0000-4000-8000-000000000001', pg_catalog.now(), pg_catalog.now(), 'aal2'),
  ('9d000000-0000-4000-8000-000000000012', '9d000000-0000-4000-8000-000000000002', pg_catalog.now(), pg_catalog.now(), 'aal2');

insert into private.staff_session_activity (session_id, started_at, last_activity_at)
values
  ('9d000000-0000-4000-8000-000000000011', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()),
  ('9d000000-0000-4000-8000-000000000012', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp());

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'private.post_reaction_icon_settings'::regclass)
  and (select relrowsecurity from pg_catalog.pg_class where oid = 'private.post_reaction_icon_audit'::regclass)
  and not has_table_privilege('anon', 'private.post_reaction_icon_settings', 'SELECT')
  and not has_table_privilege('authenticated', 'private.post_reaction_icon_settings', 'SELECT')
  and not has_table_privilege('authenticated', 'private.post_reaction_icon_audit', 'SELECT'),
  'icon settings and audit use RLS with no direct client table access'
);
select ok(
  has_function_privilege('anon', 'public.public_reaction_icon_settings()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.public_reaction_icon_settings()', 'EXECUTE')
  and has_schema_privilege('anon', 'private', 'USAGE')
  and not (select prosecdef from pg_catalog.pg_proc where oid = 'public.public_reaction_icon_settings()'::regprocedure)
  and not has_function_privilege('anon', 'public.owner_get_reaction_icon_settings()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.owner_get_reaction_icon_settings()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.owner_update_reaction_icon_settings(text,text,text,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.owner_update_reaction_icon_settings(text,text,text,text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.owner_update_reaction_icon_settings(text,text,text,text)', 'EXECUTE'),
  'public reads are separated from authenticated Owner-only management functions'
);

set local role anon;
select is(
  public.public_reaction_icon_settings(),
  '{"helpful":"spark","thanks":"heart","support":"hands"}'::jsonb,
  'anonymous readers receive only the fixed public icon choices'
);
reset role;

select set_config('request.jwt.claim.sub', '9d000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '9d000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '9d000000-0000-4000-8000-000000000011',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select throws_ok($$select public.owner_get_reaction_icon_settings()$$, '42501', null, 'Admin cannot read Owner reaction settings');
select is(public.owner_update_reaction_icon_settings('check','spark','heart','Admin attempt'), false, 'Admin cannot change reaction icons');
select is(public.staff_save_dashboard_layout(array['reaction_icons']), false, 'Admin cannot add the Owner-only icon manager to its layout');
reset role;

select set_config('request.jwt.claim.sub', '9d000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"9d000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select throws_ok($$select public.owner_get_reaction_icon_settings()$$, '42501', null, 'ordinary members cannot read Owner reaction settings');
select is(public.owner_update_reaction_icon_settings('check','spark','heart','Member attempt'), false, 'ordinary members cannot change reaction icons');
reset role;

select set_config('request.jwt.claim.sub', '9d000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '9d000000-0000-4000-8000-000000000002', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '9d000000-0000-4000-8000-000000000012',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is(
  public.owner_get_reaction_icon_settings(),
  '{"helpful":"spark","thanks":"heart","support":"hands"}'::jsonb,
  'Owner can read the current settings through the authenticated RPC'
);
select ok(public.staff_get_dashboard_layout() -> 'widget_ids' ? 'reaction_icons', 'Owner dashboard includes the icon manager widget');
reset role;

select set_config('request.jwt.claims', '{"sub":"9d000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2","session_id":"9d000000-0000-4000-8000-000000000012","amr":[{"method":"mfa/totp","timestamp":1000}]}', true);
set local role authenticated;
select is(public.owner_update_reaction_icon_settings('check','spark','heart','Stale TOTP attempt'), false, 'stale TOTP cannot change reaction icons');
reset role;
select is((select pg_catalog.count(*)::integer from private.post_reaction_icon_audit), 0, 'rejected changes leave no audit entry');

select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '9d000000-0000-4000-8000-000000000002', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '9d000000-0000-4000-8000-000000000012',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is(public.owner_update_reaction_icon_settings('check','spark','lightbulb','Approved icon refresh'), true, 'Owner can update valid choices with recent TOTP and a reason');
reset role;
select is(
  public.public_reaction_icon_settings(),
  '{"helpful":"check","thanks":"spark","support":"lightbulb"}'::jsonb,
  'public icon read reflects the saved built-in choices'
);
select is((select pg_catalog.count(*)::integer from private.post_reaction_icon_audit), 1, 'successful change writes one audit entry');
select ok(
  exists(select 1 from private.post_reaction_icon_audit
    where actor_user_id = '9d000000-0000-4000-8000-000000000002'
      and previous_icons = '{"helpful":"spark","thanks":"heart","support":"hands"}'::jsonb
      and new_icons = '{"helpful":"check","thanks":"spark","support":"lightbulb"}'::jsonb
      and reason = 'Approved icon refresh'),
  'audit records actor, prior and new choices, and reason'
);

set local role authenticated;
select is(public.owner_update_reaction_icon_settings('unknown','spark','heart','Invalid choice'), false, 'unsupported icon values are rejected');
select is(public.owner_update_reaction_icon_settings('check','spark','heart','   '), false, 'blank reasons are rejected');
reset role;
select is((select pg_catalog.count(*)::integer from private.post_reaction_icon_audit), 1, 'invalid changes do not append audit entries');

select * from finish();
rollback;
