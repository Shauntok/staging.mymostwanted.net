-- Record the actual post-lock transition time for staff report reviews. The
-- transaction-start default can precede the status change after a row-lock wait.
create or replace function public.update_staff_user_report(
  p_report_id uuid,
  p_status text,
  p_reason text
)
returns boolean
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_old_status text;
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_now timestamptz;
begin
  if v_user_id is null
    or p_report_id is null
    or p_status is null or p_status not in ('reviewing', 'resolved', 'dismissed')
    or pg_catalog.char_length(v_reason) not between 1 and 500
    or not (private.has_staff_role('admin') or private.has_staff_role('owner'))
    or not private.has_recent_totp() then
    return false;
  end if;

  select report.status into v_old_status
  from private.user_reports as report
  where report.id = p_report_id
  for update;
  if not found or v_old_status = p_status then return false; end if;

  -- Recheck staff authority and recent MFA after acquiring the row lock.
  if not (private.has_staff_role('admin') or private.has_staff_role('owner'))
    or not private.has_recent_totp() then
    return false;
  end if;

  v_now := pg_catalog.clock_timestamp();
  update private.user_reports as report
  set status = p_status
  where report.id = p_report_id;

  insert into private.user_report_audit (
    report_id, actor_user_id, action, status_before, status_after, reason, occurred_at
  ) values (
    p_report_id, v_user_id, 'status_changed', v_old_status, p_status, v_reason, v_now
  );

  return true;
end
$function$;

revoke all on function public.update_staff_user_report(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.update_staff_user_report(uuid, text, text)
  to authenticated;
