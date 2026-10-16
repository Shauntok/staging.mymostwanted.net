-- Configure a small, safe built-in icon set for the fixed post reactions.
create table private.post_reaction_icon_settings (
  singleton boolean primary key default true check (singleton),
  helpful_icon text not null check (helpful_icon in ('spark','heart','thumbs_up','hands','check','lightbulb')),
  thanks_icon text not null check (thanks_icon in ('spark','heart','thumbs_up','hands','check','lightbulb')),
  support_icon text not null check (support_icon in ('spark','heart','thumbs_up','hands','check','lightbulb')),
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);
insert into private.post_reaction_icon_settings(singleton,helpful_icon,thanks_icon,support_icon)
values(true,'spark','heart','hands');
alter table private.post_reaction_icon_settings enable row level security;
revoke all on table private.post_reaction_icon_settings from public,anon,authenticated,service_role;

create table private.post_reaction_icon_audit (
  event_id bigint generated always as identity primary key,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  previous_icons jsonb not null,
  new_icons jsonb not null,
  reason text not null check (pg_catalog.length(reason) between 1 and 500),
  occurred_at timestamptz not null default pg_catalog.clock_timestamp()
);
alter table private.post_reaction_icon_audit enable row level security;
revoke all on table private.post_reaction_icon_audit from public,anon,authenticated,service_role;

create function private.public_reaction_icon_settings()
returns jsonb language sql stable security definer set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'helpful',settings.helpful_icon,'thanks',settings.thanks_icon,'support',settings.support_icon
  ) from private.post_reaction_icon_settings as settings where settings.singleton
$function$;
revoke all on function private.public_reaction_icon_settings() from public,anon,authenticated,service_role;
grant execute on function private.public_reaction_icon_settings() to anon,authenticated;

create function public.public_reaction_icon_settings()
returns jsonb language sql stable security invoker set search_path = ''
as $function$ select private.public_reaction_icon_settings(); $function$;
revoke all on function public.public_reaction_icon_settings() from public,service_role;
grant execute on function public.public_reaction_icon_settings() to anon,authenticated;

create function private.owner_get_reaction_icon_settings()
returns jsonb language plpgsql volatile security definer set search_path = ''
as $function$
begin
  if (select auth.uid()) is null or not private.has_staff_role('owner') then
    raise exception 'Owner access required' using errcode='42501';
  end if;
  return private.public_reaction_icon_settings();
end
$function$;
revoke all on function private.owner_get_reaction_icon_settings() from public,anon,authenticated,service_role;
grant execute on function private.owner_get_reaction_icon_settings() to authenticated;

create function public.owner_get_reaction_icon_settings()
returns jsonb language sql volatile security invoker set search_path = ''
as $function$ select private.owner_get_reaction_icon_settings(); $function$;
revoke all on function public.owner_get_reaction_icon_settings() from public,anon,service_role;
grant execute on function public.owner_get_reaction_icon_settings() to authenticated;

create function private.owner_update_reaction_icon_settings(
  p_helpful_icon text,p_thanks_icon text,p_support_icon text,p_reason text
)
returns boolean language plpgsql volatile security definer set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_reason text := pg_catalog.btrim(coalesce(p_reason,''));
  v_previous jsonb;
  v_new jsonb;
begin
  if v_user_id is null or not private.has_staff_role('owner') or not private.has_recent_totp()
    or p_helpful_icon not in ('spark','heart','thumbs_up','hands','check','lightbulb')
    or p_thanks_icon not in ('spark','heart','thumbs_up','hands','check','lightbulb')
    or p_support_icon not in ('spark','heart','thumbs_up','hands','check','lightbulb')
    or pg_catalog.length(v_reason) not between 1 and 500 then
    return false;
  end if;
  select pg_catalog.jsonb_build_object('helpful',settings.helpful_icon,'thanks',settings.thanks_icon,'support',settings.support_icon)
    into v_previous from private.post_reaction_icon_settings as settings where settings.singleton for update;
  if not found then return false; end if;
  if not private.has_staff_role('owner') or not private.has_recent_totp() then
    raise exception 'Owner access and recent TOTP required' using errcode='42501';
  end if;
  v_new:=pg_catalog.jsonb_build_object('helpful',p_helpful_icon,'thanks',p_thanks_icon,'support',p_support_icon);
  update private.post_reaction_icon_settings
    set helpful_icon=p_helpful_icon,thanks_icon=p_thanks_icon,support_icon=p_support_icon,updated_at=pg_catalog.clock_timestamp()
    where singleton;
  insert into private.post_reaction_icon_audit(actor_user_id,previous_icons,new_icons,reason)
    values(v_user_id,v_previous,v_new,v_reason);
  return true;
end
$function$;
revoke all on function private.owner_update_reaction_icon_settings(text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.owner_update_reaction_icon_settings(text,text,text,text) to authenticated;

create function public.owner_update_reaction_icon_settings(
  p_helpful_icon text,p_thanks_icon text,p_support_icon text,p_reason text
)
returns boolean language sql volatile security invoker set search_path = ''
as $function$ select private.owner_update_reaction_icon_settings(p_helpful_icon,p_thanks_icon,p_support_icon,p_reason); $function$;
revoke all on function public.owner_update_reaction_icon_settings(text,text,text,text) from public,anon,service_role;
grant execute on function public.owner_update_reaction_icon_settings(text,text,text,text) to authenticated;

-- Add the Owner-only icon manager to the dashboard without changing Admin defaults.
alter table private.staff_dashboard_preferences
  drop constraint staff_dashboard_preference_widget_count;
alter table private.staff_dashboard_preferences
  add constraint staff_dashboard_preference_widget_count check (pg_catalog.cardinality(widget_ids) between 1 and 18);

create or replace function private.staff_get_dashboard_layout()
returns jsonb language plpgsql volatile security definer set search_path = ''
as $function$
declare v_user_id uuid := (select auth.uid()); v_role text; v_widget_ids text[]; v_default_ids text[]; v_default_version integer;
begin
  if v_user_id is null then raise exception 'Staff access required' using errcode='42501'; end if;
  if private.has_staff_role('owner') then
    v_role:='owner';
    v_default_ids:=array['dashboard_summary','reports','submissions','post_editor','notifications','analytics','posts','homepage_tags','sanctions','staff_access','risk_lexicon','security_email','ip_blocks','recent_operations','storage_usage','hot_settings','clarifications','reaction_icons']::text[];
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
    v_allowed:=array['dashboard_summary','reports','submissions','post_editor','notifications','analytics','posts','homepage_tags','sanctions','staff_access','risk_lexicon','security_email','ip_blocks','recent_operations','storage_usage','hot_settings','clarifications','reaction_icons']::text[];
  elsif private.has_staff_role('admin') then
    v_role:='admin';
    v_allowed:=array['dashboard_summary','reports','submissions','post_editor','notifications','analytics','sanctions','recent_operations','storage_usage','clarifications']::text[];
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
