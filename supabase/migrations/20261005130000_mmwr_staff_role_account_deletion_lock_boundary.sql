-- Serialize staff assignment and deletion on the target Profile first.
-- The ordinary deletion request already locks that row before checking roles;
-- keep the same Profile -> user_roles lock order in staff administration.
-- This migration does not enable either account-deletion runtime flag.
create or replace function private.change_staff_role(
  p_target_user_id uuid,
  p_role text,
  p_grant boolean,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_changed bigint := 0;
  v_owner_count bigint;
  v_target_account_state text;
begin
  if v_actor_user_id is null
    or p_target_user_id is null
    or p_target_user_id = v_actor_user_id
    or p_role is null
    or p_role not in ('admin', 'owner')
    or p_grant is null
    or p_reason is null
    or pg_catalog.btrim(p_reason) = ''
    or pg_catalog.char_length(p_reason) > 500
    or not private.has_staff_role('owner')
    or not private.has_recent_totp()
    or not exists (
      select 1 from public.profiles as profile
      where profile.id = p_target_user_id
        and profile.account_state = 'active'
    ) then
    return false;
  end if;

  -- A deletion request/claim holds this same row lock. Re-read its state
  -- after waiting, before acquiring the role-table lock or changing a role.
  select profile.account_state into v_target_account_state
  from public.profiles as profile
  where profile.id = p_target_user_id
  for update;
  if not found or v_target_account_state <> 'active'
    or not private.has_staff_role('owner')
    or not private.has_recent_totp() then
    return false;
  end if;

  -- Serialize grants/revokes so concurrent sessions cannot remove the final
  -- Owner. Always acquire this lock after the target Profile row lock.
  lock table private.user_roles in exclusive mode;

  if not private.has_staff_role('owner')
    or not private.has_recent_totp()
    or not exists (
      select 1 from public.profiles as profile
      where profile.id = p_target_user_id
        and profile.account_state = 'active'
    ) then
    return false;
  end if;

  if p_grant then
    insert into private.user_roles (user_id, role, granted_by)
    values (p_target_user_id, p_role, v_actor_user_id)
    on conflict (user_id, role) do nothing;
    get diagnostics v_changed = row_count;
  else
    if p_role = 'owner' then
      select pg_catalog.count(*) into v_owner_count
      from private.user_roles as user_role
      where user_role.role = 'owner';
      if v_owner_count <= 1 then
        return false;
      end if;
    end if;

    delete from private.user_roles as user_role
    where user_role.user_id = p_target_user_id
      and user_role.role = p_role;
    get diagnostics v_changed = row_count;
  end if;

  if v_changed = 0 then
    return false;
  end if;

  insert into private.role_change_audit (actor_user_id, target_user_id, role, action, reason)
  values (v_actor_user_id, p_target_user_id, p_role, case when p_grant then 'granted' else 'revoked' end, pg_catalog.btrim(p_reason));

  insert into private.security_events (actor_user_id, event_type, outcome)
  values (v_actor_user_id, 'staff_role_changed', 'success');

  return true;
end;
$function$;

revoke all on function private.change_staff_role(uuid, text, boolean, text)
  from public, anon, service_role;
grant execute on function private.change_staff_role(uuid, text, boolean, text)
  to authenticated;

-- Defense at the final durable checkpoint: a profile with any staff role
-- must never authorize an ordinary-account Auth deletion, even if a role
-- was added by a separately privileged/manual operation after the claim.
create or replace function public.begin_account_deletion_auth_attempt(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_state text;
  v_claimed_at timestamptz;
  v_auth_attempted_at timestamptz;
  v_has_evidence boolean;
  v_attempt_time timestamptz;
  v_profile_found boolean;
begin
  if (select auth.jwt() ->> 'role') is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from private.runtime_flags as flag
    where flag.flag = 'account_deletion'
      and flag.enabled
  ) or not exists (
    select 1 from private.runtime_flags as flag
    where flag.flag = 'account_deletion_cleanup'
      and flag.enabled
  ) then
    return false;
  end if;

  select profile.account_state,
         profile.deletion_claimed_at,
         profile.deletion_auth_attempted_at
  into v_account_state, v_claimed_at, v_auth_attempted_at
  from public.profiles as profile
  where profile.id = p_user_id
  for update;

  v_profile_found := found;
  v_attempt_time := pg_catalog.clock_timestamp();
  if not v_profile_found
    or v_account_state <> 'deletion_processing'
    or v_claimed_at is null
    or v_claimed_at <= v_attempt_time - interval '30 minutes'
    or v_auth_attempted_at is not null
    or exists (
      select 1 from private.user_roles as user_role
      where user_role.user_id = p_user_id
    )
    or not exists (
      select 1 from private.runtime_flags as flag
      where flag.flag = 'account_deletion' and flag.enabled
    )
    or not exists (
      select 1 from private.runtime_flags as flag
      where flag.flag = 'account_deletion_cleanup' and flag.enabled
    ) then
    return false;
  end if;

  select exists (
    select 1
    from storage.objects as object
    where object.bucket_id = 'mmwr-evidence-quarantine'
      and (
        object.owner_id = p_user_id::text
        or pg_catalog.left(object.name, pg_catalog.length(p_user_id::text) + 1)
          = p_user_id::text || '/'
      )
    union all
    select 1
    from private.evidence_metadata as evidence
    where evidence.uploaded_by = p_user_id
  ) into v_has_evidence;

  v_attempt_time := pg_catalog.clock_timestamp();
  if v_has_evidence then
    update public.profiles as profile
    set account_state = 'deletion_review_required',
        deletion_claimed_at = null,
        deletion_auth_attempted_at = null,
        deletion_review_reason = 'evidence_owned',
        updated_at = v_attempt_time
    where profile.id = p_user_id;

    insert into private.account_deletion_review_events (subject_user_id, reason)
    values (p_user_id, 'evidence_owned');
    return false;
  end if;

  update public.profiles as profile
  set deletion_auth_attempted_at = v_attempt_time,
      updated_at = v_attempt_time
  where profile.id = p_user_id
    and profile.account_state = 'deletion_processing'
    and profile.deletion_auth_attempted_at is null;

  return found;
end;
$function$;

revoke all on function public.begin_account_deletion_auth_attempt(uuid)
  from public, anon, authenticated;
grant execute on function public.begin_account_deletion_auth_attempt(uuid)
  to service_role;
