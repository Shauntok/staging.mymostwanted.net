create extension if not exists pgtap with schema extensions;

begin;

select plan(15);

select vault.create_secret(
  pg_catalog.repeat('s', 64),
  'mmwr_ip_block_hmac_secret',
  'Synthetic pgTAP-only secret; transaction rollback removes it',
  null
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '86000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'ip-block-owner@example.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()
);

insert into public.profiles (id, username)
values ('86000000-0000-4000-8000-000000000001', 'ipblockowner');

insert into private.user_roles (user_id, role)
values ('86000000-0000-4000-8000-000000000001', 'owner');

insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values ('86000000-0000-4000-8000-000000000011', '86000000-0000-4000-8000-000000000001', pg_catalog.now(), pg_catalog.now(), 'aal2');

insert into private.staff_session_activity (session_id, started_at, last_activity_at)
values ('86000000-0000-4000-8000-000000000011', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp());

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'private.owner_ip_blocks'::regclass)
  and (select relrowsecurity from pg_catalog.pg_class where oid = 'private.owner_ip_block_audit'::regclass),
  'active IP blocks and their audit table both use RLS'
);
select ok(
  not has_table_privilege('anon', 'private.owner_ip_blocks', 'SELECT')
  and not has_table_privilege('authenticated', 'private.owner_ip_blocks', 'SELECT')
  and not has_table_privilege('authenticated', 'private.owner_ip_block_audit', 'SELECT'),
  'clients cannot directly inspect IP fingerprints or block audit'
);
select ok(
  has_function_privilege('authenticated', 'public.owner_add_ip_block(text,text,timestamptz,text,timestamptz)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.owner_add_ip_block(text,text,timestamptz)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.owner_ip_block_nonself_proof_valid(uuid,text,text,timestamptz,timestamptz,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.mmwr_is_ip_blocked(text)', 'EXECUTE'),
  'Owner writes require the proof-bearing RPC; legacy writes, proof helpers, and block probing are unavailable to clients'
);
select ok(
  has_schema_privilege('anon', 'private', 'USAGE')
  and has_function_privilege('anon', 'private.enforce_owner_ip_block_data_api_single_header()', 'EXECUTE')
  and has_function_privilege('authenticated', 'private.enforce_owner_ip_block_data_api_single_header()', 'EXECUTE')
  and has_function_privilege('service_role', 'private.enforce_owner_ip_block_data_api_single_header()', 'EXECUTE')
  and not has_function_privilege('authenticator', 'private.enforce_owner_ip_block_data_api_single_header()', 'EXECUTE')
  and not has_schema_privilege('authenticator', 'private', 'USAGE')
  and not has_table_privilege('anon', 'private.owner_ip_blocks', 'SELECT')
  and not has_table_privilege('anon', 'private.owner_ip_block_audit', 'SELECT'),
  'PostgREST request roles can execute the pre-request hook; authenticator cannot access the private schema'
);
select ok(
  not has_function_privilege('anon', 'private.enforce_owner_ip_block_data_api()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.enforce_owner_ip_block_data_api()', 'EXECUTE')
  and not has_function_privilege('service_role', 'private.enforce_owner_ip_block_data_api()', 'EXECUTE')
  and not has_function_privilege('authenticator', 'private.enforce_owner_ip_block_data_api()', 'EXECUTE'),
  'the legacy IP-block checker is callable only inside its definer wrapper'
);
select is((select pg_catalog.count(*)::integer from vault.decrypted_secrets where name = 'mmwr_ip_block_hmac_secret'), 1, 'the HMAC test secret is available only inside this rollback-only fixture');

select set_config('app.settings.mmwr_ip_block_trusted_client_ip_header', 'cf-connecting-ip', true);
select set_config('request.headers', '{"cf-connecting-ip":"198.51.100.11"}', true);
select set_config('test.ip_block_reason', 'Synthetic local test block', true);
select set_config('test.ip_block_issued_at', pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp())::text, true);
select set_config('test.ip_block_expires_at', (pg_catalog.current_setting('test.ip_block_issued_at')::timestamptz + interval '1 hour')::text, true);
select set_config('test.ip_block_fingerprint', (
  select pg_catalog.encode(extensions.hmac(
    pg_catalog.convert_to('mmwr:owner-ip-block:v1:203.0.113.24', 'UTF8'),
    pg_catalog.convert_to(secret.decrypted_secret, 'UTF8'), 'sha256'
  ), 'hex')
  from vault.decrypted_secrets as secret where secret.name = 'mmwr_ip_block_hmac_secret'
), true);
select set_config('test.ip_block_proof', (
  select pg_catalog.encode(extensions.hmac(
    pg_catalog.convert_to(
      'mmwr:owner-ip-block:nonself:v1:'
      || '86000000-0000-4000-8000-000000000001' || ':'
      || pg_catalog.current_setting('test.ip_block_fingerprint') || ':'
      || pg_catalog.floor(extract(epoch from pg_catalog.current_setting('test.ip_block_expires_at')::timestamptz) * 1000)::bigint::text || ':'
      || pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.btrim(pg_catalog.current_setting('test.ip_block_reason')), 'UTF8'), 'sha256'), 'hex') || ':'
      || pg_catalog.floor(extract(epoch from pg_catalog.current_setting('test.ip_block_issued_at')::timestamptz) * 1000)::bigint::text,
      'UTF8'
    ),
    pg_catalog.convert_to(secret.decrypted_secret, 'UTF8'), 'sha256'
  ), 'hex')
  from vault.decrypted_secrets as secret where secret.name = 'mmwr_ip_block_hmac_secret'
), true);
select set_config('test.ip_block_self_fingerprint', (
  select pg_catalog.encode(extensions.hmac(
    pg_catalog.convert_to('mmwr:owner-ip-block:v1:198.51.100.11', 'UTF8'),
    pg_catalog.convert_to(secret.decrypted_secret, 'UTF8'), 'sha256'
  ), 'hex')
  from vault.decrypted_secrets as secret where secret.name = 'mmwr_ip_block_hmac_secret'
), true);

select set_config('request.jwt.claim.sub', '86000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '86000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '86000000-0000-4000-8000-000000000011',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select throws_ok(
  $$select public.owner_add_ip_block(pg_catalog.current_setting('test.ip_block_fingerprint'), pg_catalog.current_setting('test.ip_block_reason'), pg_catalog.current_setting('test.ip_block_expires_at')::timestamptz, pg_catalog.repeat('0', 64), pg_catalog.current_setting('test.ip_block_issued_at')::timestamptz)$$,
  '42501', null, 'a forged HMAC proof cannot create a block'
);
select set_config('request.headers', '{"cf-connecting-ip":"198.51.100.11, 10.0.0.7"}', true);
select throws_ok(
  $$select public.owner_add_ip_block(pg_catalog.current_setting('test.ip_block_fingerprint'), pg_catalog.current_setting('test.ip_block_reason'), pg_catalog.current_setting('test.ip_block_expires_at')::timestamptz, pg_catalog.current_setting('test.ip_block_proof'), pg_catalog.current_setting('test.ip_block_issued_at')::timestamptz)$$,
  '42501', null, 'a comma-separated proxy chain fails closed'
);
select set_config('request.headers', '{"cf-connecting-ip":"198.51.100.11"}', true);
select throws_ok(
  $$select public.owner_add_ip_block(pg_catalog.current_setting('test.ip_block_self_fingerprint'), pg_catalog.current_setting('test.ip_block_reason'), pg_catalog.current_setting('test.ip_block_expires_at')::timestamptz, pg_catalog.current_setting('test.ip_block_proof'), pg_catalog.current_setting('test.ip_block_issued_at')::timestamptz)$$,
  '42501', null, 'Owner cannot block the address currently carrying the request'
);
select is(
  public.owner_add_ip_block(
    pg_catalog.current_setting('test.ip_block_fingerprint'),
    pg_catalog.current_setting('test.ip_block_reason'),
    pg_catalog.current_setting('test.ip_block_expires_at')::timestamptz,
    pg_catalog.current_setting('test.ip_block_proof'),
    pg_catalog.current_setting('test.ip_block_issued_at')::timestamptz
  ) is not null,
  true,
  'Owner with fresh TOTP and valid non-self proof can create one block'
);
select throws_ok(
  $$select public.owner_add_ip_block(pg_catalog.current_setting('test.ip_block_fingerprint'), pg_catalog.current_setting('test.ip_block_reason'), pg_catalog.current_setting('test.ip_block_expires_at')::timestamptz, pg_catalog.current_setting('test.ip_block_proof'), pg_catalog.current_setting('test.ip_block_issued_at')::timestamptz)$$,
  '23505', null, 'a duplicate active fingerprint cannot create a second block'
);
select is((select pg_catalog.count(*)::integer from public.owner_list_ip_blocks()), 1, 'Owner recent-TOTP list shows the single active synthetic block');
reset role;

select is((select pg_catalog.count(*)::integer from private.owner_ip_blocks), 1, 'valid request stores one HMAC fingerprint');
select is((select pg_catalog.count(*)::integer from private.owner_ip_block_audit where action = 'created'), 1, 'successful block creation writes one audit row');
select ok(
  not exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'private.owner_ip_block_audit'::regclass
      and attname in ('fingerprint', 'ip_address', 'raw_ip') and not attisdropped
  ),
  'IP audit schema contains no address or fingerprint column'
);

select * from finish();
rollback;
