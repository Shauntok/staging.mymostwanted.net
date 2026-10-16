-- Owner-only, time-limited IP restrictions. Only a keyed HMAC is stored while
-- a restriction is active; the append-only audit intentionally stores no IP hash.

create table private.owner_ip_blocks (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null,
  reason text not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  expires_at timestamptz not null,
  constraint owner_ip_block_fingerprint_valid check (fingerprint ~ '^[0-9a-f]{64}$'),
  constraint owner_ip_block_reason_valid check (pg_catalog.char_length(pg_catalog.btrim(reason)) between 1 and 500),
  constraint owner_ip_block_expiry_future check (expires_at > created_at)
);

create unique index owner_ip_block_active_fingerprint_idx
  on private.owner_ip_blocks (fingerprint);
create index owner_ip_block_expiry_idx
  on private.owner_ip_blocks (expires_at);
alter table private.owner_ip_blocks enable row level security;
revoke all on table private.owner_ip_blocks from public, anon, authenticated, service_role;

create table private.owner_ip_block_audit (
  id bigint generated always as identity primary key,
  block_id uuid not null,
  action text not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  reason text not null,
  expires_at timestamptz not null,
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint owner_ip_block_audit_action_valid check (action in ('created', 'lifted', 'expired')),
  constraint owner_ip_block_audit_reason_valid check (pg_catalog.char_length(pg_catalog.btrim(reason)) between 1 and 500)
);

create index owner_ip_block_audit_time_idx on private.owner_ip_block_audit (occurred_at desc);
create index owner_ip_block_audit_block_idx on private.owner_ip_block_audit (block_id, occurred_at);
alter table private.owner_ip_block_audit enable row level security;
revoke all on table private.owner_ip_block_audit from public, anon, authenticated, service_role;

create function private.reject_owner_ip_block_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE'
    and old.actor_user_id is not null
    and new.actor_user_id is null
    and (to_jsonb(old) - 'actor_user_id') = (to_jsonb(new) - 'actor_user_id') then
    return new;
  end if;
  raise exception 'owner IP block audit is append-only' using errcode = '42501';
end;
$function$;

revoke all on function private.reject_owner_ip_block_audit_mutation() from public, anon, authenticated, service_role;
create trigger owner_ip_block_audit_append_only
  before update or delete on private.owner_ip_block_audit
  for each row execute function private.reject_owner_ip_block_audit_mutation();
create trigger owner_ip_block_audit_no_truncate
  before truncate on private.owner_ip_block_audit
  for each statement execute function private.reject_owner_ip_block_audit_mutation();

create function private.owner_add_ip_block(p_fingerprint text, p_reason text, p_expires_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null
    or not private.has_staff_role('owner')
    or not private.has_recent_totp()
    or p_fingerprint is null
    or p_fingerprint !~ '^[0-9a-f]{64}$'
    or p_expires_at is null
    or p_expires_at <= pg_catalog.clock_timestamp()
    or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason, ''))) not between 1 and 500 then
    raise exception 'Owner, recent TOTP, valid expiry, fingerprint and reason are required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_fingerprint, 73530101));
  perform private.purge_expired_owner_ip_blocks();
  -- Recheck authorization after waits and cleanup before creating the block.
  if not private.has_staff_role('owner')
    or not private.has_recent_totp()
    or p_expires_at <= pg_catalog.clock_timestamp() then
    raise exception 'Owner, recent TOTP and future expiry are required' using errcode = '42501';
  end if;
  if exists (select 1 from private.owner_ip_blocks where fingerprint = p_fingerprint) then
    raise exception 'An active restriction already exists for this address' using errcode = '23505';
  end if;

  insert into private.owner_ip_blocks (fingerprint, reason, actor_user_id, expires_at)
  values (p_fingerprint, pg_catalog.btrim(p_reason), v_actor, p_expires_at)
  returning id into v_id;
  insert into private.owner_ip_block_audit (block_id, action, actor_user_id, reason, expires_at)
  values (v_id, 'created', v_actor, pg_catalog.btrim(p_reason), p_expires_at);
  return v_id;
end;
$function$;

revoke all on function private.owner_add_ip_block(text, text, timestamptz) from public, anon, authenticated, service_role;
grant execute on function private.owner_add_ip_block(text, text, timestamptz) to authenticated;
create function public.owner_add_ip_block(p_fingerprint text, p_reason text, p_expires_at timestamptz)
returns uuid language sql security invoker set search_path = ''
as $function$ select private.owner_add_ip_block(p_fingerprint, p_reason, p_expires_at); $function$;
revoke all on function public.owner_add_ip_block(text, text, timestamptz) from public, anon, service_role;
grant execute on function public.owner_add_ip_block(text, text, timestamptz) to authenticated;

create function private.owner_lift_ip_block(p_block_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_block private.owner_ip_blocks%rowtype;
  v_actor uuid := (select auth.uid());
  v_now timestamptz;
begin
  if v_actor is null
    or not private.has_staff_role('owner')
    or not private.has_recent_totp()
    or p_block_id is null
    or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason, ''))) not between 1 and 500 then
    return false;
  end if;

  select * into v_block from private.owner_ip_blocks where id = p_block_id for update;
  if not found then return false; end if;
  v_now := pg_catalog.clock_timestamp();
  if not private.has_staff_role('owner')
    or not private.has_recent_totp()
    or v_block.expires_at <= v_now then
    return false;
  end if;
  delete from private.owner_ip_blocks where id = p_block_id;
  insert into private.owner_ip_block_audit (block_id, action, actor_user_id, reason, expires_at)
  values (p_block_id, 'lifted', v_actor, pg_catalog.btrim(p_reason), v_block.expires_at);
  return true;
end;
$function$;

revoke all on function private.owner_lift_ip_block(uuid, text) from public, anon, authenticated, service_role;
grant execute on function private.owner_lift_ip_block(uuid, text) to authenticated;
create function public.owner_lift_ip_block(p_block_id uuid, p_reason text)
returns boolean language sql security invoker set search_path = ''
as $function$ select private.owner_lift_ip_block(p_block_id, p_reason); $function$;
revoke all on function public.owner_lift_ip_block(uuid, text) from public, anon, service_role;
grant execute on function public.owner_lift_ip_block(uuid, text) to authenticated;

create function private.owner_list_ip_blocks()
returns table (block_id uuid, fingerprint text, reason text, actor_username text, created_at timestamptz, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if not private.has_staff_role('owner') or not private.has_recent_totp() then
    raise exception 'Owner access and recent TOTP required' using errcode = '42501';
  end if;
  return query
  select block.id, block.fingerprint, block.reason, profile.username, block.created_at, block.expires_at
  from private.owner_ip_blocks as block
  left join public.profiles as profile on profile.id = block.actor_user_id
  where block.expires_at > pg_catalog.clock_timestamp()
  order by block.created_at desc, block.id desc
  limit 100;
end;
$function$;

revoke all on function private.owner_list_ip_blocks() from public, anon, service_role;
grant execute on function private.owner_list_ip_blocks() to authenticated;
create function public.owner_list_ip_blocks()
returns table (block_id uuid, fingerprint text, reason text, actor_username text, created_at timestamptz, expires_at timestamptz)
language sql volatile security invoker set search_path = ''
as $function$ select * from private.owner_list_ip_blocks(); $function$;
revoke all on function public.owner_list_ip_blocks() from public, anon, service_role;
grant execute on function public.owner_list_ip_blocks() to authenticated;

create function private.owner_list_ip_block_audit(p_limit integer default 50)
returns table (event_id bigint, block_id uuid, action text, reason text, actor_username text, occurred_at timestamptz, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if not private.has_staff_role('owner') or not private.has_recent_totp() then
    raise exception 'Owner access and recent TOTP required' using errcode = '42501';
  end if;
  return query
  select audit.id, audit.block_id, audit.action, audit.reason, profile.username, audit.occurred_at, audit.expires_at
  from private.owner_ip_block_audit as audit
  left join public.profiles as profile on profile.id = audit.actor_user_id
  order by audit.occurred_at desc, audit.id desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
end;
$function$;

revoke all on function private.owner_list_ip_block_audit(integer) from public, anon, service_role;
grant execute on function private.owner_list_ip_block_audit(integer) to authenticated;
create function public.owner_list_ip_block_audit(p_limit integer default 50)
returns table (event_id bigint, block_id uuid, action text, reason text, actor_username text, occurred_at timestamptz, expires_at timestamptz)
language sql volatile security invoker set search_path = ''
as $function$ select * from private.owner_list_ip_block_audit(p_limit); $function$;
revoke all on function public.owner_list_ip_block_audit(integer) from public, anon, service_role;
grant execute on function public.owner_list_ip_block_audit(integer) to authenticated;

create function private.mmwr_is_ip_blocked(p_fingerprint text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when p_fingerprint ~ '^[0-9a-f]{64}$' then exists (
      select 1 from private.owner_ip_blocks as block
      where block.fingerprint = p_fingerprint
        and block.expires_at > pg_catalog.statement_timestamp()
    )
    else false
  end;
$function$;

revoke all on function private.mmwr_is_ip_blocked(text) from public, anon, authenticated, service_role;
create function public.mmwr_is_ip_blocked(p_fingerprint text)
returns boolean language sql stable security definer set search_path = ''
as $function$ select private.mmwr_is_ip_blocked(p_fingerprint); $function$;
-- This lookup is used by trusted server-side enforcement only. Do not expose
-- whether an arbitrary fingerprint is blocked to browser roles.
revoke all on function public.mmwr_is_ip_blocked(text) from public, anon, authenticated, service_role;
grant execute on function public.mmwr_is_ip_blocked(text) to service_role;

create function private.purge_expired_owner_ip_blocks()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count integer := 0;
begin
  with expired as (
    delete from private.owner_ip_blocks as block
    where block.expires_at <= pg_catalog.clock_timestamp()
    returning block.id, block.expires_at
  )
  insert into private.owner_ip_block_audit (block_id, action, actor_user_id, reason, expires_at)
  select expired.id, 'expired', null, 'Restriction expired automatically', expired.expires_at
  from expired;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function private.purge_expired_owner_ip_blocks() from public, anon, authenticated, service_role;
select cron.schedule(
  'mmwr-purge-expired-owner-ip-blocks',
  '*/5 * * * *',
  'select private.purge_expired_owner_ip_blocks();'
);

-- Extend the database-validated Owner dashboard registry. Admin widgets remain
-- unchanged; existing saved Owner layouts remain valid and may add this widget.
alter table private.staff_dashboard_preferences
  drop constraint staff_dashboard_preference_widget_count;
alter table private.staff_dashboard_preferences
  add constraint staff_dashboard_preference_widget_count
  check (pg_catalog.cardinality(widget_ids) between 1 and 13);

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
    v_default_ids := array['dashboard_summary', 'reports', 'submissions', 'post_editor', 'notifications', 'analytics', 'posts', 'homepage_tags', 'sanctions', 'staff_access', 'risk_lexicon', 'security_email', 'ip_blocks']::text[];
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
    v_allowed := array['dashboard_summary', 'reports', 'submissions', 'post_editor', 'notifications', 'analytics', 'posts', 'homepage_tags', 'sanctions', 'staff_access', 'risk_lexicon', 'security_email', 'ip_blocks']::text[];
  elsif private.has_staff_role('admin') then
    v_role := 'admin';
    v_allowed := array['dashboard_summary', 'reports', 'submissions', 'post_editor', 'notifications', 'analytics', 'sanctions']::text[];
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
  if v_default_version is null then return false; end if;
  insert into private.staff_dashboard_preferences (user_id, staff_role, widget_ids, default_version, updated_at)
  values (v_user_id, v_role, v_widget_ids, v_default_version, pg_catalog.clock_timestamp())
  on conflict (user_id) do update set staff_role = excluded.staff_role, widget_ids = excluded.widget_ids,
    default_version = excluded.default_version, updated_at = excluded.updated_at;
  return true;
end;
$function$;

create or replace function public.staff_get_dashboard_layout()
returns jsonb language sql volatile security invoker set search_path = ''
as $function$ select private.staff_get_dashboard_layout(); $function$;
create or replace function public.staff_save_dashboard_layout(p_widget_ids text[])
returns boolean language sql security invoker set search_path = ''
as $function$ select private.staff_save_dashboard_layout(p_widget_ids); $function$;

-- This feature is Owner-only and off until a deployment explicitly supplies a
-- trusted ingress header, a dedicated per-environment HMAC secret, and enables it.
