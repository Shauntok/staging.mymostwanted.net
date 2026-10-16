-- Count only failed Admin/Owner recovery-code verifications and enqueue one
-- fixed alert at the configured five-attempt threshold. Auth continues to own
-- the actual verification and lockout decision.

create table private.recovery_code_alert_windows (
  user_id uuid primary key references auth.users (id) on delete cascade,
  window_started_at timestamptz not null,
  failure_count integer not null,
  alerted_at timestamptz,
  constraint recovery_code_alert_failure_count_valid check (failure_count between 0 and 5)
);

alter table private.recovery_code_alert_windows enable row level security;
revoke all on table private.recovery_code_alert_windows from public, anon, authenticated, service_role, supabase_auth_admin;

create function private.clear_recovery_code_alert_windows_when_email_disabled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- Owner OFF holds the runtime-flag row first, matching the MFA hook's
  -- policy-row → counter-row order. Clear pre-OFF counts before OFF commits so
  -- a quick re-enable cannot inherit a partial failure window.
  delete from private.recovery_code_alert_windows;
  return new;
end;
$function$;

revoke all on function private.clear_recovery_code_alert_windows_when_email_disabled()
  from public, anon, authenticated, service_role, supabase_auth_admin;
create trigger clear_recovery_code_alert_windows_when_email_disabled
  after update of enabled on private.runtime_flags
  for each row
  when (old.flag = 'critical_security_email' and old.enabled and not new.enabled)
  execute function private.clear_recovery_code_alert_windows_when_email_disabled();

create function private.purge_recovery_code_alert_windows()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count integer;
begin
  delete from private.recovery_code_alert_windows as alert_window
  where alert_window.window_started_at < pg_catalog.clock_timestamp() - interval '15 minutes';
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function private.purge_recovery_code_alert_windows() from public, anon, authenticated, service_role, supabase_auth_admin;

create function public.mmwr_mfa_recovery_code_attempt(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
  v_now timestamptz;
  v_window_started_at timestamptz;
  v_failure_count integer;
  v_alerted_at timestamptz;
  v_should_alert boolean := false;
  v_email_enabled boolean;
begin
  -- Supabase calls this MFA hook for other factor types too. Ignore them and
  -- never retain request headers, IP addresses, device data, or submitted codes.
  if event->>'factor_type' is distinct from 'recovery_code' then
    return pg_catalog.jsonb_build_object('decision', 'continue');
  end if;

  v_user_id := nullif(event->>'user_id', '')::uuid;
  if v_user_id is null then
    return pg_catalog.jsonb_build_object('decision', 'continue');
  end if;

  if coalesce((event->>'valid')::boolean, false) then
    delete from private.recovery_code_alert_windows as alert_window
    where alert_window.user_id = v_user_id;
    return pg_catalog.jsonb_build_object('decision', 'continue');
  end if;

  -- Do not collect even short-lived counters while the Owner email policy is off.
  -- Hold the shared policy lock until the hook transaction commits so the
  -- Owner's OFF operation cannot race this counter/event write.
  select setting.enabled into v_email_enabled
  from private.runtime_flags as setting
  where setting.flag = 'critical_security_email'
  for share;
  if not coalesce(v_email_enabled, false) or not exists (
    select 1 from private.user_roles as user_role
    where user_role.user_id = v_user_id and user_role.role in ('admin', 'owner')
  ) then
    return pg_catalog.jsonb_build_object('decision', 'continue');
  end if;

  begin
    -- A periodic cleanup below bounds retention even when staff stop retrying.
    -- Upsert and return in one statement: this both serializes on user_id and
    -- avoids losing an attempt if cleanup or a valid recovery deletes the old
    -- row between a separate INSERT and SELECT.
    insert into private.recovery_code_alert_windows (user_id, window_started_at, failure_count)
    values (v_user_id, pg_catalog.clock_timestamp(), 0)
    on conflict (user_id) do update
    set failure_count = recovery_code_alert_windows.failure_count
    returning window_started_at, failure_count, alerted_at
    into v_window_started_at, v_failure_count, v_alerted_at;

    -- The row lock above may wait across the rolling-window boundary. Sample
    -- the wall clock only after acquiring it so concurrent attempts use the
    -- actual current 15-minute window.
    v_now := pg_catalog.clock_timestamp();

    if v_window_started_at <= v_now - interval '15 minutes' then
      update private.recovery_code_alert_windows as alert_window
      set window_started_at = v_now, failure_count = 1, alerted_at = null
      where alert_window.user_id = v_user_id;
      v_failure_count := 1;
      v_alerted_at := null;
    else
      v_failure_count := least(v_failure_count + 1, 5);
      v_should_alert := v_failure_count = 5 and v_alerted_at is null;
      update private.recovery_code_alert_windows as alert_window
      set failure_count = v_failure_count,
          alerted_at = case when v_should_alert then v_now else alert_window.alerted_at end
      where alert_window.user_id = v_user_id;
    end if;

    if v_should_alert then
      -- This threshold event is the sole producer of the recovery-code alert.
      -- It contains no IP/device fields and is committed with the lockout window.
      insert into private.security_events (actor_user_id, event_type, outcome)
      values (v_user_id, 'recovery_code_redeemed', 'failure');
    end if;
  exception when others then
    -- Email telemetry must never change Auth's recovery verification outcome.
    return pg_catalog.jsonb_build_object('decision', 'continue');
  end;

  return pg_catalog.jsonb_build_object('decision', 'continue');
exception when others then
  -- Malformed hook input or missing optional alert infrastructure also falls
  -- through to Supabase Auth's normal recovery-code verification behavior.
  return pg_catalog.jsonb_build_object('decision', 'continue');
end;
$function$;

revoke all on function public.mmwr_mfa_recovery_code_attempt(jsonb) from public, anon, authenticated, service_role, supabase_auth_admin;
grant execute on function public.mmwr_mfa_recovery_code_attempt(jsonb) to supabase_auth_admin;

create or replace function private.enqueue_critical_security_email_from_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.event_type = 'recovery_code_redeemed' and new.outcome = 'failure' then
    perform private.enqueue_critical_security_email(
      'brute_force_attack', 'security_event:' || new.id::text, new.id
    );
  end if;
  return new;
exception when others then
  -- Notification delivery infrastructure must not alter authentication.
  return new;
end;
$function$;

revoke all on function private.enqueue_critical_security_email_from_event()
  from public, anon, authenticated, service_role, supabase_auth_admin;

-- The user selected recovery-code failures as the only anomalous-login email
-- source. Retire the earlier generic sign-in anomaly trigger, while keeping
-- security_events available for internal audit and other non-email workflows.
drop trigger if exists critical_security_email_on_staff_sign_in_anomaly
  on private.security_events;
create trigger critical_security_email_on_recovery_code_failure
  after insert on private.security_events
  for each row
  when (new.event_type = 'recovery_code_redeemed' and new.outcome = 'failure')
  execute function private.enqueue_critical_security_email_from_event();

-- If the earlier sign-in alert source was enabled before this migration,
-- prevent its unsent messages from being delivered after the policy change.
with disabled_sign_in_alerts as (
  update private.critical_security_email_outbox as delivery
  set status = 'skipped', lease_token = null, leased_until = null,
      last_error_code = 'policy_disabled'
  where delivery.alert_type = 'staff_sign_in_anomaly'
    and delivery.status in ('pending', 'leased')
  returning delivery.id
)
insert into private.critical_security_email_delivery_audit (delivery_id, action, error_code)
select disabled.id, 'skipped', 'policy_disabled'
from disabled_sign_in_alerts as disabled;

select cron.schedule(
  'purge-recovery-code-alert-windows',
  '*/15 * * * *',
  'select private.purge_recovery_code_alert_windows();'
);

-- Rollback: unschedule the cleanup and disable this recovery-code email source
-- before removing its hook function/window table. Do not restore the generic
-- staff-sign-in anomaly email trigger; that source conflicts with user policy.
-- Already delivered sign-in alerts cannot be recalled; pending alerts are
-- marked skipped above and retained in the delivery audit.
