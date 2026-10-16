-- Add the role-scoped Clarification manager without rewriting saved layouts.
alter table private.staff_dashboard_default_versions
  drop constraint staff_dashboard_default_admin_ids;
alter table private.staff_dashboard_default_versions
  add constraint staff_dashboard_default_admin_ids check (
    admin_widget_ids = array['dashboard_summary','reports','submissions','post_editor','notifications','analytics','sanctions']::text[]
    or admin_widget_ids = array['dashboard_summary','reports','submissions','post_editor','notifications','analytics','sanctions','recent_operations']::text[]
    or admin_widget_ids = array['dashboard_summary','reports','submissions','post_editor','notifications','analytics','sanctions','recent_operations','storage_usage']::text[]
    or admin_widget_ids = array['dashboard_summary','reports','submissions','post_editor','notifications','analytics','sanctions','recent_operations','storage_usage','clarifications']::text[]
  );

insert into private.staff_dashboard_default_versions(version,admin_widget_ids,reason,affected_admin_layouts)
select coalesce(max(version),0)+1,
  array['dashboard_summary','reports','submissions','post_editor','notifications','analytics','sanctions','recent_operations','storage_usage','clarifications']::text[],
  'Add the Clarification management tool to the Admin dashboard',0
from private.staff_dashboard_default_versions;

alter table private.staff_dashboard_preferences
  drop constraint staff_dashboard_preference_widget_count;
alter table private.staff_dashboard_preferences
  add constraint staff_dashboard_preference_widget_count check (pg_catalog.cardinality(widget_ids) between 1 and 17);

create or replace function private.staff_get_dashboard_layout()
returns jsonb language plpgsql volatile security definer set search_path = '' as $function$
declare v_user_id uuid:=(select auth.uid()); v_role text; v_widget_ids text[]; v_default_ids text[]; v_default_version integer;
begin
  if v_user_id is null then raise exception 'Staff access required' using errcode='42501'; end if;
  if private.has_staff_role('owner') then
    v_role:='owner';
    v_default_ids:=array['dashboard_summary','reports','submissions','post_editor','notifications','analytics','posts','homepage_tags','sanctions','staff_access','risk_lexicon','security_email','ip_blocks','recent_operations','storage_usage','hot_settings','clarifications']::text[];
  elsif private.has_staff_role('admin') then v_role:='admin';
  else raise exception 'Staff access required' using errcode='42501'; end if;
  select d.version into v_default_version from private.staff_dashboard_default_versions d order by d.version desc limit 1;
  if v_role='admin' then select d.admin_widget_ids into v_default_ids from private.staff_dashboard_default_versions d where d.version=v_default_version; end if;
  select p.widget_ids into v_widget_ids from private.staff_dashboard_preferences p where p.user_id=v_user_id and p.staff_role=v_role and (v_role='owner' or p.default_version=v_default_version);
  if v_widget_ids is null then v_widget_ids:=v_default_ids; end if;
  return pg_catalog.jsonb_build_object('role',v_role,'widget_ids',v_widget_ids,'default_version',v_default_version);
end;
$function$;

create or replace function private.staff_save_dashboard_layout(p_widget_ids text[])
returns boolean language plpgsql security definer set search_path = '' as $function$
declare v_user_id uuid:=(select auth.uid()); v_role text; v_allowed text[]; v_default_version integer; v_widget_ids text[]:=coalesce(p_widget_ids,'{}'::text[]);
begin
  if v_user_id is null then return false; end if;
  if private.has_staff_role('owner') then
    v_role:='owner';v_allowed:=array['dashboard_summary','reports','submissions','post_editor','notifications','analytics','posts','homepage_tags','sanctions','staff_access','risk_lexicon','security_email','ip_blocks','recent_operations','storage_usage','hot_settings','clarifications']::text[];
  elsif private.has_staff_role('admin') then
    v_role:='admin';v_allowed:=array['dashboard_summary','reports','submissions','post_editor','notifications','analytics','sanctions','recent_operations','storage_usage','clarifications']::text[];
  else return false; end if;
  if pg_catalog.cardinality(v_widget_ids)<1 or pg_catalog.cardinality(v_widget_ids)>pg_catalog.cardinality(v_allowed)
    or pg_catalog.cardinality(v_widget_ids)<>(select pg_catalog.count(distinct s.widget_id)::integer from pg_catalog.unnest(v_widget_ids) s(widget_id))
    or exists(select 1 from pg_catalog.unnest(v_widget_ids) s(widget_id) where s.widget_id is null or not(s.widget_id=any(v_allowed))) then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(70610001::bigint);
  select d.version into v_default_version from private.staff_dashboard_default_versions d order by d.version desc limit 1;
  if v_default_version is null or not private.has_staff_role(v_role) then return false; end if;
  insert into private.staff_dashboard_preferences(user_id,staff_role,widget_ids,default_version,updated_at)
  values(v_user_id,v_role,v_widget_ids,v_default_version,pg_catalog.clock_timestamp())
  on conflict(user_id) do update set staff_role=excluded.staff_role,widget_ids=excluded.widget_ids,default_version=excluded.default_version,updated_at=excluded.updated_at;
  return true;
end;
$function$;
