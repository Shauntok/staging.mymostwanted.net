create extension if not exists pgtap with schema extensions;

begin;

select plan(29);

create temporary table pgtap_initial_dashboard_version as
select pg_catalog.max(version) as version, pg_catalog.count(*) as version_count
from private.staff_dashboard_default_versions;

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('9c000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'layout-admin@example.invalid', '', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('9c000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'layout-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('9c000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'layout-member@example.invalid', '', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

insert into public.profiles (id, username)
values
  ('9c000000-0000-4000-8000-000000000001', 'layoutadmin'),
  ('9c000000-0000-4000-8000-000000000002', 'layoutowner'),
  ('9c000000-0000-4000-8000-000000000003', 'layoutmember');

insert into private.user_roles (user_id, role)
values
  ('9c000000-0000-4000-8000-000000000001', 'admin'),
  ('9c000000-0000-4000-8000-000000000002', 'owner');

insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values
  ('9c000000-0000-4000-8000-000000000011', '9c000000-0000-4000-8000-000000000001', pg_catalog.now(), pg_catalog.now(), 'aal2'),
  ('9c000000-0000-4000-8000-000000000012', '9c000000-0000-4000-8000-000000000002', pg_catalog.now(), pg_catalog.now(), 'aal2');

insert into private.staff_session_activity (session_id, started_at, last_activity_at)
values
  ('9c000000-0000-4000-8000-000000000011', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()),
  ('9c000000-0000-4000-8000-000000000012', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp());

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'private.staff_dashboard_preferences'::regclass)
  and (select relrowsecurity from pg_catalog.pg_class where oid = 'private.staff_dashboard_default_versions'::regclass)
  and not has_table_privilege('anon', 'private.staff_dashboard_preferences', 'SELECT')
  and not has_table_privilege('authenticated', 'private.staff_dashboard_preferences', 'SELECT')
  and not has_table_privilege('authenticated', 'private.staff_dashboard_default_versions', 'SELECT'),
  'layout preferences and default history are RLS protected without client table reads'
);
select ok(
  has_function_privilege('authenticated', 'public.staff_get_dashboard_layout()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.staff_save_dashboard_layout(text[])', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.owner_reset_admin_dashboard_layouts(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.staff_get_dashboard_layout()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.staff_save_dashboard_layout(text[])', 'EXECUTE')
  and not has_function_privilege('anon', 'public.owner_reset_admin_dashboard_layouts(text)', 'EXECUTE'),
  'layout endpoints require authenticated sessions'
);

select set_config('request.jwt.claim.sub', '9c000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '9c000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '9c000000-0000-4000-8000-000000000011',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
create temporary table pgtap_admin_layout as select public.staff_get_dashboard_layout() as value;
select is((select value ->> 'role' from pgtap_admin_layout), 'admin', 'Admin read returns its assigned role');
select is(pg_catalog.jsonb_array_length((select value -> 'widget_ids' from pgtap_admin_layout)), 10, 'Admin default includes the current ten role-appropriate widgets');
select ok(not ((select value -> 'widget_ids' from pgtap_admin_layout) ? 'campaign_crm'), 'Admin default does not expose the Owner CRM widget');
select is(public.staff_save_dashboard_layout(array['reports', 'dashboard_summary', 'recent_operations']), true, 'Admin can save an ordered subset of permitted widgets');
select is((public.staff_get_dashboard_layout() -> 'widget_ids')::text, '["reports", "dashboard_summary", "recent_operations"]', 'saved Admin order is returned exactly');
select is(public.staff_save_dashboard_layout(array['posts']), false, 'Admin cannot save an Owner-only widget');
select is(public.staff_save_dashboard_layout(array['reports', 'reports']), false, 'duplicate widget IDs are rejected');
select is(public.staff_save_dashboard_layout(array['reports', null]::text[]), false, 'null widget IDs are rejected');
select is(public.staff_save_dashboard_layout(array[]::text[]), false, 'empty layouts are rejected by the database');
select is(public.staff_save_dashboard_layout(array['unknown_widget']), false, 'unknown widget IDs are rejected by the database');
select throws_ok($$select public.owner_reset_admin_dashboard_layouts('Admin must not reset')$$, '42501', null, 'Admin cannot reset shared defaults');
reset role;

select set_config('request.jwt.claim.sub', '9c000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"9c000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select throws_ok($$select public.staff_get_dashboard_layout()$$, '42501', null, 'ordinary members cannot read staff layouts');
select is(public.staff_save_dashboard_layout(array['dashboard_summary']), false, 'ordinary members cannot save staff layouts');
reset role;

select set_config('request.jwt.claim.sub', '9c000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '9c000000-0000-4000-8000-000000000002', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '9c000000-0000-4000-8000-000000000012',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
create temporary table pgtap_owner_layout as select public.staff_get_dashboard_layout() as value;
select is((select value ->> 'role' from pgtap_owner_layout), 'owner', 'Owner read returns its assigned role');
select ok((select (value -> 'widget_ids') ? 'campaign_crm' from pgtap_owner_layout), 'Owner receives the current Owner-only CRM widget');
select is(public.staff_save_dashboard_layout(array['campaign_crm', 'dashboard_summary']), true, 'Owner can save a layout containing an Owner widget');
select throws_ok($$select public.owner_reset_admin_dashboard_layouts('   ')$$, '22023', null, 'reset requires a nonblank reason');
reset role;

select set_config('request.jwt.claims', '{"sub":"9c000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2","session_id":"9c000000-0000-4000-8000-000000000012","amr":[{"method":"mfa/totp","timestamp":1000}]}', true);
set local role authenticated;
select throws_ok($$select public.owner_reset_admin_dashboard_layouts('Stale TOTP fixture')$$, '42501', null, 'reset requires a recent TOTP assertion');
reset role;

select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '9c000000-0000-4000-8000-000000000002', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '9c000000-0000-4000-8000-000000000012',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is(public.owner_reset_admin_dashboard_layouts('Restore the approved Admin widget order'), 1, 'Owner reset reports the one Admin layout removed');
select is((public.staff_get_dashboard_layout() -> 'widget_ids')::text, '["campaign_crm", "dashboard_summary"]', 'Owner saved layout remains unchanged after reset');
reset role;

select set_config('test.expected_dashboard_version', (select pg_catalog.max(version)::text from private.staff_dashboard_default_versions), true);
select set_config('request.jwt.claim.sub', '9c000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '9c000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '9c000000-0000-4000-8000-000000000011',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is(public.staff_get_dashboard_layout() ->> 'default_version', current_setting('test.expected_dashboard_version'), 'Admin immediately sees the new version after reset');
select is(pg_catalog.jsonb_array_length(public.staff_get_dashboard_layout() -> 'widget_ids'), 10, 'Admin receives the ten-widget default after reset');
reset role;

select ok(
  (select defaults.version = initial.version + 1
          and defaults.actor_user_id = '9c000000-0000-4000-8000-000000000002'::uuid
          and reason = 'Restore the approved Admin widget order'
          and affected_admin_layouts = 1
   from private.staff_dashboard_default_versions as defaults
   cross join pgtap_initial_dashboard_version as initial
   where defaults.version = (select pg_catalog.max(version) from private.staff_dashboard_default_versions)),
  'reset appends an attributable versioned audit row with its reason and affected count'
);
select ok(
  (select (select pg_catalog.count(*) from private.staff_dashboard_default_versions) = initial.version_count + 1
   from pgtap_initial_dashboard_version as initial),
  'reset creates exactly one new default version'
);
select ok(
  not exists (select 1 from private.staff_dashboard_preferences where staff_role = 'admin')
  and exists (select 1 from private.staff_dashboard_preferences where user_id = '9c000000-0000-4000-8000-000000000002' and staff_role = 'owner'),
  'reset deletes Admin preferences only and retains the Owner preference'
);
select throws_ok(
  $$update private.staff_dashboard_default_versions set reason = 'tampered' where version = (select max(version) from private.staff_dashboard_default_versions)$$,
  '42501', null, 'default version history is append-only'
);
select ok(
  exists (select 1 from pg_catalog.pg_trigger
          where tgrelid = 'private.staff_dashboard_default_versions'::regclass
            and tgname = 'staff_dashboard_default_versions_no_truncate'
            and tgenabled <> 'D'),
  'an enabled trigger protects default history from truncation'
);

select * from finish();
rollback;
