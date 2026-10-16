-- Add a database-side guard for direct PostgREST/Data API traffic. This is
-- intentionally inert until a separate database setting is explicitly enabled.
create extension if not exists supabase_vault with schema vault;

-- Vault is used only from this SECURITY DEFINER hook. Keep decrypted secrets
-- unavailable to API roles, including Supabase's PostgREST authenticator.
revoke all on schema vault from public, anon, authenticated, service_role, authenticator;
revoke all on table vault.secrets from public, anon, authenticated, service_role, authenticator;
revoke all on table vault.decrypted_secrets from public, anon, authenticated, service_role, authenticator;

create or replace function private.enforce_owner_ip_block_data_api()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_headers jsonb;
  v_trusted_ip_header text;
  v_raw_ip text;
  v_client_ip inet;
  v_hmac_secret text;
  v_secret_count bigint;
  v_fingerprint text;
  v_request_role text;
begin
  if pg_catalog.current_setting('app.settings.mmwr_ip_block_enabled', true) is distinct from 'true' then
    return;
  end if;

  -- Trusted server-to-server calls use the Supabase secret/service-role key
  -- and do not represent an end user's source address. PostgREST sets the
  -- request role; JWT claims are checked first for legacy signed API keys.
  -- Keep browser-facing anon/authenticated requests subject to this guard.
  begin
    v_request_role := coalesce(
      nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
      nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
      nullif(pg_catalog.current_setting('role', true), '')
    );
  exception when others then
    v_request_role := null;
  end;

  if v_request_role = 'service_role' then
    return;
  end if;

  if v_request_role is null or v_request_role not in ('anon', 'authenticated') then
    raise sqlstate 'PGRST' using
      message = pg_catalog.jsonb_build_object(
        'code', 'MMWR_IP_BLOCK_UNAVAILABLE', 'message', 'Service unavailable.', 'details', null, 'hint', null
      )::text,
      detail = pg_catalog.jsonb_build_object('status', 503)::text;
  end if;

  begin
    v_headers := pg_catalog.current_setting('request.headers', true)::jsonb;
  exception when others then
    raise sqlstate 'PGRST' using
      message = pg_catalog.jsonb_build_object(
        'code', 'MMWR_IP_BLOCK_UNAVAILABLE', 'message', 'Service unavailable.', 'details', null, 'hint', null
      )::text,
      detail = pg_catalog.jsonb_build_object('status', 503)::text;
  end;

  -- Keep this header in lockstep with MMWR_IP_BLOCK_TRUSTED_CLIENT_IP_HEADER.
  -- The authenticator setting is explicitly configured per deployment and
  -- accepts only the same small allowlist as the server-side application.
  v_trusted_ip_header := pg_catalog.lower(pg_catalog.btrim(coalesce(
    pg_catalog.current_setting('app.settings.mmwr_ip_block_trusted_client_ip_header', true), ''
  )));
  if v_trusted_ip_header not in ('x-vercel-forwarded-for', 'cf-connecting-ip', 'x-mmwr-client-ip') then
    raise sqlstate 'PGRST' using
      message = pg_catalog.jsonb_build_object(
        'code', 'MMWR_IP_BLOCK_UNAVAILABLE', 'message', 'Service unavailable.', 'details', null, 'hint', null
      )::text,
      detail = pg_catalog.jsonb_build_object('status', 503)::text;
  end if;

  -- A single address is expected for the selected trusted ingress header.
  -- If a provider supplies a chain, use its first address only after Staging
  -- has verified that the edge overwrites the header rather than appending
  -- caller-controlled values.
  v_raw_ip := pg_catalog.btrim(pg_catalog.split_part(coalesce(v_headers->>v_trusted_ip_header, ''), ',', 1));
  if v_raw_ip = '' then
    raise sqlstate 'PGRST' using
      message = pg_catalog.jsonb_build_object(
        'code', 'MMWR_IP_BLOCK_UNAVAILABLE', 'message', 'Service unavailable.', 'details', null, 'hint', null
      )::text,
      detail = pg_catalog.jsonb_build_object('status', 503)::text;
  end if;

  begin
    v_client_ip := v_raw_ip::inet;
  exception when others then
    raise sqlstate 'PGRST' using
      message = pg_catalog.jsonb_build_object(
        'code', 'MMWR_IP_BLOCK_UNAVAILABLE', 'message', 'Service unavailable.', 'details', null, 'hint', null
      )::text,
      detail = pg_catalog.jsonb_build_object('status', 503)::text;
  end;

  if pg_catalog.masklen(v_client_ip) <> (case pg_catalog.family(v_client_ip) when 4 then 32 else 128 end) then
    raise sqlstate 'PGRST' using
      message = pg_catalog.jsonb_build_object(
        'code', 'MMWR_IP_BLOCK_UNAVAILABLE', 'message', 'Service unavailable.', 'details', null, 'hint', null
      )::text,
      detail = pg_catalog.jsonb_build_object('status', 503)::text;
  end if;

  begin
    execute $query$
      select pg_catalog.count(*)::bigint, pg_catalog.min(secret.decrypted_secret)
      from vault.decrypted_secrets as secret
      where secret.name = 'mmwr_ip_block_hmac_secret'
    $query$ into v_secret_count, v_hmac_secret;
  exception when others then
    raise sqlstate 'PGRST' using
      message = pg_catalog.jsonb_build_object(
        'code', 'MMWR_IP_BLOCK_UNAVAILABLE', 'message', 'Service unavailable.', 'details', null, 'hint', null
      )::text,
      detail = pg_catalog.jsonb_build_object('status', 503)::text;
  end;

  if v_secret_count <> 1 or v_hmac_secret is null
    or pg_catalog.octet_length(pg_catalog.convert_to(v_hmac_secret, 'UTF8')) < 32 then
    raise sqlstate 'PGRST' using
      message = pg_catalog.jsonb_build_object(
        'code', 'MMWR_IP_BLOCK_UNAVAILABLE', 'message', 'Service unavailable.', 'details', null, 'hint', null
      )::text,
      detail = pg_catalog.jsonb_build_object('status', 503)::text;
  end if;

  v_fingerprint := pg_catalog.encode(
    extensions.hmac(
      pg_catalog.convert_to('mmwr:owner-ip-block:v1:' || pg_catalog.host(v_client_ip), 'UTF8'),
      pg_catalog.convert_to(v_hmac_secret, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  if private.mmwr_is_ip_blocked(v_fingerprint) then
    raise insufficient_privilege using message = 'Access unavailable.';
  end if;
end;
$function$;

revoke all on function private.enforce_owner_ip_block_data_api() from public, anon, authenticated, service_role, authenticator;
grant usage on schema private to authenticator;
grant execute on function private.enforce_owner_ip_block_data_api() to anon, authenticated, service_role, authenticator;

-- The fingerprint check is a service-side primitive, not a public status oracle.
revoke all on function public.mmwr_is_ip_blocked(text) from public, anon, authenticated, service_role;
grant execute on function public.mmwr_is_ip_blocked(text) to service_role;

do $block$
declare
  v_existing_hook text;
begin
  select pg_catalog.split_part(setting.value, '=', 2)
  into v_existing_hook
  from pg_catalog.pg_db_role_setting as role_setting
  cross join lateral pg_catalog.unnest(role_setting.setconfig) as setting(value)
  where role_setting.setrole = 'authenticator'::pg_catalog.regrole
    and setting.value like 'pgrst.db_pre_request=%'
    and setting.value <> 'pgrst.db_pre_request=private.enforce_owner_ip_block_data_api'
  limit 1;

  if v_existing_hook is not null then
    raise exception 'An existing PostgREST pre-request hook must be reviewed and explicitly chained before applying the MMWR IP guard';
  end if;
end;
$block$;

-- Always register the hook. Its missing app.settings values fail closed by
-- default; the privileged deployment operator must set the trusted header
-- and enable flag only after the ingress overwrite behavior is verified.
alter role authenticator set pgrst.db_pre_request = 'private.enforce_owner_ip_block_data_api';
notify pgrst, 'reload config';

-- Rollback: reset the two authenticator settings, reload PostgREST, revoke
-- this function's grants, drop it, then restore any Vault grants required by
-- deployment-specific functions before dropping the Vault extension.
