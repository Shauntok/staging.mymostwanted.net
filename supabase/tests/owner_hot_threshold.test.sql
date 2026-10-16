create extension if not exists pgtap with schema extensions;

begin;

select plan(26);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('8e000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'hot-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('8e000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'hot-admin@example.invalid', '', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('8e000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'hot-member@example.invalid', '', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

insert into public.profiles (id, username)
values
  ('8e000000-0000-4000-8000-000000000001', 'hotowner'),
  ('8e000000-0000-4000-8000-000000000002', 'hotadmin'),
  ('8e000000-0000-4000-8000-000000000003', 'hotmember');

insert into private.user_roles (user_id, role)
values
  ('8e000000-0000-4000-8000-000000000001', 'owner'),
  ('8e000000-0000-4000-8000-000000000002', 'admin');

insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values
  ('8e000000-0000-4000-8000-000000000011', '8e000000-0000-4000-8000-000000000001', pg_catalog.now(), pg_catalog.now(), 'aal2'),
  ('8e000000-0000-4000-8000-000000000012', '8e000000-0000-4000-8000-000000000002', pg_catalog.now(), pg_catalog.now(), 'aal2'),
  ('8e000000-0000-4000-8000-000000000013', '8e000000-0000-4000-8000-000000000003', pg_catalog.now(), pg_catalog.now(), 'aal2');

insert into private.staff_session_activity (session_id, started_at, last_activity_at)
values
  ('8e000000-0000-4000-8000-000000000011', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()),
  ('8e000000-0000-4000-8000-000000000012', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()),
  ('8e000000-0000-4000-8000-000000000013', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp());

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'private.analytics_valid_read_settings'::regclass)
  and (select relrowsecurity from pg_catalog.pg_class where oid = 'private.analytics_valid_read_settings_audit'::regclass)
  and not has_table_privilege('anon', 'private.analytics_valid_read_settings', 'SELECT')
  and not has_table_privilege('authenticated', 'private.analytics_valid_read_settings', 'SELECT')
  and not has_table_privilege('authenticated', 'private.analytics_valid_read_settings_audit', 'SELECT'),
  'Hot threshold settings and audit are RLS protected with no direct client reads'
);

select ok(
  has_function_privilege('authenticated', 'public.owner_get_hot_read_minimum()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.owner_get_hot_read_minimum()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.owner_update_hot_read_minimum(integer,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.owner_update_hot_read_minimum(integer,text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.owner_update_hot_read_minimum(integer,text)', 'EXECUTE'),
  'threshold RPCs are authenticated endpoints and the write RPC is not service-role callable'
);

select is(
  (select pg_catalog.count(*)::integer from private.analytics_valid_read_settings
   where singleton and not collection_enabled and not hot_enabled and minimum_reads_24h = 100),
  1,
  'collection and Hot remain disabled with the approved default threshold'
);

set local role anon;
select throws_ok($$select public.owner_get_hot_read_minimum()$$, '42501', null, 'anonymous users cannot read the Owner threshold');
select throws_ok($$select public.owner_update_hot_read_minimum(200,'anonymous')$$, '42501', null, 'anonymous users cannot change the Owner threshold');
reset role;

select set_config('request.jwt.claim.sub', '8e000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '8e000000-0000-4000-8000-000000000002', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '8e000000-0000-4000-8000-000000000012',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select throws_ok($$select public.owner_get_hot_read_minimum()$$, '42501', null, 'Admin cannot read the Owner-only threshold');
select is(public.owner_update_hot_read_minimum(200,'Admin attempt'), false, 'Admin cannot change the Owner-only threshold');
reset role;

select set_config('request.jwt.claim.sub', '8e000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '8e000000-0000-4000-8000-000000000003', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '8e000000-0000-4000-8000-000000000013',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select throws_ok($$select public.owner_get_hot_read_minimum()$$, '42501', null, 'ordinary members cannot read the Owner-only threshold');
select is(public.owner_update_hot_read_minimum(200,'Member attempt'), false, 'ordinary members cannot change the Owner-only threshold');
reset role;

select set_config('request.jwt.claim.sub', '8e000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '8e000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '8e000000-0000-4000-8000-000000000011',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is(public.owner_get_hot_read_minimum(), 100, 'Owner can read the current threshold with recent TOTP');
select is(public.owner_update_hot_read_minimum(null,'invalid threshold'), false, 'Owner cannot set a null threshold');
select is(public.owner_update_hot_read_minimum(0,'invalid threshold'), false, 'Owner cannot set a threshold below the supported range');
select is(public.owner_update_hot_read_minimum(100001,'invalid threshold'), false, 'Owner cannot set a threshold above the supported range');
select is(public.owner_update_hot_read_minimum(200,''), false, 'Owner changes require a non-empty reason');
select is(public.owner_update_hot_read_minimum(200,pg_catalog.repeat('x',501)), false, 'Owner reasons are bounded to 500 characters');
select is(public.owner_update_hot_read_minimum(250,'Local synthetic test'), true, 'Owner can change the threshold with recent TOTP and a reason');
select is(public.owner_get_hot_read_minimum(), 250, 'the authorized threshold change is returned by the read RPC');
reset role;

select is(
  (select pg_catalog.count(*)::integer from private.analytics_valid_read_settings_audit),
  1,
  'one authorized threshold change creates exactly one audit row'
);
select ok(
  (select actor_user_id = '8e000000-0000-4000-8000-000000000001'::uuid
       and previous_minimum = 100 and new_minimum = 250 and reason = 'Local synthetic test'
   from private.analytics_valid_read_settings_audit),
  'the audit row records the Owner, previous/new values, and reason'
);

set local role authenticated;
select is(public.owner_update_hot_read_minimum(250,'No-op attempt'), true, 'a no-op threshold save succeeds without rewriting settings');
reset role;
select is(
  (select pg_catalog.count(*)::integer from private.analytics_valid_read_settings_audit),
  1,
  'a no-op threshold save does not create an audit event'
);

update private.analytics_valid_read_settings
set collection_enabled = true, hot_enabled = true
where singleton;
set local role authenticated;
select throws_ok(
  $$select public.owner_update_hot_read_minimum(300,'Must remain locked')$$,
  '55000', null,
  'threshold changes are locked while collection or Hot is enabled'
);
select is(public.owner_get_hot_read_minimum(), 250, 'the locked update leaves the threshold unchanged');
reset role;
select is(
  (select pg_catalog.count(*)::integer from private.analytics_valid_read_settings_audit),
  1,
  'a locked update does not append an audit event'
);

select set_config('request.jwt.claims',
  '{"sub":"8e000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"8e000000-0000-4000-8000-000000000011","amr":[{"method":"mfa/totp","timestamp":1000}]}',
  true
);
set local role authenticated;
select is(public.owner_update_hot_read_minimum(300,'Stale TOTP attempt'), false, 'stale TOTP cannot change the threshold');
reset role;

set local role authenticated;
select throws_ok(
  $$update private.analytics_valid_read_settings_audit set reason = 'tampered'$$,
  '42501', null,
  'threshold audit rows cannot be edited directly'
);
reset role;

select * from finish();
rollback;
