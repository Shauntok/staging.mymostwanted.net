-- Run once in the target environment's Supabase SQL Editor after:
-- 1. Auth is configured and the future Owner has signed up.
-- 2. The account email is confirmed and its public.profiles row exists.
-- 3. You have copied that account's Auth user UUID from the dashboard.
-- Replace the sentinel UUID below before running. This operation is guarded,
-- audited, and intentionally has no callable application RPC.

begin;

do $bootstrap$
declare
  v_owner_user_id uuid := '00000000-0000-0000-0000-000000000000'::uuid; -- REPLACE with the Auth user UUID
  v_reason text := 'Initial Owner provisioned through the guarded manual bootstrap operation.';
begin
  if v_owner_user_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Replace the sentinel UUID with the intended Auth user UUID before running.';
  end if;

  lock table private.user_roles in exclusive mode;

  if exists (
    select 1 from private.user_roles as user_role where user_role.role = 'owner'
  ) then
    raise exception 'An Owner already exists; first-owner bootstrap is one-time only.';
  end if;

  if not exists (
    select 1
    from auth.users as auth_user
    join public.profiles as profile on profile.id = auth_user.id
    where auth_user.id = v_owner_user_id
      and profile.account_state = 'active'
  ) then
    raise exception 'The selected Auth user must exist and have an active MMWR profile.';
  end if;

  insert into private.user_roles (user_id, role, granted_by)
  values (v_owner_user_id, 'owner', null);

  insert into private.role_change_audit (actor_user_id, target_user_id, role, action, reason)
  values (null, v_owner_user_id, 'owner', 'first_owner_bootstrap', v_reason);

  insert into private.security_events (actor_user_id, event_type, outcome)
  values (null, 'staff_owner_bootstrapped', 'success');
end;
$bootstrap$;

commit;
