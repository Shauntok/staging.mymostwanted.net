-- Adds a privacy-bounded staff operations feed and includes it in the
-- versioned dashboard defaults. The feed never returns reasons, report text,
-- submission text, targets, evidence paths, IP fingerprints, or security data.

alter table private.staff_dashboard_default_versions
  drop constraint staff_dashboard_default_admin_ids;
alter table private.staff_dashboard_default_versions
  add constraint staff_dashboard_default_admin_ids check (
    admin_widget_ids = array['dashboard_summary', 'reports', 'submissions', 'post_editor', 'notifications', 'analytics', 'sanctions']::text[]
    or admin_widget_ids = array['dashboard_summary', 'reports', 'submissions', 'post_editor', 'notifications', 'analytics', 'sanctions', 'recent_operations']::text[]
  );

insert into private.staff_dashboard_default_versions (
  version, admin_widget_ids, reason, affected_admin_layouts
)
select coalesce(max(version), 0) + 1,
  array['dashboard_summary', 'reports', 'submissions', 'post_editor', 'notifications', 'analytics', 'sanctions', 'recent_operations']::text[],
  'Add the recent operations dashboard widget', 0
from private.staff_dashboard_default_versions;

alter table private.staff_dashboard_preferences
  drop constraint staff_dashboard_preference_widget_count;
alter table private.staff_dashboard_preferences
  add constraint staff_dashboard_preference_widget_count
  check (pg_catalog.cardinality(widget_ids) between 1 and 14);

create index moderation_events_recent_operations_idx
  on private.moderation_events (occurred_at desc, id desc);
create index post_revision_events_recent_operations_idx
  on private.post_revision_events (occurred_at desc, id desc);
create index user_report_audit_recent_operations_idx
  on private.user_report_audit (occurred_at desc, id desc);
create index submission_staff_audit_recent_operations_idx
  on private.submission_staff_audit (occurred_at desc, id desc);
create index account_sanction_events_recent_operations_idx
  on private.account_sanction_events (occurred_at desc, id desc);
create index staff_evidence_access_recent_operations_idx
  on private.staff_evidence_access_audit (occurred_at desc, id desc);
create index submission_evidence_visibility_recent_operations_idx
  on private.submission_evidence_visibility_audit (occurred_at desc, id desc);
create index risk_lexicon_audit_recent_operations_idx
  on private.submission_risk_lexicon_audit (occurred_at desc, id desc);
create index home_tag_settings_recent_operations_idx
  on private.home_tag_settings_audit (occurred_at desc, id desc);

create function private.staff_list_recent_operations(p_limit integer default 20)
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
     order by event.occurred_at desc, event.id desc limit v_limit)
    union all
    (select event.occurred_at, 'evidence_reviewed'::text, 'viewed'::text, event.actor_user_id
     from private.staff_evidence_access_audit as event
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

create function public.staff_list_recent_operations(p_limit integer default 20)
returns table (
  occurred_at timestamptz,
  event_type text,
  action text,
  actor_username text
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select * from private.staff_list_recent_operations(p_limit);
$function$;

revoke all on function public.staff_list_recent_operations(integer)
  from public, anon, service_role;
grant execute on function public.staff_list_recent_operations(integer)
  to authenticated;

create or replace function private.staff_get_dashboard_layout()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_role text;
  v_widget_ids text[];
  v_default_ids text[];
  v_default_version integer;
begin
  if v_user_id is null then raise exception 'Staff access required' using errcode = '42501'; end if;
  if private.has_staff_role('owner') then
    v_role := 'owner';
    v_default_ids := array['dashboard_summary', 'reports', 'submissions', 'post_editor', 'notifications', 'analytics', 'posts', 'homepage_tags', 'sanctions', 'staff_access', 'risk_lexicon', 'security_email', 'ip_blocks', 'recent_operations']::text[];
  elsif private.has_staff_role('admin') then
    v_role := 'admin';
  else
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  select defaults.version into v_default_version
  from private.staff_dashboard_default_versions as defaults
  order by defaults.version desc limit 1;
  if v_role = 'admin' then
    select defaults.admin_widget_ids into v_default_ids
    from private.staff_dashboard_default_versions as defaults
    where defaults.version = v_default_version;
  end if;
  select preference.widget_ids into v_widget_ids
  from private.staff_dashboard_preferences as preference
  where preference.user_id = v_user_id and preference.staff_role = v_role
    and (v_role = 'owner' or preference.default_version = v_default_version);
  if v_widget_ids is null then v_widget_ids := v_default_ids; end if;
  return pg_catalog.jsonb_build_object('role', v_role, 'widget_ids', v_widget_ids, 'default_version', v_default_version);
end;
$function$;

create or replace function private.staff_save_dashboard_layout(p_widget_ids text[])
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_role text;
  v_allowed text[];
  v_default_version integer;
  v_widget_ids text[] := coalesce(p_widget_ids, '{}'::text[]);
begin
  if v_user_id is null then return false; end if;
  if private.has_staff_role('owner') then
    v_role := 'owner';
    v_allowed := array['dashboard_summary', 'reports', 'submissions', 'post_editor', 'notifications', 'analytics', 'posts', 'homepage_tags', 'sanctions', 'staff_access', 'risk_lexicon', 'security_email', 'ip_blocks', 'recent_operations']::text[];
  elsif private.has_staff_role('admin') then
    v_role := 'admin';
    v_allowed := array['dashboard_summary', 'reports', 'submissions', 'post_editor', 'notifications', 'analytics', 'sanctions', 'recent_operations']::text[];
  else return false;
  end if;

  if pg_catalog.cardinality(v_widget_ids) < 1
    or pg_catalog.cardinality(v_widget_ids) > pg_catalog.cardinality(v_allowed)
    or pg_catalog.cardinality(v_widget_ids) <> (
      select pg_catalog.count(distinct selected.widget_id)::integer
      from pg_catalog.unnest(v_widget_ids) as selected(widget_id)
    )
    or exists (
      select 1 from pg_catalog.unnest(v_widget_ids) as selected(widget_id)
      where selected.widget_id is null or not (selected.widget_id = any(v_allowed))
    ) then return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(70610001::bigint);
  select defaults.version into v_default_version
  from private.staff_dashboard_default_versions as defaults
  order by defaults.version desc limit 1;
  if v_default_version is null or not private.has_staff_role(v_role) then return false; end if;
  insert into private.staff_dashboard_preferences (user_id, staff_role, widget_ids, default_version, updated_at)
  values (v_user_id, v_role, v_widget_ids, v_default_version, pg_catalog.clock_timestamp())
  on conflict (user_id) do update set staff_role = excluded.staff_role, widget_ids = excluded.widget_ids,
    default_version = excluded.default_version, updated_at = excluded.updated_at;
  return true;
end;
$function$;

revoke all on function private.staff_list_recent_operations(integer) from public, anon, service_role;
grant execute on function private.staff_list_recent_operations(integer) to authenticated;
revoke all on function public.staff_list_recent_operations(integer) from public, anon, service_role;
grant execute on function public.staff_list_recent_operations(integer) to authenticated;
