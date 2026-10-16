create table private.analytics_valid_read_settings_audit (
  event_id bigint generated always as identity primary key,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  previous_minimum integer not null,
  new_minimum integer not null,
  reason text not null check (pg_catalog.length(reason) between 1 and 500),
  occurred_at timestamptz not null default pg_catalog.clock_timestamp()
);
alter table private.analytics_valid_read_settings_audit enable row level security;
revoke all on table private.analytics_valid_read_settings_audit from public, anon, authenticated, service_role;

create function private.owner_get_hot_read_minimum()
returns integer language plpgsql volatile security definer set search_path = ''
as $function$
declare v_minimum integer;
begin
  if (select auth.uid()) is null or not private.has_staff_role('owner') then
    raise exception 'Owner access required' using errcode='42501';
  end if;
  select setting.minimum_reads_24h into v_minimum
  from private.analytics_valid_read_settings as setting where setting.singleton;
  return v_minimum;
end
$function$;
revoke all on function private.owner_get_hot_read_minimum() from public, anon, authenticated, service_role;
grant execute on function private.owner_get_hot_read_minimum() to authenticated;

create function public.owner_get_hot_read_minimum()
returns integer language sql volatile security invoker set search_path = ''
as $function$ select private.owner_get_hot_read_minimum(); $function$;
revoke all on function public.owner_get_hot_read_minimum() from public, anon, service_role;
grant execute on function public.owner_get_hot_read_minimum() to authenticated;

create function private.owner_update_hot_read_minimum(p_minimum integer,p_reason text)
returns boolean language plpgsql volatile security definer set search_path = ''
as $function$
declare v_user_id uuid := (select auth.uid()); v_previous integer; v_reason text := pg_catalog.btrim(coalesce(p_reason,''));
begin
  if v_user_id is null or not private.has_staff_role('owner') or not private.has_recent_totp()
    or p_minimum is null or p_minimum not between 1 and 100000 or pg_catalog.length(v_reason) not between 1 and 500 then
    return false;
  end if;
  select setting.minimum_reads_24h into v_previous
  from private.analytics_valid_read_settings as setting where setting.singleton for update;
  if not found then return false; end if;
  if exists(select 1 from private.analytics_valid_read_settings as setting where setting.singleton and (setting.collection_enabled or setting.hot_enabled)) then
    raise exception 'Hot settings are locked while collection is enabled' using errcode='55000';
  end if;
  if not private.has_staff_role('owner') or not private.has_recent_totp() then
    raise exception 'Owner access and recent TOTP required' using errcode='42501';
  end if;
  if v_previous=p_minimum then return true; end if;
  update private.analytics_valid_read_settings set minimum_reads_24h=p_minimum,updated_at=pg_catalog.clock_timestamp() where singleton;
  insert into private.analytics_valid_read_settings_audit(actor_user_id,previous_minimum,new_minimum,reason)
  values(v_user_id,v_previous,p_minimum,v_reason);
  return true;
end
$function$;
revoke all on function private.owner_update_hot_read_minimum(integer,text) from public, anon, authenticated, service_role;
grant execute on function private.owner_update_hot_read_minimum(integer,text) to authenticated;

create function public.owner_update_hot_read_minimum(p_minimum integer,p_reason text)
returns boolean language sql volatile security invoker set search_path = ''
as $function$ select private.owner_update_hot_read_minimum(p_minimum,p_reason); $function$;
revoke all on function public.owner_update_hot_read_minimum(integer,text) from public, anon, service_role;
grant execute on function public.owner_update_hot_read_minimum(integer,text) to authenticated;

-- Extend the Owner-only widget registry; Admin layouts remain unchanged.
alter table private.staff_dashboard_preferences
  drop constraint staff_dashboard_preference_widget_count;
alter table private.staff_dashboard_preferences
  add constraint staff_dashboard_preference_widget_count check (pg_catalog.cardinality(widget_ids) between 1 and 16);

create or replace function private.staff_get_dashboard_layout()
returns jsonb language plpgsql volatile security definer set search_path = ''
as $function$
declare v_user_id uuid := (select auth.uid()); v_role text; v_widget_ids text[]; v_default_ids text[]; v_default_version integer;
begin
  if v_user_id is null then raise exception 'Staff access required' using errcode='42501'; end if;
  if private.has_staff_role('owner') then
    v_role:='owner';
    v_default_ids:=array['dashboard_summary','reports','submissions','post_editor','notifications','analytics','posts','homepage_tags','sanctions','staff_access','risk_lexicon','security_email','ip_blocks','recent_operations','storage_usage','hot_settings']::text[];
  elsif private.has_staff_role('admin') then v_role:='admin';
  else raise exception 'Staff access required' using errcode='42501'; end if;
  select defaults.version into v_default_version from private.staff_dashboard_default_versions as defaults order by defaults.version desc limit 1;
  if v_role='admin' then select defaults.admin_widget_ids into v_default_ids from private.staff_dashboard_default_versions as defaults where defaults.version=v_default_version; end if;
  select preference.widget_ids into v_widget_ids from private.staff_dashboard_preferences as preference where preference.user_id=v_user_id and preference.staff_role=v_role and (v_role='owner' or preference.default_version=v_default_version);
  if v_widget_ids is null then v_widget_ids:=v_default_ids; end if;
  return pg_catalog.jsonb_build_object('role',v_role,'widget_ids',v_widget_ids,'default_version',v_default_version);
end
$function$;

create or replace function private.staff_save_dashboard_layout(p_widget_ids text[])
returns boolean language plpgsql security definer set search_path = ''
as $function$
declare v_user_id uuid := (select auth.uid()); v_role text; v_allowed text[]; v_default_version integer; v_widget_ids text[]:=coalesce(p_widget_ids,'{}'::text[]);
begin
  if v_user_id is null then return false; end if;
  if private.has_staff_role('owner') then
    v_role:='owner';
    v_allowed:=array['dashboard_summary','reports','submissions','post_editor','notifications','analytics','posts','homepage_tags','sanctions','staff_access','risk_lexicon','security_email','ip_blocks','recent_operations','storage_usage','hot_settings']::text[];
  elsif private.has_staff_role('admin') then
    v_role:='admin';
    v_allowed:=array['dashboard_summary','reports','submissions','post_editor','notifications','analytics','sanctions','recent_operations','storage_usage']::text[];
  else return false; end if;
  if pg_catalog.cardinality(v_widget_ids)<1 or pg_catalog.cardinality(v_widget_ids)>pg_catalog.cardinality(v_allowed)
    or pg_catalog.cardinality(v_widget_ids)<>(select pg_catalog.count(distinct selected.widget_id)::integer from pg_catalog.unnest(v_widget_ids) as selected(widget_id))
    or exists(select 1 from pg_catalog.unnest(v_widget_ids) as selected(widget_id) where selected.widget_id is null or not (selected.widget_id=any(v_allowed))) then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(70610001::bigint);
  select defaults.version into v_default_version from private.staff_dashboard_default_versions as defaults order by defaults.version desc limit 1;
  if v_default_version is null or not private.has_staff_role(v_role) then return false; end if;
  insert into private.staff_dashboard_preferences(user_id,staff_role,widget_ids,default_version,updated_at)
  values(v_user_id,v_role,v_widget_ids,v_default_version,pg_catalog.clock_timestamp())
  on conflict(user_id) do update set staff_role=excluded.staff_role,widget_ids=excluded.widget_ids,default_version=excluded.default_version,updated_at=excluded.updated_at;
  return true;
end
$function$;

