-- A Server Action checks that an Owner is not blocking the address used to
-- reach it. Require a short-lived server HMAC proof at the database write
-- boundary too, because the older three-argument authenticated RPC was
-- directly callable and had no way to distinguish that check from a bypass.

create function private.owner_ip_block_nonself_proof_valid(
  p_actor_id uuid,
  p_fingerprint text,
  p_reason text,
  p_expires_at timestamptz,
  p_proof_issued_at timestamptz,
  p_proof text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_secret_count bigint;
  v_hmac_secret text;
  v_payload text;
  v_expected text;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_headers jsonb;
  v_trusted_ip_header text;
  v_raw_ip text;
  v_client_ip inet;
  v_current_fingerprint text;
begin
  if p_actor_id is null
    or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$'
    or p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) not between 1 and 500
    or p_expires_at is null or p_proof_issued_at is null
    or p_proof is null or p_proof !~ '^[0-9a-f]{64}$'
    or p_proof_issued_at < v_now - interval '1 minute'
    or p_proof_issued_at > v_now + interval '5 seconds'
    or p_expires_at <= v_now then
    return false;
  end if;

  begin
    select pg_catalog.count(*)::bigint, pg_catalog.min(secret.decrypted_secret)
      into v_secret_count, v_hmac_secret
    from vault.decrypted_secrets as secret
    where secret.name = 'mmwr_ip_block_hmac_secret';
  exception when others then
    return false;
  end;
  if v_secret_count <> 1 or v_hmac_secret is null
    or pg_catalog.octet_length(pg_catalog.convert_to(v_hmac_secret, 'UTF8')) < 32 then
    return false;
  end if;

  -- Re-read the source address from this exact PostgREST request. The signed
  -- proof alone is insufficient: a replay after the Owner's address changes
  -- must not be able to block the address now carrying the request.
  begin
    v_headers := pg_catalog.current_setting('request.headers', true)::jsonb;
  exception when others then
    return false;
  end;
  v_trusted_ip_header := pg_catalog.lower(pg_catalog.btrim(coalesce(
    pg_catalog.current_setting('app.settings.mmwr_ip_block_trusted_client_ip_header', true), ''
  )));
  if v_trusted_ip_header not in ('x-vercel-forwarded-for', 'cf-connecting-ip', 'x-mmwr-client-ip') then
    return false;
  end if;
  v_raw_ip := pg_catalog.btrim(coalesce(v_headers->>v_trusted_ip_header, ''));
  if v_raw_ip = '' or pg_catalog.strpos(v_raw_ip, ',') > 0 then
    return false;
  end if;
  begin
    v_client_ip := v_raw_ip::inet;
  exception when others then
    return false;
  end;
  if pg_catalog.masklen(v_client_ip) <> (case pg_catalog.family(v_client_ip) when 4 then 32 else 128 end) then
    return false;
  end if;
  v_current_fingerprint := pg_catalog.encode(
    extensions.hmac(
      pg_catalog.convert_to('mmwr:owner-ip-block:v1:' || pg_catalog.host(v_client_ip), 'UTF8'),
      pg_catalog.convert_to(v_hmac_secret, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  if v_current_fingerprint = p_fingerprint then
    return false;
  end if;

  v_payload := 'mmwr:owner-ip-block:nonself:v1:'
    || p_actor_id::text || ':'
    || p_fingerprint || ':'
    || pg_catalog.floor(extract(epoch from p_expires_at) * 1000)::bigint::text || ':'
    || pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.btrim(p_reason), 'UTF8'), 'sha256'), 'hex') || ':'
    || pg_catalog.floor(extract(epoch from p_proof_issued_at) * 1000)::bigint::text;
  v_expected := pg_catalog.encode(
    extensions.hmac(
      pg_catalog.convert_to(v_payload, 'UTF8'),
      pg_catalog.convert_to(v_hmac_secret, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  return v_expected = p_proof;
end;
$function$;

revoke all on function private.owner_ip_block_nonself_proof_valid(uuid, text, text, timestamptz, timestamptz, text)
  from public, anon, authenticated, service_role;

create function private.owner_add_ip_block(
  p_fingerprint text,
  p_reason text,
  p_expires_at timestamptz,
  p_non_self_proof text,
  p_proof_issued_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null
    or not private.has_staff_role('owner')
    or not private.has_recent_totp()
    or not private.owner_ip_block_nonself_proof_valid(v_actor, p_fingerprint, p_reason, p_expires_at, p_proof_issued_at, p_non_self_proof) then
    raise exception 'Owner, recent TOTP and a valid server-side non-self proof are required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_fingerprint, 73530101));
  perform private.purge_expired_owner_ip_blocks();
  -- Recheck authorization and the short-lived proof after all waits.
  if not private.has_staff_role('owner')
    or not private.has_recent_totp()
    or not private.owner_ip_block_nonself_proof_valid(v_actor, p_fingerprint, p_reason, p_expires_at, p_proof_issued_at, p_non_self_proof) then
    raise exception 'Owner, recent TOTP and a valid server-side non-self proof are required' using errcode = '42501';
  end if;
  if exists (select 1 from private.owner_ip_blocks where fingerprint = p_fingerprint) then
    raise exception 'An active restriction already exists for this address' using errcode = '23505';
  end if;

  insert into private.owner_ip_blocks (fingerprint, reason, actor_user_id, expires_at)
  values (p_fingerprint, pg_catalog.btrim(p_reason), v_actor, p_expires_at)
  returning id into v_id;
  insert into private.owner_ip_block_audit (block_id, action, actor_user_id, reason, expires_at)
  values (v_id, 'created', v_actor, pg_catalog.btrim(p_reason), p_expires_at);
  return v_id;
end;
$function$;

-- Disable the old authenticated RPC and its private implementation. The new
-- overload cannot be called successfully without an HMAC the browser cannot
-- create; the action mints it only after comparing target/current fingerprints.
revoke all on function private.owner_add_ip_block(text, text, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.owner_add_ip_block(text, text, timestamptz)
  from public, anon, authenticated, service_role;

revoke all on function private.owner_add_ip_block(text, text, timestamptz, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function private.owner_add_ip_block(text, text, timestamptz, text, timestamptz)
  to authenticated;

create function public.owner_add_ip_block(
  p_fingerprint text,
  p_reason text,
  p_expires_at timestamptz,
  p_non_self_proof text,
  p_proof_issued_at timestamptz
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.owner_add_ip_block(p_fingerprint, p_reason, p_expires_at, p_non_self_proof, p_proof_issued_at);
$function$;
revoke all on function public.owner_add_ip_block(text, text, timestamptz, text, timestamptz)
  from public, anon, service_role;
grant execute on function public.owner_add_ip_block(text, text, timestamptz, text, timestamptz)
  to authenticated;
