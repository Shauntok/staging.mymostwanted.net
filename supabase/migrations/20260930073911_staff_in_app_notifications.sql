-- Private, staff-only operational notifications. Notification text is generated
-- from event types; user-submitted messages and evidence are never copied here.

create table private.staff_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null,
  entity_id uuid not null,
  priority text not null,
  status text not null default 'unread',
  title text not null,
  message text not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  read_at timestamptz,
  in_progress_at timestamptz,
  resolved_at timestamptz,
  constraint staff_notifications_event_valid check (event_type in ('submission_received', 'submission_high_risk', 'user_report_received')),
  constraint staff_notifications_priority_valid check (priority in ('normal', 'important', 'critical')),
  constraint staff_notifications_status_valid check (status in ('unread', 'read', 'in_progress', 'resolved')),
  constraint staff_notifications_title_size check (pg_catalog.char_length(title) between 1 and 160),
  constraint staff_notifications_message_size check (pg_catalog.char_length(message) between 1 and 500),
  constraint staff_notifications_timestamps check (
    (status = 'unread' and read_at is null and in_progress_at is null and resolved_at is null)
    or (status = 'read' and read_at is not null and in_progress_at is null and resolved_at is null)
    or (status = 'in_progress' and read_at is not null and in_progress_at is not null and resolved_at is null)
    or (status = 'resolved' and read_at is not null and in_progress_at is not null and resolved_at is not null)
  ),
  constraint staff_notifications_recipient_event_unique unique (recipient_user_id, event_type, entity_id)
);

create index staff_notifications_recipient_created_idx
  on private.staff_notifications (recipient_user_id, created_at desc);
create index staff_notifications_retention_idx
  on private.staff_notifications (created_at);

alter table private.staff_notifications enable row level security;
revoke all on table private.staff_notifications from public, anon, authenticated, service_role;

create table private.staff_notification_audit (
  id bigint generated always as identity primary key,
  notification_id uuid references private.staff_notifications (id) on delete set null,
  actor_user_id uuid references auth.users (id) on delete set null,
  status_before text not null,
  status_after text not null,
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint staff_notification_audit_status_before check (status_before in ('unread', 'read', 'in_progress')),
  constraint staff_notification_audit_status_after check (status_after in ('read', 'in_progress', 'resolved'))
);

create index staff_notification_audit_time_idx
  on private.staff_notification_audit (occurred_at desc);

alter table private.staff_notification_audit enable row level security;
revoke all on table private.staff_notification_audit from public, anon, authenticated, service_role;

create function private.reject_staff_notification_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE'
    and ((old.actor_user_id is not null and new.actor_user_id is null)
      or (old.notification_id is not null and new.notification_id is null))
    and (to_jsonb(old) - 'actor_user_id' - 'notification_id') = (to_jsonb(new) - 'actor_user_id' - 'notification_id') then
    return new;
  end if;
  raise exception 'staff notification audit is append-only' using errcode = '42501';
end;
$function$;

revoke all on function private.reject_staff_notification_audit_mutation() from public, anon, authenticated, service_role;

create trigger staff_notification_audit_append_only
  before update or delete on private.staff_notification_audit
  for each row execute function private.reject_staff_notification_audit_mutation();
create trigger staff_notification_audit_no_truncate
  before truncate on private.staff_notification_audit
  for each statement execute function private.reject_staff_notification_audit_mutation();

create function private.enqueue_staff_notification(
  p_event_type text,
  p_entity_id uuid,
  p_priority text,
  p_title text,
  p_message text,
  p_owner_only boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_event_type not in ('submission_received', 'submission_high_risk', 'user_report_received')
    or p_entity_id is null
    or p_priority not in ('normal', 'important', 'critical')
    or pg_catalog.char_length(p_title) not between 1 and 160
    or pg_catalog.char_length(p_message) not between 1 and 500 then
    return;
  end if;

  insert into private.staff_notifications (
    recipient_user_id, event_type, entity_id, priority, title, message
  )
  select user_role.user_id, p_event_type, p_entity_id, p_priority, p_title, p_message
  from private.user_roles as user_role
  join public.profiles as profile on profile.id = user_role.user_id and profile.account_state = 'active'
  where user_role.role in ('admin', 'owner')
    and (not coalesce(p_owner_only, false) or user_role.role = 'owner')
  on conflict (recipient_user_id, event_type, entity_id) do nothing;
end;
$function$;

revoke all on function private.enqueue_staff_notification(text, uuid, text, text, text, boolean)
  from public, anon, authenticated, service_role;

create function private.notify_new_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.risk_level = 'high' then
    perform private.enqueue_staff_notification(
      'submission_high_risk', new.id, 'critical',
      'High-risk submission requires Owner review',
      'A submission was marked high risk. Open the private review queue.',
      true
    );
  else
    perform private.enqueue_staff_notification(
      'submission_received', new.id, 'important',
      'New submission received',
      'A submission is waiting in the private review queue.',
      false
    );
  end if;
  return new;
end;
$function$;

revoke all on function private.notify_new_submission() from public, anon, authenticated, service_role;

create trigger staff_notification_on_submission_insert
  after insert on private.submissions
  for each row execute function private.notify_new_submission();

create function private.notify_high_risk_submission_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.risk_level = 'high' then
    perform private.enqueue_staff_notification(
      'submission_high_risk', new.submission_id, 'critical',
      'High-risk submission requires Owner review',
      'A submission was marked high risk. Open the private review queue.',
      true
    );
  end if;
  return new;
end;
$function$;

revoke all on function private.notify_high_risk_submission_review() from public, anon, authenticated, service_role;

create trigger staff_notification_on_high_risk_review
  after insert on private.submission_reviews
  for each row execute function private.notify_high_risk_submission_review();

create function private.notify_new_user_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.enqueue_staff_notification(
    'user_report_received', new.id,
    case when new.report_kind = 'report' then 'important' else 'normal' end,
    case when new.report_kind = 'report' then 'New user report received' else 'New user feedback received' end,
    'A private report or feedback item is waiting in the staff queue.',
    false
  );
  return new;
end;
$function$;

revoke all on function private.notify_new_user_report() from public, anon, authenticated, service_role;

create trigger staff_notification_on_user_report_insert
  after insert on private.user_reports
  for each row execute function private.notify_new_user_report();

create function private.list_staff_notifications(p_limit integer default 100)
returns table (
  id uuid,
  event_type text,
  entity_id uuid,
  priority text,
  status text,
  title text,
  message text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null
    or not (private.has_staff_role('admin') or private.has_staff_role('owner'))
    or not private.has_recent_totp() then
    raise exception 'Staff notification access denied' using errcode = '42501';
  end if;

  return query
  select notification.id, notification.event_type, notification.entity_id,
    notification.priority, notification.status, notification.title,
    notification.message, notification.created_at, notification.updated_at
  from private.staff_notifications as notification
  where notification.recipient_user_id = v_user_id
    and notification.created_at >= pg_catalog.clock_timestamp() - interval '90 days'
  order by case notification.priority when 'critical' then 1 when 'important' then 2 else 3 end,
    notification.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 100));
end;
$function$;

revoke all on function private.list_staff_notifications(integer) from public, anon, service_role;
grant execute on function private.list_staff_notifications(integer) to authenticated;

create function public.list_staff_notifications(p_limit integer default 100)
returns table (
  id uuid,
  event_type text,
  entity_id uuid,
  priority text,
  status text,
  title text,
  message text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
volatile
security invoker
set search_path = ''
as $function$
  select * from private.list_staff_notifications(p_limit);
$function$;

revoke all on function public.list_staff_notifications(integer) from public, anon, service_role;
grant execute on function public.list_staff_notifications(integer) to authenticated;

create function private.update_staff_notification_status(p_notification_id uuid, p_status text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_before text;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_user_id is null
    or not (private.has_staff_role('admin') or private.has_staff_role('owner'))
    or not private.has_recent_totp() then
    raise exception 'Staff notification access denied' using errcode = '42501';
  end if;
  if p_status not in ('read', 'in_progress', 'resolved') then
    return false;
  end if;

  select notification.status into v_before
  from private.staff_notifications as notification
  where notification.id = p_notification_id
    and notification.recipient_user_id = v_user_id
  for update;
  if not found then return false; end if;
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
  where id = p_notification_id and recipient_user_id = v_user_id;

  insert into private.staff_notification_audit (
    notification_id, actor_user_id, status_before, status_after
  ) values (p_notification_id, v_user_id, v_before, p_status);
  return true;
end;
$function$;

revoke all on function private.update_staff_notification_status(uuid, text) from public, anon, service_role;
grant execute on function private.update_staff_notification_status(uuid, text) to authenticated;

create function public.update_staff_notification_status(p_notification_id uuid, p_status text)
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  select private.update_staff_notification_status(p_notification_id, p_status);
$function$;

revoke all on function public.update_staff_notification_status(uuid, text) from public, anon, service_role;
grant execute on function public.update_staff_notification_status(uuid, text) to authenticated;

create function private.purge_expired_staff_notifications()
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_deleted bigint;
begin
  delete from private.staff_notifications
  where created_at < pg_catalog.clock_timestamp() - interval '90 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

revoke all on function private.purge_expired_staff_notifications() from public, anon, authenticated, service_role;

-- Supabase Cron purges expired notifications every day. The cleanup operation
-- has no client execute grant and is scheduled under the migration owner.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
select cron.schedule(
  'purge-expired-staff-notifications',
  '17 3 * * *',
  'select private.purge_expired_staff_notifications();'
);
