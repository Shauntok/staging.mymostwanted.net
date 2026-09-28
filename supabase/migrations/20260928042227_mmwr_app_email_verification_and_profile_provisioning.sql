-- MMWR-owned email verification and safe first-profile initialization.
-- Supabase Auth email confirmation must stay disabled so unverified members can
-- still sign in, read full content, and react. Posting is gated by this separate
-- application verification marker instead of auth.users.email_confirmed_at.

alter table public.profiles
  add column submission_email_verified_at timestamptz;

create function private.reset_submission_email_verification_on_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.email is distinct from new.email then
    -- Match the verifier lock order: token rows first, then the profile.
    -- Auth already holds its own user-row lock while this trigger runs.
    delete from private.email_verification_tokens as token where token.user_id = new.id;
    update public.profiles as profile
    set submission_email_verified_at = null
    where profile.id = new.id;
  end if;
  return new;
end;
$function$;

revoke all on function private.reset_submission_email_verification_on_email_change() from public, anon, authenticated, service_role;

create trigger auth_email_change_resets_mmwr_verification
  after update of email on auth.users
  for each row execute function private.reset_submission_email_verification_on_email_change();

create table private.email_verification_tokens (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash bytea not null unique,
  created_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint email_verification_token_hash_length check (pg_catalog.octet_length(token_hash) = 32),
  constraint email_verification_token_expiry_order check (expires_at > created_at)
);

create index email_verification_tokens_user_created_idx
  on private.email_verification_tokens (user_id, created_at desc);
create index email_verification_tokens_expiry_idx
  on private.email_verification_tokens (expires_at);

create table private.email_verification_rate_limits (
  user_id uuid primary key references auth.users (id) on delete cascade,
  window_started_at timestamptz not null default pg_catalog.now(),
  request_count integer not null default 0,
  constraint email_verification_requests_valid check (request_count between 0 and 3)
);

alter table private.email_verification_tokens enable row level security;
alter table private.email_verification_rate_limits enable row level security;
revoke all on table private.email_verification_tokens from public, anon, authenticated, service_role;
revoke all on table private.email_verification_rate_limits from public, anon, authenticated, service_role;

create function private.initialize_my_profile(p_username text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_username text := pg_catalog.btrim(p_username);
begin
  if v_user_id is null
    or v_username is null
    or v_username !~ '^[A-Za-z0-9_]{3,24}$'
    or not exists (select 1 from auth.users as auth_user where auth_user.id = v_user_id) then
    return false;
  end if;

  insert into public.profiles (id, username)
  values (v_user_id, v_username)
  on conflict (id) do nothing;
  return exists (select 1 from public.profiles as profile where profile.id = v_user_id);
exception when unique_violation then
  return false;
end;
$function$;

revoke all on function private.initialize_my_profile(text) from public, anon, service_role;
grant execute on function private.initialize_my_profile(text) to authenticated;

create function public.initialize_my_profile(p_username text)
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  select private.initialize_my_profile(p_username);
$function$;

revoke all on function public.initialize_my_profile(text) from public, anon, service_role;
grant execute on function public.initialize_my_profile(text) to authenticated;
grant select (submission_email_verified_at) on table public.profiles to authenticated;

create function private.create_my_email_verification(p_token_hash bytea)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_window_started_at timestamptz;
  v_request_count integer;
begin
  if v_user_id is null or p_token_hash is null or pg_catalog.octet_length(p_token_hash) <> 32 then
    return false;
  end if;

  if not exists (
    select 1 from public.profiles as profile
    where profile.id = v_user_id
      and profile.account_state = 'active'
      and profile.submission_email_verified_at is null
  ) then
    return false;
  end if;

  insert into private.email_verification_rate_limits (user_id, window_started_at, request_count)
  values (v_user_id, v_now, 0)
  on conflict (user_id) do nothing;

  select rate_limit.window_started_at, rate_limit.request_count
    into v_window_started_at, v_request_count
  from private.email_verification_rate_limits as rate_limit
  where rate_limit.user_id = v_user_id
  for update;

  if v_window_started_at <= v_now - interval '1 hour' then
    update private.email_verification_rate_limits as rate_limit
    set window_started_at = v_now, request_count = 0
    where rate_limit.user_id = v_user_id;
    v_request_count := 0;
  end if;

  if v_request_count >= 3 then return false; end if;

  update private.email_verification_rate_limits as rate_limit
  set request_count = rate_limit.request_count + 1
  where rate_limit.user_id = v_user_id;

  delete from private.email_verification_tokens as token
  where token.user_id = v_user_id and token.consumed_at is null;

  insert into private.email_verification_tokens (user_id, token_hash, expires_at)
  values (v_user_id, p_token_hash, v_now + interval '30 minutes');

  return true;
end;
$function$;

revoke all on function private.create_my_email_verification(bytea) from public, anon, service_role;
grant execute on function private.create_my_email_verification(bytea) to authenticated;

create function public.create_my_email_verification(p_token_hash bytea)
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  select private.create_my_email_verification(p_token_hash);
$function$;

revoke all on function public.create_my_email_verification(bytea) from public, anon, service_role;
grant execute on function public.create_my_email_verification(bytea) to authenticated;

create function private.verify_submission_email(p_token_hash bytea)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
  v_token_id bigint;
  v_consumed_at timestamptz;
  v_expires_at timestamptz;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_token_hash is null or pg_catalog.octet_length(p_token_hash) <> 32 then return false; end if;

  select token.id, token.user_id, token.expires_at, token.consumed_at
    into v_token_id, v_user_id, v_expires_at, v_consumed_at
  from private.email_verification_tokens as token
  where token.token_hash = p_token_hash
  for update;

  if not found or v_consumed_at is not null or v_expires_at <= v_now then return false; end if;

  update public.profiles as profile
  set submission_email_verified_at = v_now
  where profile.id = v_user_id
    and profile.account_state = 'active'
    and profile.submission_email_verified_at is null;

  if not found then return false; end if;

  update private.email_verification_tokens as token
  set consumed_at = v_now
  where token.id = v_token_id;
  return true;
end;
$function$;

revoke all on function private.verify_submission_email(bytea) from public, anon, authenticated, service_role;
grant execute on function private.verify_submission_email(bytea) to anon, authenticated;
-- The anonymous role needs private-schema name resolution for the invoker RPC.
-- The schema stays out of PostgREST's exposed schemas and has no table grants;
-- only the narrow one-time verification helper is executable by anon.
grant usage on schema private to anon;

create function public.verify_submission_email(p_token_hash bytea)
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  select private.verify_submission_email(p_token_hash);
$function$;

revoke all on function public.verify_submission_email(bytea) from public, anon, service_role;
grant execute on function public.verify_submission_email(bytea) to anon, authenticated;

create or replace function private.create_submission(p_title text, p_original_source text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_submission_id uuid;
begin
  if v_user_id is null
    or p_title is null or pg_catalog.btrim(p_title) = ''
    or p_original_source is null or pg_catalog.btrim(p_original_source) = ''
    or not exists (
      select 1 from public.profiles as profile
      where profile.id = v_user_id
        and profile.account_state = 'active'
        and profile.submission_email_verified_at is not null
    ) then
    return null;
  end if;

  insert into private.submissions (submitter_id, submitted_title, original_source)
  values (v_user_id, pg_catalog.btrim(p_title), p_original_source)
  returning id into v_submission_id;
  return v_submission_id;
end;
$function$;

revoke all on function private.create_submission(text, text) from public, anon, service_role;
grant execute on function private.create_submission(text, text) to authenticated;
