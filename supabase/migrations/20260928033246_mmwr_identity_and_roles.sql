-- MMWR identity foundation. This migration intentionally creates no user data.
-- A later auth/server task must implement trusted signup/profile creation,
-- security-event writes beyond recovery redemption, role bootstrap/admin
-- mutation, and account deletion. First Owner provisioning remains a manual
-- privileged operation; no callable unauthenticated bootstrap RPC is provided.
-- Deletion must resolve username history under an approved cleanup policy first.

create schema if not exists private;

revoke all on schema private from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text,
  account_state text not null default 'active',
  deletion_requested_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint profiles_username_nonblank check (pg_catalog.btrim(username) <> ''),
  constraint profiles_account_state_valid check (
    account_state in ('active', 'suspended', 'banned', 'deletion_pending')
  )
);

create unique index profiles_username_normalized_unique
  on public.profiles (pg_catalog.lower(pg_catalog.btrim(username)));

create table private.username_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete restrict,
  username text not null,
  changed_at timestamptz not null default pg_catalog.now(),
  changed_by uuid references auth.users (id) on delete set null,
  constraint username_history_username_nonblank check (pg_catalog.btrim(username) <> '')
);

create index username_history_user_changed_idx
  on private.username_history (user_id, changed_at desc);

create table private.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  granted_at timestamptz not null default pg_catalog.now(),
  granted_by uuid references auth.users (id) on delete set null,
  constraint user_roles_role_valid check (role in ('admin', 'owner')),
  constraint user_roles_user_role_unique unique (user_id, role)
);

create index user_roles_role_idx on private.user_roles (role, user_id);

create table private.recovery_code_hashes (
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash bytea not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint recovery_code_hash_sha256_length check (pg_catalog.octet_length(code_hash) = 32),
  constraint recovery_code_hash_user_unique primary key (user_id, code_hash)
);

create table private.recovery_code_rate_limits (
  user_id uuid primary key references auth.users (id) on delete cascade,
  window_started_at timestamptz not null default pg_catalog.now(),
  failure_count integer not null default 0,
  constraint recovery_code_rate_failures_valid check (failure_count between 0 and 5)
);

create table private.security_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  outcome text not null,
  occurred_at timestamptz not null default pg_catalog.now(),
  request_id uuid,
  constraint security_events_type_valid check (
    event_type in (
      'staff_sign_in_anomaly',
      'staff_login_failure',
      'staff_mfa_failure',
      'staff_mfa_enrolled',
      'staff_mfa_reset',
      'recovery_code_redeemed',
      'staff_access_denied'
    )
  ),
  constraint security_events_outcome_valid check (outcome in ('success', 'failure', 'denied'))
);

create index security_events_occurred_at_idx
  on private.security_events (occurred_at desc);

create function private.touch_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$function$;

revoke all on function private.touch_profile_updated_at() from public, anon, authenticated, service_role;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function private.touch_profile_updated_at();

create function private.has_staff_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when (select auth.uid()) is null then false
    when (select auth.jwt() ->> 'aal') is distinct from 'aal2' then false
    when p_role not in ('admin', 'owner') then false
    else exists (
      select 1
      from private.user_roles as user_role
      where user_role.user_id = (select auth.uid())
        and user_role.role = p_role
    )
  end;
$function$;

revoke all on function private.has_staff_role(text) from public, anon, service_role;
grant execute on function private.has_staff_role(text) to authenticated;

create function private.consume_recovery_code(p_code_hash bytea)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_window_started_at timestamptz;
  v_failure_count integer;
  v_consumed boolean := false;
begin
  if v_user_id is null then
    return false;
  end if;

  -- Recovery is available at AAL1 but only to a database-assigned staff user.
  if not exists (
    select 1
    from private.user_roles as user_role
    where user_role.user_id = v_user_id
      and user_role.role in ('admin', 'owner')
  ) then
    return false;
  end if;

  -- Serialize each user's attempts. The row lock makes direct concurrent RPC
  -- calls observe the committed failure count before deciding whether to proceed.
  insert into private.recovery_code_rate_limits (user_id, window_started_at, failure_count)
  values (v_user_id, v_now, 0)
  on conflict (user_id) do nothing;

  select rate_limit.window_started_at, rate_limit.failure_count
  into v_window_started_at, v_failure_count
  from private.recovery_code_rate_limits as rate_limit
  where rate_limit.user_id = v_user_id
  for update;

  if v_window_started_at <= v_now - interval '15 minutes' then
    update private.recovery_code_rate_limits as rate_limit
    set window_started_at = v_now, failure_count = 0
    where rate_limit.user_id = v_user_id;
    v_failure_count := 0;
  end if;

  -- Once five failures occur in the 15-minute window, do not write more events.
  if v_failure_count >= 5 then
    return false;
  end if;

  if p_code_hash is null or pg_catalog.octet_length(p_code_hash) <> 32 then
    update private.recovery_code_rate_limits as rate_limit
    set failure_count = rate_limit.failure_count + 1
    where rate_limit.user_id = v_user_id;
    insert into private.security_events (actor_user_id, event_type, outcome)
    values (v_user_id, 'recovery_code_redeemed', 'failure');
    return false;
  end if;

  -- A single DELETE is atomic: a concurrent or replayed redemption finds no row.
  delete from private.recovery_code_hashes as recovery_code
  where recovery_code.user_id = v_user_id
    and recovery_code.code_hash = p_code_hash
  returning true into v_consumed;

  if coalesce(v_consumed, false) then
    insert into private.security_events (actor_user_id, event_type, outcome)
    values (v_user_id, 'recovery_code_redeemed', 'success');
  else
    update private.recovery_code_rate_limits as rate_limit
    set failure_count = rate_limit.failure_count + 1
    where rate_limit.user_id = v_user_id;
    insert into private.security_events (actor_user_id, event_type, outcome)
    values (v_user_id, 'recovery_code_redeemed', 'failure');
  end if;

  return coalesce(v_consumed, false);
end;
$function$;

revoke all on function private.consume_recovery_code(bytea) from public, anon, service_role;
grant execute on function private.consume_recovery_code(bytea) to authenticated;

create function public.redeem_recovery_code(p_code_hash bytea)
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  select private.consume_recovery_code(p_code_hash);
$function$;

revoke all on function public.redeem_recovery_code(bytea) from public, anon, service_role;
grant execute on function public.redeem_recovery_code(bytea) to authenticated;

alter table public.profiles enable row level security;
alter table private.username_history enable row level security;
alter table private.user_roles enable row level security;
alter table private.recovery_code_hashes enable row level security;
alter table private.recovery_code_rate_limits enable row level security;
alter table private.security_events enable row level security;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

create policy profiles_update_own_display_name
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke all on table public.profiles from public, anon, authenticated, service_role;
grant select (id, username, display_name, account_state, deletion_requested_at, created_at, updated_at)
  on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

revoke all on table private.username_history from public, anon, authenticated, service_role;
revoke all on table private.user_roles from public, anon, authenticated, service_role;
revoke all on table private.recovery_code_hashes from public, anon, authenticated, service_role;
revoke all on table private.recovery_code_rate_limits from public, anon, authenticated, service_role;
revoke all on table private.security_events from public, anon, authenticated, service_role;
