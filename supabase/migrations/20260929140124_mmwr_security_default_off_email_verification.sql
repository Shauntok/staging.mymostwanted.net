-- Security hardening for capabilities that remain OFF in the product.
-- This is a forward migration: do not apply it outside the normal user-guided
-- Development -> Staging -> Production migration sequence.

-- Email verification tokens may only be issued by the trusted server action
-- using the server-only Supabase service role. Authenticated clients must not
-- choose the hash that the public one-time verifier consumes.
revoke all on function private.create_my_email_verification(bytea)
  from public, anon, authenticated, service_role;
revoke all on function public.create_my_email_verification(bytea)
  from public, anon, authenticated, service_role;

create function private.create_my_email_verification_for_user(
  p_user_id uuid,
  p_email text,
  p_token_hash bytea
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_auth_email text;
  v_window_started_at timestamptz;
  v_request_count integer;
begin
  -- The private function and its public invoker wrapper are executable only
  -- by service_role; the target email is re-read from Auth before issuing.
  if p_user_id is null or p_email is null or p_token_hash is null
    or pg_catalog.octet_length(p_token_hash) <> 32 then
    return false;
  end if;

  -- Serialize with Auth email changes so the trigger cannot race token
  -- creation and leave a valid link for a superseded address.
  select auth_user.email into v_auth_email
  from auth.users as auth_user
  where auth_user.id = p_user_id
  for key share;

  if not found
    or pg_catalog.lower(pg_catalog.btrim(v_auth_email)) is distinct from pg_catalog.lower(pg_catalog.btrim(p_email))
    or not exists (
      select 1 from public.profiles as profile
      where profile.id = p_user_id
        and profile.account_state = 'active'
        and profile.submission_email_verified_at is null
    ) then
    return false;
  end if;

  insert into private.email_verification_rate_limits (user_id, window_started_at, request_count)
  values (p_user_id, v_now, 0)
  on conflict (user_id) do nothing;

  select rate_limit.window_started_at, rate_limit.request_count
    into v_window_started_at, v_request_count
  from private.email_verification_rate_limits as rate_limit
  where rate_limit.user_id = p_user_id
  for update;

  if v_window_started_at <= v_now - interval '1 hour' then
    update private.email_verification_rate_limits as rate_limit
    set window_started_at = v_now, request_count = 0
    where rate_limit.user_id = p_user_id;
    v_request_count := 0;
  end if;

  if v_request_count >= 3 then return false; end if;

  update private.email_verification_rate_limits as rate_limit
  set request_count = rate_limit.request_count + 1
  where rate_limit.user_id = p_user_id;

  delete from private.email_verification_tokens as token
  where token.user_id = p_user_id and token.consumed_at is null;

  insert into private.email_verification_tokens (user_id, token_hash, expires_at)
  values (p_user_id, p_token_hash, v_now + interval '30 minutes');

  return true;
end;
$function$;

revoke all on function private.create_my_email_verification_for_user(uuid, text, bytea)
  from public, anon, authenticated, service_role;
grant execute on function private.create_my_email_verification_for_user(uuid, text, bytea)
  to service_role;
grant usage on schema private to service_role;

create function public.create_my_email_verification_for_user(
  p_user_id uuid,
  p_email text,
  p_token_hash bytea
)
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  select private.create_my_email_verification_for_user(p_user_id, p_email, p_token_hash);
$function$;

revoke all on function public.create_my_email_verification_for_user(uuid, text, bytea)
  from public, anon, authenticated, service_role;
grant execute on function public.create_my_email_verification_for_user(uuid, text, bytea)
  to service_role;

-- Submission is deliberately unavailable until anti-abuse, evidence scanning,
-- and the user-visible submission workflow are complete. Enforce OFF in the
-- database as well as in the route/UI.
revoke all on function private.create_submission(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.create_submission(text, text)
  from public, anon, authenticated, service_role;

-- Close the remaining write surfaces for an existing qualifying submission,
-- including addenda and evidence registration/upload.
revoke all on function private.append_submission_information(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.append_submission_information(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function private.register_submission_evidence(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.register_submission_evidence(uuid, text)
  from public, anon, authenticated, service_role;
drop policy if exists mmwr_evidence_quarantine_submitter_insert on storage.objects;
