-- Staff dashboard layouts store only stable, role-scoped widget IDs.
-- Owner reset operations advance a version and clear every Admin preference.

create table private.staff_dashboard_default_versions (
  version integer primary key,
  admin_widget_ids text[] not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  reason text not null,
  affected_admin_layouts integer not null default 0,
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint staff_dashboard_default_version_positive check (version > 0),
  constraint staff_dashboard_default_admin_ids check (
    admin_widget_ids = array['dashboard_summary', 'reports', 'submissions', 'post_editor', 'notifications', 'analytics', 'sanctions']::text[]
  ),
  constraint staff_dashboard_default_reason check (
    pg_catalog.char_length(pg_catalog.btrim(reason)) between 1 and 500
  ),
  constraint staff_dashboard_default_affected_count check (affected_admin_layouts >= 0)
);

insert into private.staff_dashboard_default_versions (version, admin_widget_ids, reason)
values (1, array['dashboard_summary', 'reports', 'submissions', 'post_editor', 'notifications', 'analytics', 'sanctions']::text[], 'Initial MMWR staff dashboard default');

alter table private.staff_dashboard_default_versions enable row level security;
revoke all on table private.staff_dashboard_default_versions from public, anon, authenticated, service_role;

create function private.reject_staff_dashboard_default_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' then
    if old.actor_user_id is not null
      and new.actor_user_id is null
      and (to_jsonb(old) - 'actor_user_id') = (to_jsonb(new) - 'actor_user_id') then
      return new;
    end if;
  end if;
  raise exception 'staff dashboard defaults are append-only' using errcode = '42501';
end;
$function$;

revoke all on function private.reject_staff_dashboard_default_mutation() from public, anon, authenticated, service_role;

create trigger staff_dashboard_default_versions_append_only
  before update or delete on private.staff_dashboard_default_versions
  for each row execute function private.reject_staff_dashboard_default_mutation();

create trigger staff_dashboard_default_versions_no_truncate
  before truncate on private.staff_dashboard_default_versions
  for each statement execute function private.reject_staff_dashboard_default_mutation();

create table private.staff_dashboard_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  staff_role text not null,
  widget_ids text[] not null,
  default_version integer not null references private.staff_dashboard_default_versions (version),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint staff_dashboard_preference_role check (staff_role in ('admin', 'owner')),
  constraint staff_dashboard_preference_widget_count check (pg_catalog.cardinality(widget_ids) between 1 and 11)
);

alter table private.staff_dashboard_preferences enable row level security;
revoke all on table private.staff_dashboard_preferences from public, anon, authenticated, service_role;

create function private.staff_get_dashboard_layout()
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
  if v_user_id is null then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  if private.has_staff_role('owner') then
    v_role := 'owner';
    v_default_ids := array['dashboard_summary', 'reports', 'submissions', 'post_editor', 'notifications', 'analytics', 'posts', 'homepage_tags', 'sanctions', 'staff_access', 'risk_lexicon']::text[];
  elsif private.has_staff_role('admin') then
    v_role := 'admin';
  else
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  select defaults.version
    into v_default_version
  from private.staff_dashboard_default_versions as defaults
  order by defaults.version desc
  limit 1;

  if v_role = 'admin' then
    select defaults.admin_widget_ids into v_default_ids
    from private.staff_dashboard_default_versions as defaults
    where defaults.version = v_default_version;
  end if;

  select preference.widget_ids into v_widget_ids
  from private.staff_dashboard_preferences as preference
  where preference.user_id = v_user_id
    and preference.staff_role = v_role
    and (v_role = 'owner' or preference.default_version = v_default_version);

  if v_widget_ids is null then v_widget_ids := v_default_ids; end if;

  return pg_catalog.jsonb_build_object(
    'role', v_role,
    'widget_ids', v_widget_ids,
    'default_version', v_default_version
  );
end;
$function$;

revoke all on function private.staff_get_dashboard_layout() from public, anon, service_role;
grant execute on function private.staff_get_dashboard_layout() to authenticated;

create function public.staff_get_dashboard_layout()
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $function$
  select private.staff_get_dashboard_layout();
$function$;

revoke all on function public.staff_get_dashboard_layout() from public, anon, service_role;
grant execute on function public.staff_get_dashboard_layout() to authenticated;

create function private.staff_save_dashboard_layout(p_widget_ids text[])
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
    v_allowed := array['dashboard_summary', 'reports', 'submissions', 'post_editor', 'notifications', 'analytics', 'posts', 'homepage_tags', 'sanctions', 'staff_access', 'risk_lexicon']::text[];
  elsif private.has_staff_role('admin') then
    v_role := 'admin';
    v_allowed := array['dashboard_summary', 'reports', 'submissions', 'post_editor', 'notifications', 'analytics', 'sanctions']::text[];
  else
    return false;
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
    ) then
    return false;
  end if;

  -- Serialize saves against Owner resets so a just-saved Admin layout cannot
  -- silently become attached to an obsolete default version.
  perform pg_catalog.pg_advisory_xact_lock(70610001::bigint);
  select defaults.version into v_default_version
  from private.staff_dashboard_default_versions as defaults
  order by defaults.version desc limit 1;
  if v_default_version is null then return false; end if;

  -- A role change may complete while this request waits on the shared layout lock.
  if not private.has_staff_role(v_role) then return false; end if;

  insert into private.staff_dashboard_preferences (user_id, staff_role, widget_ids, default_version, updated_at)
  values (v_user_id, v_role, v_widget_ids, v_default_version, pg_catalog.clock_timestamp())
  on conflict (user_id) do update set
    staff_role = excluded.staff_role,
    widget_ids = excluded.widget_ids,
    default_version = excluded.default_version,
    updated_at = excluded.updated_at;
  return true;
end;
$function$;

revoke all on function private.staff_save_dashboard_layout(text[]) from public, anon, service_role;
grant execute on function private.staff_save_dashboard_layout(text[]) to authenticated;

create function public.staff_save_dashboard_layout(p_widget_ids text[])
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  select private.staff_save_dashboard_layout(p_widget_ids);
$function$;

revoke all on function public.staff_save_dashboard_layout(text[]) from public, anon, service_role;
grant execute on function public.staff_save_dashboard_layout(text[]) to authenticated;

create function private.owner_reset_admin_dashboard_layouts(p_reason text)
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
    array['dashboard_summary', 'reports', 'submissions', 'post_editor', 'notifications', 'analytics', 'sanctions']::text[],
    v_actor,
    pg_catalog.btrim(p_reason),
    v_deleted
  );

  return v_deleted;
end;
$function$;

revoke all on function private.owner_reset_admin_dashboard_layouts(text) from public, anon, service_role;
grant execute on function private.owner_reset_admin_dashboard_layouts(text) to authenticated;

create function public.owner_reset_admin_dashboard_layouts(p_reason text)
returns integer
language sql
security invoker
set search_path = ''
as $function$
  select private.owner_reset_admin_dashboard_layouts(p_reason);
$function$;

revoke all on function public.owner_reset_admin_dashboard_layouts(text) from public, anon, service_role;
grant execute on function public.owner_reset_admin_dashboard_layouts(text) to authenticated;
