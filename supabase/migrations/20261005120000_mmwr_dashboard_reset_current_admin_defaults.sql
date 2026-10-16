-- Keep the versioned Owner reset template aligned with the current Admin
-- registry. Earlier versions remain valid historical defaults.

alter table private.staff_dashboard_default_versions
  drop constraint staff_dashboard_default_admin_ids;

alter table private.staff_dashboard_default_versions
  add constraint staff_dashboard_default_admin_ids check (
    admin_widget_ids = array['dashboard_summary', 'reports', 'submissions', 'post_editor', 'notifications', 'analytics', 'sanctions']::text[]
    or admin_widget_ids = array['dashboard_summary', 'reports', 'submissions', 'post_editor', 'notifications', 'analytics', 'sanctions', 'recent_operations']::text[]
    or admin_widget_ids = array['dashboard_summary', 'reports', 'submissions', 'post_editor', 'notifications', 'analytics', 'sanctions', 'recent_operations', 'storage_usage']::text[]
    or admin_widget_ids = array['dashboard_summary', 'reports', 'submissions', 'post_editor', 'notifications', 'analytics', 'sanctions', 'recent_operations', 'storage_usage', 'clarifications']::text[]
  );

create or replace function private.owner_reset_admin_dashboard_layouts(p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_old_version integer;
  v_new_version integer;
  v_deleted integer;
begin
  if v_actor is null
    or not private.has_staff_role('owner')
    or not private.has_recent_totp() then
    raise exception 'Owner access and recent TOTP required' using errcode = '42501';
  end if;
  if p_reason is null
    or pg_catalog.char_length(pg_catalog.btrim(p_reason)) not between 1 and 500 then
    raise exception 'A reason between 1 and 500 characters is required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(70610001::bigint);
  select defaults.version into v_old_version
  from private.staff_dashboard_default_versions as defaults
  order by defaults.version desc limit 1 for update;
  if v_old_version is null then
    raise exception 'Dashboard default version is unavailable' using errcode = '55000';
  end if;
  if not private.has_staff_role('owner') or not private.has_recent_totp() then
    raise exception 'Owner access and recent TOTP required' using errcode = '42501';
  end if;
  v_new_version := v_old_version + 1;

  delete from private.staff_dashboard_preferences as preference
  where preference.staff_role = 'admin';
  get diagnostics v_deleted = row_count;

  insert into private.staff_dashboard_default_versions (
    version, admin_widget_ids, actor_user_id, reason, affected_admin_layouts
  ) values (
    v_new_version,
    array['dashboard_summary', 'reports', 'submissions', 'post_editor', 'notifications', 'analytics', 'sanctions', 'recent_operations', 'storage_usage', 'clarifications']::text[],
    v_actor,
    pg_catalog.btrim(p_reason),
    v_deleted
  );

  return v_deleted;
end;
$function$;

revoke all on function private.owner_reset_admin_dashboard_layouts(text) from public, anon, service_role;
grant execute on function private.owner_reset_admin_dashboard_layouts(text) to authenticated;
