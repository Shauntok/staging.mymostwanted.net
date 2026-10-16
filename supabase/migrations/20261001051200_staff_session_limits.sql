-- Apply an MMWR-only staff session window without changing Supabase Auth's
-- project-wide session settings for ordinary users.
create table private.staff_session_activity (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  started_at timestamptz not null,
  last_activity_at timestamptz not null,
  constraint staff_session_activity_order check (last_activity_at >= started_at)
);

alter table private.staff_session_activity enable row level security;
revoke all on table private.staff_session_activity from public, anon, authenticated, service_role;

comment on table private.staff_session_activity is
  'Private activity window for Owner/Admin sessions; rows cascade with their Supabase Auth session.';

create function private.touch_staff_session(
  p_user_id uuid,
  p_session_id uuid,
  p_has_aal2_totp boolean
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz;
  v_started_at timestamptz;
  v_last_activity_at timestamptz;
begin
  if p_user_id is null or p_session_id is null or p_has_aal2_totp is distinct from true then
    return 'not_staff';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session_id::text, 65120417));

  -- Recheck the current session and staff authorization after acquiring the
  -- per-session lock. Session refresh keeps the same Auth session ID.
  if not exists (
    select 1
    from auth.sessions as auth_session
    where auth_session.id = p_session_id
      and auth_session.user_id = p_user_id
  ) then
    return 'expired';
  end if;

  if not exists (
    select 1
    from private.user_roles as user_role
    join public.profiles as profile on profile.id = user_role.user_id
    where user_role.user_id = p_user_id
      and user_role.role in ('admin', 'owner')
      and profile.account_state = 'active'
      and not private.account_has_active_sanction(p_user_id, 'account_suspension')
  ) then
    return 'not_staff';
  end if;

  v_now := pg_catalog.clock_timestamp();
  select activity.started_at, activity.last_activity_at
  into v_started_at, v_last_activity_at
  from private.staff_session_activity as activity
  where activity.session_id = p_session_id
  for update;

  if not found then
    insert into private.staff_session_activity (session_id, started_at, last_activity_at)
    values (p_session_id, v_now, v_now);
    return 'started';
  end if;

  -- Expired leases are terminal for this Auth session. Do not allow another
  -- heartbeat or a refreshed JWT to start a new eight-hour window.
  if v_started_at <= v_now - interval '8 hours'
    or v_last_activity_at <= v_now - interval '15 minutes' then
    return 'expired';
  end if;

  update private.staff_session_activity
  set last_activity_at = v_now
  where session_id = p_session_id;
  return 'active';
end;
$function$;

revoke all on function private.touch_staff_session(uuid, uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function private.touch_staff_session(uuid, uuid, boolean) to service_role;

create function public.mmwr_touch_staff_session(
  p_user_id uuid,
  p_session_id uuid,
  p_has_aal2_totp boolean
)
returns text
language sql
volatile
security invoker
set search_path = ''
as $function$
  select private.touch_staff_session(p_user_id, p_session_id, p_has_aal2_totp);
$function$;

revoke all on function public.mmwr_touch_staff_session(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.mmwr_touch_staff_session(uuid, uuid, boolean) to service_role;

create or replace function private.has_staff_role(p_role text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_claims jsonb := (select auth.jwt());
  v_session_id uuid;
  v_now timestamptz;
begin
  if v_user_id is null
    or v_claims ->> 'aal' is distinct from 'aal2'
    or not (
      coalesce(v_claims -> 'amr', '[]'::jsonb) @> '[{"method":"totp"}]'::jsonb
      or coalesce(v_claims -> 'amr', '[]'::jsonb) @> '[{"method":"mfa/totp"}]'::jsonb
    )
    or p_role not in ('admin', 'owner') then
    return false;
  end if;

  if coalesce(v_claims ->> 'session_id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return false;
  end if;
  v_session_id := (v_claims ->> 'session_id')::uuid;
  v_now := pg_catalog.clock_timestamp();

  return exists (
    select 1
    from private.user_roles as user_role
    join public.profiles as profile on profile.id = user_role.user_id
    join private.staff_session_activity as activity on activity.session_id = v_session_id
    join auth.sessions as auth_session
      on auth_session.id = activity.session_id
     and auth_session.user_id = v_user_id
    where user_role.user_id = v_user_id
      and user_role.role = p_role
      and profile.account_state = 'active'
      and not private.account_has_active_sanction(profile.id, 'account_suspension')
      and activity.started_at > v_now - interval '8 hours'
      and activity.last_activity_at > v_now - interval '15 minutes'
  );
end;
$function$;

revoke all on function private.has_staff_role(text) from public, anon, service_role;
grant execute on function private.has_staff_role(text) to authenticated;
