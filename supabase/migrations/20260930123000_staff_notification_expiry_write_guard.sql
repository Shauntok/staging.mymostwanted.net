-- Enforce the 90-day notification window in mutations as well as list reads.
-- Expired notifications are not actionable while waiting for the daily purge.

create or replace function private.update_staff_notification_status(p_notification_id uuid, p_status text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_before text;
  v_now timestamptz;
  v_updated bigint;
begin
  if v_user_id is null
    or not (private.has_staff_role('admin') or private.has_staff_role('owner'))
    or not private.has_recent_totp() then
    raise exception 'Staff notification access denied' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('read', 'in_progress', 'resolved') then
    return false;
  end if;

  v_now := pg_catalog.clock_timestamp();
  select notification.status into v_before
  from private.staff_notifications as notification
  where notification.id = p_notification_id
    and notification.recipient_user_id = v_user_id
    and notification.created_at >= v_now - interval '90 days'
  for update;
  if not found then return false; end if;

  -- Lock waits may outlast the MFA freshness window or cross notification
  -- expiry. Recheck authorization and evaluate the retention cutoff at write time.
  v_now := pg_catalog.clock_timestamp();
  if not (private.has_staff_role('admin') or private.has_staff_role('owner'))
    or not private.has_recent_totp() then
    raise exception 'Staff notification access denied' using errcode = '42501';
  end if;

  if not ((v_before = 'unread' and p_status = 'read')
    or (v_before = 'read' and p_status = 'in_progress')
    or (v_before = 'in_progress' and p_status = 'resolved')) then
    return false;
  end if;

  update private.staff_notifications
  set status = p_status,
      updated_at = v_now,
      read_at = case when p_status = 'read' then v_now else read_at end,
      in_progress_at = case when p_status = 'in_progress' then v_now else in_progress_at end,
      resolved_at = case when p_status = 'resolved' then v_now else resolved_at end
  where id = p_notification_id
    and recipient_user_id = v_user_id
    and created_at >= v_now - interval '90 days';
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then return false; end if;

  insert into private.staff_notification_audit (
    notification_id, actor_user_id, status_before, status_after
  ) values (p_notification_id, v_user_id, v_before, p_status);
  return true;
end;
$function$;

revoke all on function private.update_staff_notification_status(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function private.update_staff_notification_status(uuid, text) to authenticated;

-- The existing public invoker wrapper keeps its contract and delegates to the
-- private function above; it still has no anon/public/service-role grant.
