-- Owner-only role administration; first Owner is provisioned by the guarded
-- manual script in supabase/operations, never by a public bootstrap RPC.
create table private.role_change_audit (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users (id) on delete set null,
  target_user_id uuid references auth.users (id) on delete set null,
  role text not null,
  action text not null,
  reason text not null,
  occurred_at timestamptz not null default pg_catalog.now(),
  constraint role_change_audit_role_valid check (role in ('admin', 'owner')),
  constraint role_change_audit_action_valid check (action in ('granted', 'revoked', 'first_owner_bootstrap')),
  constraint role_change_audit_reason_valid check (pg_catalog.btrim(reason) <> '' and pg_catalog.char_length(reason) <= 500)
);

create index role_change_audit_occurred_idx
  on private.role_change_audit (occurred_at desc);

alter table private.role_change_audit enable row level security;
revoke all on table private.role_change_audit from public, anon, authenticated, service_role;
grant select on table private.role_change_audit to authenticated;

create policy role_change_audit_owner_read
  on private.role_change_audit for select to authenticated
  using (private.has_staff_role('owner'));

create function private.has_recent_totp()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select auth.uid()) is not null
    and (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        case
          when pg_catalog.jsonb_typeof((select auth.jwt() -> 'amr')) = 'array'
            then (select auth.jwt() -> 'amr')
          else '[]'::jsonb
        end
      ) as factor(entry)
      where factor.entry ->> 'method' in ('totp', 'mfa/totp')
        and case
          when (factor.entry ->> 'timestamp') ~ '^[0-9]{1,12}$' then
            (factor.entry ->> 'timestamp')::bigint >=
              pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.now() - interval '10 minutes'))::bigint
          else false
        end
    );
$function$;

revoke all on function private.has_recent_totp() from public, anon, service_role;
grant execute on function private.has_recent_totp() to authenticated;

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

  -- Serialize grants/revokes so two concurrent sessions cannot remove the
  -- final Owner or race the same target-role transition.
  lock table private.user_roles in exclusive mode;

  if not private.has_staff_role('owner') or not private.has_recent_totp() then
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

revoke all on function private.change_staff_role(uuid, text, boolean, text) from public, anon, service_role;
grant execute on function private.change_staff_role(uuid, text, boolean, text) to authenticated;

create function public.change_staff_role(
  p_target_user_id uuid,
  p_role text,
  p_grant boolean,
  p_reason text
)
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  select private.change_staff_role(p_target_user_id, p_role, p_grant, p_reason);
$function$;

revoke all on function public.change_staff_role(uuid, text, boolean, text) from public, anon, service_role;
grant execute on function public.change_staff_role(uuid, text, boolean, text) to authenticated;

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
      'staff_owner_bootstrapped'
    )
  );
