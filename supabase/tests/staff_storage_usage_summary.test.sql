create extension if not exists pgtap with schema extensions;

begin;

select plan(7);

insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('9d000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'storage-admin@example.invalid', '', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('9d000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'storage-member@example.invalid', '', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

insert into private.user_roles (user_id, role)
values ('9d000000-0000-4000-8000-000000000001', 'admin');

select ok(
  has_function_privilege('authenticated', 'public.staff_get_storage_usage_summary()', 'EXECUTE')
  and has_function_privilege('authenticated', 'private.staff_get_storage_usage_summary()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.staff_get_storage_usage_summary()', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.staff_get_storage_usage_summary()', 'EXECUTE'),
  'the summary RPC is callable only through authenticated sessions'
);

select set_config('request.jwt.claim.sub', '9d000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '9d000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
create temporary table pgtap_storage_usage_before as
select * from private.staff_get_storage_usage_summary();
grant select on pgtap_storage_usage_before to authenticated;

insert into storage.objects (id, bucket_id, name, owner_id, metadata)
values
  ('9d000000-0000-4000-8000-000000000011', 'mmwr-evidence-quarantine', 'synthetic/evidence-a.pdf', null, '{"size":1024}'::jsonb),
  ('9d000000-0000-4000-8000-000000000012', 'mmwr-evidence-quarantine', 'synthetic/evidence-b.pdf', null, '{"size":"invalid"}'::jsonb),
  ('9d000000-0000-4000-8000-000000000013', 'mmwr-public-thumbnail-derivatives', 'synthetic/thumb-a.webp', null, '{"size":256}'::jsonb),
  ('9d000000-0000-4000-8000-000000000014', 'mmwr-public-thumbnail-derivatives', 'synthetic/thumb-b.webp', null, '{"size":512}'::jsonb),
  ('9d000000-0000-4000-8000-000000000015', 'avatars', 'synthetic/avatar.png', null, '{"size":4096}'::jsonb);

set local role authenticated;
create temporary table pgtap_storage_usage_after as
select * from public.staff_get_storage_usage_summary();
select is((select evidence_object_count - before.evidence_object_count from pgtap_storage_usage_after after_row cross join pgtap_storage_usage_before before), 2::bigint, 'evidence object count includes only the evidence bucket');
select is((select evidence_total_bytes - before.evidence_total_bytes from pgtap_storage_usage_after after_row cross join pgtap_storage_usage_before before), 1024::numeric, 'malformed sizes add zero and evidence bytes stay separated');
select is((select thumbnail_object_count - before.thumbnail_object_count from pgtap_storage_usage_after after_row cross join pgtap_storage_usage_before before), 2::bigint, 'thumbnail object count includes derivatives');
select is((select thumbnail_total_bytes - before.thumbnail_total_bytes from pgtap_storage_usage_after after_row cross join pgtap_storage_usage_before before), 768::numeric, 'thumbnail bytes stay separated from evidence bytes');
reset role;

select set_config('request.jwt.claim.sub', '9d000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"9d000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select throws_ok($$select * from public.staff_get_storage_usage_summary()$$, '42501', null, 'ordinary members cannot read storage summaries');
reset role;

select set_config('request.jwt.claim.sub', '9d000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '9d000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('method', 'mfa/totp', 'timestamp', 1000))
)::text, true);
set local role authenticated;
select throws_ok($$select * from public.staff_get_storage_usage_summary()$$, '42501', null, 'storage summaries require recent TOTP');
reset role;

select * from finish();
rollback;
