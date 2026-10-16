create extension if not exists pgtap with schema extensions;

begin;

select plan(17);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('82000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'campaign-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('82000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'campaign-admin@example.invalid', '', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

insert into public.profiles (id, username)
values
  ('82000000-0000-4000-8000-000000000001', 'campaignowner'),
  ('82000000-0000-4000-8000-000000000002', 'campaignadmin');

insert into private.user_roles (user_id, role)
values
  ('82000000-0000-4000-8000-000000000001', 'owner'),
  ('82000000-0000-4000-8000-000000000002', 'admin');

insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values
  ('82000000-0000-4000-8000-000000000011', '82000000-0000-4000-8000-000000000001', pg_catalog.now(), pg_catalog.now(), 'aal2'),
  ('82000000-0000-4000-8000-000000000012', '82000000-0000-4000-8000-000000000002', pg_catalog.now(), pg_catalog.now(), 'aal2');

insert into private.staff_session_activity (session_id, started_at, last_activity_at)
values
  ('82000000-0000-4000-8000-000000000011', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()),
  ('82000000-0000-4000-8000-000000000012', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp());

create temporary table pgtap_campaign_fixture (campaign_id uuid not null);

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'private.owner_campaigns'::regclass)
  and not has_table_privilege('anon', 'private.owner_campaigns', 'SELECT')
  and not has_table_privilege('authenticated', 'private.owner_campaigns', 'SELECT')
  and not has_table_privilege('authenticated', 'private.owner_campaign_audit', 'SELECT'),
  'campaign and audit data are RLS protected with no direct client grants'
);
select is(
  (select pg_catalog.count(*)::integer from information_schema.columns
   where table_schema = 'private' and table_name = 'owner_campaigns'
     and column_name in ('email','phone','contact','contact_name','address','contact_details')),
  0,
  'campaign CRM schema does not store contact details'
);
select ok(
  not has_function_privilege('anon', 'public.owner_list_campaigns(integer)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.owner_list_campaigns(integer)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.owner_save_campaign(uuid,text,numeric,text,text,date,date,text,text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.owner_save_campaign(uuid,text,numeric,text,text,date,date,text,text,text)', 'EXECUTE'),
  'campaign RPCs are authenticated endpoints rather than anonymous endpoints'
);

select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '82000000-0000-4000-8000-000000000002', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '82000000-0000-4000-8000-000000000012',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select throws_ok($$select * from public.owner_list_campaigns(10)$$, '42501', null, 'Admin cannot read Owner campaign records');
select throws_ok($$select public.owner_save_campaign(null,'Fixture Advertiser',100,'flat_fee','home',null,null,'fixture creative','draft','fixture reason')$$, '42501', null, 'Admin cannot create an Owner campaign record');
reset role;

select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '82000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '82000000-0000-4000-8000-000000000011',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
insert into pgtap_campaign_fixture
select public.owner_save_campaign(null,'Fixture Advertiser',1200.50,'cpm','homepage_banner',date '2026-10-01',date '2026-10-31','Synthetic artwork note','quoted','Local test fixture');
select ok((select campaign_id is not null from pgtap_campaign_fixture), 'Owner can save a quoted campaign with recent TOTP');
select is((select quote_amount from private.owner_campaigns where campaign_id = (select campaign_id from pgtap_campaign_fixture)), 1200.50::numeric, 'campaign quote amount is stored exactly');
select is((select quote_currency from private.owner_campaigns where campaign_id = (select campaign_id from pgtap_campaign_fixture)), 'MYR', 'campaign quote currency is fixed to MYR');
select is((select billing_model from private.owner_campaigns where campaign_id = (select campaign_id from pgtap_campaign_fixture)), 'cpm', 'campaign stores a quote model without creating delivery or billing events');
select is((select pg_catalog.count(*)::integer from private.owner_campaign_audit where campaign_id = (select campaign_id from pgtap_campaign_fixture)), 1, 'campaign creation appends one audit entry');
set local role authenticated;
select is((select pg_catalog.count(*)::integer from public.owner_list_campaigns(10)), 1, 'Owner can list campaign records through the protected RPC');
select is((select client_name from public.owner_list_campaigns(10) limit 1), 'Fixture Advertiser', 'Owner list exposes only the saved client name and campaign fields');
reset role;

select set_config('request.jwt.claims', '{"sub":"82000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"82000000-0000-4000-8000-000000000011","amr":[{"method":"mfa/totp","timestamp":1000}]}', true);
set local role authenticated;
select throws_ok($$select * from public.owner_list_campaigns(10)$$, '42501', null, 'stale TOTP cannot read campaign CRM data');
reset role;
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '82000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '82000000-0000-4000-8000-000000000011',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
select throws_ok(
  $$select public.owner_save_campaign((select campaign_id from pgtap_campaign_fixture),'Fixture Advertiser',1200.50,'cpm','homepage_banner',date '2026-10-01',date '2026-10-31','Synthetic artwork note','quoted','no-op fixture')$$,
  '22023', null, 'no-op campaign updates are rejected instead of creating empty audit events'
);
select is((select pg_catalog.count(*)::integer from private.owner_campaign_audit where campaign_id = (select campaign_id from pgtap_campaign_fixture)), 1, 'rejected no-op leaves audit history unchanged');
select throws_ok(
  $$update private.owner_campaign_audit set reason = 'tampered' where campaign_id = (select campaign_id from pgtap_campaign_fixture)$$,
  '42501', null, 'campaign audit history rejects direct mutation'
);
select throws_ok(
  $$truncate private.owner_campaign_audit$$,
  '42501', null, 'campaign audit history rejects truncation'
);

select * from finish();
rollback;
