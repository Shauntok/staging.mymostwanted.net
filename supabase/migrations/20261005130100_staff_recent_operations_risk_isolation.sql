-- The recent-operations RPC is a privileged reader. Apply entity risk filters
-- before each source limit so hidden records cannot displace eligible activity.
-- Retained evidence/notification audits with missing parent metadata are visible
-- only to Owner, because Admin eligibility can no longer be established.

create or replace function private.staff_list_recent_operations(p_limit integer default 20)
returns table (
  occurred_at timestamptz,
  event_type text,
  action text,
  actor_username text
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_is_owner boolean;
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 30));
begin
  if v_user_id is null
    or not (private.has_staff_role('admin') or private.has_staff_role('owner'))
    or not private.has_recent_totp() then
    raise exception 'Staff access and recent TOTP required' using errcode = '42501';
  end if;
  v_is_owner := private.has_staff_role('owner');

  return query
  with operations as (
    (select event.occurred_at, 'post_moderated'::text as event_type, event.action,
       event.actor_user_id
     from private.moderation_events as event
     left join private.posts as post_row on post_row.id = event.post_id
     where v_is_owner or (
       event.risk_level = 'ordinary'
       and (post_row.id is null or post_row.risk_level = 'ordinary')
     )
     order by event.occurred_at desc, event.id desc limit v_limit)
    union all
    (select event.occurred_at, 'post_revised'::text, 'revised'::text, event.actor_user_id
     from private.post_revision_events as event
     join private.posts as post_row on post_row.id = event.post_id
     where v_is_owner or post_row.risk_level <> 'high'
     order by event.occurred_at desc, event.id desc limit v_limit)
    union all
    (select event.occurred_at, 'report_reviewed'::text, 'status_changed'::text, event.actor_user_id
     from private.user_report_audit as event
     join private.user_reports as report on report.id = event.report_id
     left join private.posts as post_row on post_row.id = report.post_id
     where event.action = 'status_changed'
       and (v_is_owner or post_row.risk_level is distinct from 'high')
     order by event.occurred_at desc, event.id desc limit v_limit)
    union all
    (select event.occurred_at, 'submission_reviewed'::text, 'status_changed'::text, event.actor_user_id
     from private.submission_staff_audit as event
     join private.submissions as submission on submission.id = event.submission_id
     where event.action = 'status_changed'
       and (v_is_owner or submission.risk_level <> 'high')
     order by event.occurred_at desc, event.id desc limit v_limit)
    union all
    (select event.occurred_at, 'account_sanctioned'::text, event.action, event.actor_user_id
     from private.account_sanction_events as event
     order by event.occurred_at desc, event.id desc limit v_limit)
    union all
    (select event.occurred_at, 'notification_updated'::text, event.status_after, event.actor_user_id
     from private.staff_notification_audit as event
     left join private.staff_notifications as notification on notification.id = event.notification_id
     left join private.submissions as submission
       on notification.event_type = 'submission_received' and submission.id = notification.entity_id
     left join private.user_reports as report
       on notification.event_type = 'user_report_received' and report.id = notification.entity_id
     left join private.posts as post_row on post_row.id = report.post_id
     where v_is_owner or (
       (notification.event_type = 'submission_received' and submission.risk_level <> 'high')
       or (notification.event_type = 'user_report_received' and report.id is not null
         and post_row.risk_level is distinct from 'high')
     )
     order by event.occurred_at desc, event.id desc limit v_limit)
    union all
    (select event.occurred_at, 'evidence_reviewed'::text, 'viewed'::text, event.actor_user_id
     from private.staff_evidence_access_audit as event
     left join private.evidence_metadata as evidence on evidence.id = event.evidence_id
     left join private.submissions as submission on submission.id = event.submission_id
     where v_is_owner or (
       evidence.submission_id = submission.id and submission.risk_level <> 'high'
     )
     order by event.occurred_at desc, event.id desc limit v_limit)
    union all
    (select event.occurred_at, 'role_updated'::text, event.action, event.actor_user_id
     from private.role_change_audit as event
     where v_is_owner
     order by event.occurred_at desc, event.id desc limit v_limit)
    union all
    (select event.occurred_at, 'owner_ip_block_updated'::text, event.action, event.actor_user_id
     from private.owner_ip_block_audit as event
     where v_is_owner
     order by event.occurred_at desc, event.id desc limit v_limit)
    union all
    (select event.occurred_at, 'evidence_visibility_updated'::text, event.visibility_after, event.actor_user_id
     from private.submission_evidence_visibility_audit as event
     where v_is_owner
     order by event.occurred_at desc, event.id desc limit v_limit)
    union all
    (select event.occurred_at, 'risk_rules_updated'::text, event.action, event.actor_user_id
     from private.submission_risk_lexicon_audit as event
     where v_is_owner
     order by event.occurred_at desc, event.id desc limit v_limit)
    union all
    (select event.occurred_at, 'homepage_tags_updated'::text, 'updated'::text, event.actor_user_id
     from private.home_tag_settings_audit as event
     where v_is_owner
     order by event.occurred_at desc, event.id desc limit v_limit)
  )
  select operations.occurred_at,
    operations.event_type,
    operations.action,
    profile.username
  from operations
  left join public.profiles as profile on profile.id = operations.actor_user_id
  order by operations.occurred_at desc, operations.event_type asc
  limit v_limit;
end;
$function$;

revoke all on function private.staff_list_recent_operations(integer)
  from public, anon, service_role;
grant execute on function private.staff_list_recent_operations(integer)
  to authenticated;
