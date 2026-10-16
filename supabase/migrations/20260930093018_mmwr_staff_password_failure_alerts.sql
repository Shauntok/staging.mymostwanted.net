-- Alert Owners when a staff account crosses the approved password-failure
-- threshold. This observes failed verification only; it never blocks sign-in.
-- Critical email and the Supabase Auth hook remain disabled by default.

create table private.staff_password_failure_windows (
  user_id uuid primary key references auth.users (id) on delete cascade,
  recent_failed_at timestamptz[] not null,
  last_attempt_at timestamptz not null,
  last_alerted_at timestamptz,
  constraint staff_password_failure_count_valid check (pg_catalog.cardinality(recent_failed_at) between 1 and 5),
  constraint staff_password_failure_window_order check (last_attempt_at >= recent_failed_at[pg_catalog.cardinality(recent_failed_at)])
);

alter table private.staff_password_failure_windows enable row level security;
revoke all on table private.staff_password_failure_windows from public, anon, authenticated, service_role, supabase_auth_admin;

create function private.clear_staff_password_failure_windows_on_email_policy_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.flag = 'critical_security_email' and old.enabled is distinct from new.enabled then
    delete from private.staff_password_failure_windows;
  end if;
  return new;
end;
$function$;

revoke all on function private.clear_staff_password_failure_windows_on_email_policy_change() from public, anon, authenticated, service_role, supabase_auth_admin;
create trigger clear_staff_password_failure_windows_on_email_policy_change
  after update of enabled on private.runtime_flags
  for each row execute function private.clear_staff_password_failure_windows_on_email_policy_change();

create function private.mmwr_password_verification_attempt(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
  v_valid boolean;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_recent_failed_at timestamptz[];
  v_last_alerted_at timestamptz;
  v_failure_count integer;
  v_source_key text;
begin
  -- The hook is an observer only. Malformed input or any monitoring failure
  -- must not prevent Supabase Auth from applying its normal password policy.
  if pg_catalog.jsonb_typeof(p_event) <> 'object'
    or p_event->>'user_id' is null
    or p_event->>'valid' not in ('true', 'false') then
    return pg_catalog.jsonb_build_object('decision', 'continue');
  end if;

  begin
    v_user_id := (p_event->>'user_id')::uuid;
    v_valid := (p_event->>'valid')::boolean;
  exception when others then
    return pg_catalog.jsonb_build_object('decision', 'continue');
  end;

  if v_user_id is null then
    return pg_catalog.jsonb_build_object('decision', 'continue');
  end if;

  -- Count only accounts with a currently assigned Admin or Owner role. A
  -- successful password verification clears the account's short-lived row.
  if not exists (
    select 1 from private.user_roles as user_role
    where user_role.user_id = v_user_id and user_role.role in ('admin', 'owner')
  ) then
    return pg_catalog.jsonb_build_object('decision', 'continue');
  end if;

  if v_valid then
    delete from private.staff_password_failure_windows as failure_window
    where failure_window.user_id = v_user_id;
    return pg_catalog.jsonb_build_object('decision', 'continue');
  end if;

  -- Do not collect failed-login metadata while critical email is opted out.
  if not exists (
    select 1 from private.runtime_flags as setting
    where setting.flag = 'critical_security_email' and setting.enabled
  ) then
    return pg_catalog.jsonb_build_object('decision', 'continue');
  end if;

  insert into private.staff_password_failure_windows
    (user_id, recent_failed_at, last_attempt_at)
  values (v_user_id, array[v_now], v_now)
  on conflict (user_id) do nothing;

  -- Serialize concurrent failed attempts per staff account, then retain only
  -- the rolling 15-minute window (not a first-attempt-anchored time bucket).
  select failure_window.recent_failed_at, failure_window.last_alerted_at
  into v_recent_failed_at, v_last_alerted_at
  from private.staff_password_failure_windows as failure_window
  where failure_window.user_id = v_user_id
  for update;

  select pg_catalog.array_agg(recent.attempt_at order by recent.attempt_at)
  into v_recent_failed_at
  from (
    select attempts.attempt_at
    from unnest(v_recent_failed_at || array[v_now]) as attempts(attempt_at)
    where attempts.attempt_at > v_now - interval '15 minutes'
    order by attempts.attempt_at desc
    limit 5
  ) as recent;

  update private.staff_password_failure_windows as failure_window
  set recent_failed_at = v_recent_failed_at,
      last_attempt_at = v_now
  where failure_window.user_id = v_user_id;
  v_failure_count := pg_catalog.cardinality(v_recent_failed_at);

  if v_failure_count >= 5
    and (v_last_alerted_at is null or v_last_alerted_at <= v_now - interval '30 minutes') then
    v_source_key := 'brute_force:' || pg_catalog.md5(v_user_id::text) || ':'
      || (pg_catalog.floor(extract(epoch from v_now) / 1800)::bigint)::text;

    -- The existing enqueue routine resolves active, confirmed Owner addresses
    -- server-side and stores only a fixed alert category plus this dedupe key.
    perform private.enqueue_critical_security_email('brute_force_attack', v_source_key, null);

    update private.staff_password_failure_windows as failure_window
    set last_alerted_at = v_now
    where failure_window.user_id = v_user_id;
  end if;

  return pg_catalog.jsonb_build_object('decision', 'continue');
exception when others then
  -- Monitoring must not turn a transient database issue into a sign-in outage.
  return pg_catalog.jsonb_build_object('decision', 'continue');
end;
$function$;

revoke all on function private.mmwr_password_verification_attempt(jsonb)
  from public, anon, authenticated, service_role, supabase_auth_admin;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.mmwr_password_verification_attempt(jsonb)
  to supabase_auth_admin;

create function private.cleanup_staff_password_failure_windows()
returns void
language sql
security definer
set search_path = ''
as $function$
  delete from private.staff_password_failure_windows as failure_window
  where failure_window.last_attempt_at <= pg_catalog.clock_timestamp() - interval '30 minutes'
    and (failure_window.last_alerted_at is null
      or failure_window.last_alerted_at <= pg_catalog.clock_timestamp() - interval '30 minutes');
$function$;

revoke all on function private.cleanup_staff_password_failure_windows() from public, anon, authenticated, service_role, supabase_auth_admin;

select cron.schedule(
  'mmwr_staff_password_failure_window_cleanup',
  '*/5 * * * *',
  'select private.cleanup_staff_password_failure_windows()'
);
