-- Require a single address in the configured ingress header. The previous
-- guard selected the first value from comma-separated proxy chains, which is
-- unsafe unless every upstream is proven to overwrite caller input.

create or replace function private.enforce_owner_ip_block_data_api_single_header()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_headers jsonb;
  v_trusted_ip_header text;
  v_raw_ip text;
  v_request_role text;
begin
  if pg_catalog.current_setting('app.settings.mmwr_ip_block_enabled', true) is distinct from 'true' then
    return;
  end if;

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

  v_raw_ip := pg_catalog.btrim(coalesce(v_headers->>v_trusted_ip_header, ''));
  if v_raw_ip = '' or pg_catalog.strpos(v_raw_ip, ',') > 0 then
    raise sqlstate 'PGRST' using
      message = pg_catalog.jsonb_build_object(
        'code', 'MMWR_IP_BLOCK_UNAVAILABLE', 'message', 'Service temporarily unavailable.', 'details', null, 'hint', null
      )::text,
      detail = pg_catalog.jsonb_build_object('status', 503)::text;
  end if;

  -- The original guard performs the canonical inet parse, host-prefix check,
  -- Vault HMAC lookup and block decision. Since comma chains were rejected
  -- above, its first-address handling can no longer select a caller prefix.
  perform private.enforce_owner_ip_block_data_api();
end;
$function$;

revoke all on function private.enforce_owner_ip_block_data_api_single_header()
  from public, anon, authenticated, service_role, authenticator;
grant execute on function private.enforce_owner_ip_block_data_api_single_header()
  to anon, authenticated, service_role, authenticator;

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
  limit 1;

  if v_existing_hook is distinct from 'private.enforce_owner_ip_block_data_api'
    and v_existing_hook is distinct from 'private.enforce_owner_ip_block_data_api_single_header' then
    raise exception 'The PostgREST pre-request hook changed; review and chain it explicitly before enabling single-header validation';
  end if;
end;
$block$;

alter role authenticator set pgrst.db_pre_request = 'private.enforce_owner_ip_block_data_api_single_header';
notify pgrst, 'reload config';

-- Rollback (only on an isolated, reviewed environment): restore the previous
-- hook name after confirming no later migration replaced it, reload PostgREST,
-- then revoke/drop the single-header wrapper. Keep both IP-block gates OFF.
