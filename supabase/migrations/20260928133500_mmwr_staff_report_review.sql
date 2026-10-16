-- Staff report access is available only through MFA- and role-gated RPCs.
-- Reads and status changes create append-only operational audit entries.
create table private.user_report_audit (
  id bigint generated always as identity primary key,
  report_id uuid not null references private.user_reports (id) on delete restrict,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  status_before text,
  status_after text,
  reason text,
  occurred_at timestamptz not null default pg_catalog.now(),
  constraint user_report_audit_action_valid check (action in ('opened', 'status_changed')),
  constraint user_report_audit_reason_size check (reason is null or pg_catalog.char_length(reason) <= 500)
);

create index user_report_audit_report_time_idx
  on private.user_report_audit (report_id, occurred_at desc);

alter table private.user_report_audit enable row level security;
revoke all on table private.user_report_audit from public, anon, authenticated, service_role;

create function public.list_staff_user_reports(p_limit integer default 50)
returns table (
  id uuid,
  report_kind text,
  post_id uuid,
  reason text,
  message text,
  status text,
  submitted_at timestamptz
)
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null
    or not (private.has_staff_role('admin') or private.has_staff_role('owner'))
    or not private.has_recent_totp() then
    raise exception 'staff report access denied' using errcode = '42501';
  end if;

  return query
  with picked as materialized (
    select report.id, report.submitted_at
    from private.user_reports as report
    order by report.submitted_at desc, report.id desc
    limit greatest(1, least(coalesce(p_limit, 50), 50))
  ), logged as (
    insert into private.user_report_audit (report_id, actor_user_id, action)
    select picked.id, v_user_id, 'opened'
    from picked
    returning report_id
  )
  select report.id, report.report_kind, report.post_id,
    report.reason, report.message, report.status, report.submitted_at
  from private.user_reports as report
  join logged on logged.report_id = report.id
  order by report.submitted_at desc, report.id desc;
end
$function$;

revoke all on function public.list_staff_user_reports(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_staff_user_reports(integer)
  to authenticated;

create function public.update_staff_user_report(
  p_report_id uuid,
  p_status text,
  p_reason text
)
returns boolean
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_old_status text;
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
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

  update private.user_reports as report
  set status = p_status
  where report.id = p_report_id;

  insert into private.user_report_audit (
    report_id, actor_user_id, action, status_before, status_after, reason
  ) values (
    p_report_id, v_user_id, 'status_changed', v_old_status, p_status, v_reason
  );

  return true;
end
$function$;

revoke all on function public.update_staff_user_report(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.update_staff_user_report(uuid, text, text)
  to authenticated;
