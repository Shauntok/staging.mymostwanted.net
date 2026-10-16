-- Account deletion is a reversible state change during the seven-day window.
-- The irreversible Auth/Storage cleanup remains a separately gated worker.
create table private.runtime_flags (
  flag text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint runtime_flags_name_valid check (flag in ('account_deletion'))
);

alter table private.runtime_flags enable row level security;
revoke all on table private.runtime_flags from public, anon, authenticated, service_role;

insert into private.runtime_flags (flag, enabled)
values ('account_deletion', false)
on conflict (flag) do nothing;

create function private.request_my_account_deletion()
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_account_state text;
begin
  if v_user_id is null then
    return false;
  end if;

  if not exists (
    select 1 from private.runtime_flags as runtime_flag
    where runtime_flag.flag = 'account_deletion'
      and runtime_flag.enabled
  ) then
    return false;
  end if;

  select profile.account_state into v_account_state
  from public.profiles as profile
  where profile.id = v_user_id
  for update;

  if not found or v_account_state <> 'active'
    or exists (
      select 1 from private.user_roles as user_role
      where user_role.user_id = v_user_id
    ) then
    return false;
  end if;

  update public.profiles as profile
  set account_state = 'deletion_pending',
      deletion_requested_at = pg_catalog.clock_timestamp()
  where profile.id = v_user_id;

  insert into private.security_events (actor_user_id, event_type, outcome)
  values (v_user_id, 'account_deletion_requested', 'success');

  return true;
end;
$function$;

revoke all on function private.request_my_account_deletion() from public, anon, service_role;
grant execute on function private.request_my_account_deletion() to authenticated;

create function public.request_my_account_deletion()
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  select private.request_my_account_deletion();
$function$;

revoke all on function public.request_my_account_deletion() from public, anon, service_role;
grant execute on function public.request_my_account_deletion() to authenticated;

create function private.cancel_my_account_deletion()
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_requested_at timestamptz;
begin
  if v_user_id is null then
    return false;
  end if;

  select profile.deletion_requested_at into v_requested_at
  from public.profiles as profile
  where profile.id = v_user_id
    and profile.account_state = 'deletion_pending'
  for update;

  if not found or v_requested_at is null
    or pg_catalog.clock_timestamp() >= v_requested_at + interval '7 days' then
    return false;
  end if;

  update public.profiles as profile
  set account_state = 'active', deletion_requested_at = null
  where profile.id = v_user_id;

  insert into private.security_events (actor_user_id, event_type, outcome)
  values (v_user_id, 'account_deletion_cancelled', 'success');

  return true;
end;
$function$;

revoke all on function private.cancel_my_account_deletion() from public, anon, service_role;
grant execute on function private.cancel_my_account_deletion() to authenticated;

create function public.cancel_my_account_deletion()
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  select private.cancel_my_account_deletion();
$function$;

revoke all on function public.cancel_my_account_deletion() from public, anon, service_role;
grant execute on function public.cancel_my_account_deletion() to authenticated;

alter table private.security_events drop constraint security_events_type_valid;
alter table private.security_events
  add constraint security_events_type_valid check (
    event_type in (
      'staff_sign_in_anomaly',
      'staff_login_failure',
      'staff_mfa_failure',
      'staff_mfa_enrolled',
      'staff_mfa_reset',
      'staff_access_denied',
      'staff_role_changed',
      'staff_owner_bootstrapped',
      'account_deletion_requested',
      'account_deletion_cancelled'
    )
  );
