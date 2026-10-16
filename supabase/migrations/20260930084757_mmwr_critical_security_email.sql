-- Critical security email is an explicit Owner + deployment opt-in.
-- Queue records contain only a fixed alert category and Owner user id.

alter table private.runtime_flags
  drop constraint runtime_flags_name_valid;
alter table private.runtime_flags
  add constraint runtime_flags_name_valid
  check (flag in ('account_deletion', 'submission_risk_scanning', 'critical_security_email', 'staff_evidence_preview'));

insert into private.runtime_flags (flag, enabled)
values ('critical_security_email', false)
on conflict (flag) do nothing;

create table private.critical_security_email_settings_audit (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users (id) on delete set null,
  enabled_before boolean not null,
  enabled_after boolean not null,
  reason text not null,
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint critical_security_email_settings_reason check (
    pg_catalog.char_length(pg_catalog.btrim(reason)) between 1 and 500
  )
);

alter table private.critical_security_email_settings_audit enable row level security;
revoke all on table private.critical_security_email_settings_audit from public, anon, authenticated, service_role;

create function private.reject_critical_security_email_settings_audit_mutation()
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
  raise exception 'critical security email settings audit is append-only' using errcode = '42501';
end;
$function$;

revoke all on function private.reject_critical_security_email_settings_audit_mutation() from public, anon, authenticated, service_role;
create trigger critical_security_email_settings_audit_append_only
  before update or delete on private.critical_security_email_settings_audit
  for each row execute function private.reject_critical_security_email_settings_audit_mutation();
create trigger critical_security_email_settings_audit_no_truncate
  before truncate on private.critical_security_email_settings_audit
  for each statement execute function private.reject_critical_security_email_settings_audit_mutation();

create table private.critical_security_email_outbox (
  id uuid primary key default gen_random_uuid(),
  alert_type text not null,
  source_key text not null,
  source_security_event_id bigint references private.security_events (id) on delete set null,
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending',
  attempts integer not null default 0,
  available_at timestamptz not null default pg_catalog.clock_timestamp(),
  lease_token uuid,
  leased_until timestamptz,
  sent_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint critical_security_email_alert_valid check (
    alert_type in ('staff_sign_in_anomaly', 'brute_force_attack', 'backup_failure', 'backup_validation_failure', 'production_security_incident')
  ),
  constraint critical_security_email_source_key_valid check (source_key ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$'),
  constraint critical_security_email_status_valid check (status in ('pending', 'leased', 'sent', 'failed', 'skipped')),
  constraint critical_security_email_attempts_valid check (attempts between 0 and 5),
  constraint critical_security_email_lease_consistent check ((status = 'leased') = (lease_token is not null and leased_until is not null)),
  constraint critical_security_email_sent_consistent check ((status = 'sent') = (sent_at is not null)),
  constraint critical_security_email_error_valid check (last_error_code is null or last_error_code in (
    'recipient_unavailable', 'smtp_unavailable', 'delivery_uncertain', 'smtp_rejected', 'retry_limit_reached', 'signal_expired', 'policy_disabled'
  )),
  constraint critical_security_email_recipient_signal_unique unique (alert_type, source_key, recipient_user_id)
);

create index critical_security_email_ready_idx
  on private.critical_security_email_outbox (available_at, created_at)
  where status in ('pending', 'leased');

alter table private.critical_security_email_outbox enable row level security;
revoke all on table private.critical_security_email_outbox from public, anon, authenticated, service_role;

create table private.critical_security_email_delivery_audit (
  id bigint generated always as identity primary key,
  delivery_id uuid not null references private.critical_security_email_outbox (id) on delete cascade,
  action text not null,
  error_code text,
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint critical_security_email_audit_action_valid check (action in ('queued', 'leased', 'sent', 'retry_scheduled', 'failed', 'skipped')),
  constraint critical_security_email_audit_error_valid check (error_code is null or error_code in (
    'recipient_unavailable', 'smtp_unavailable', 'delivery_uncertain', 'smtp_rejected', 'retry_limit_reached', 'signal_expired', 'policy_disabled'
  ))
);

create index critical_security_email_audit_delivery_idx
  on private.critical_security_email_delivery_audit (delivery_id, occurred_at);
alter table private.critical_security_email_delivery_audit enable row level security;
revoke all on table private.critical_security_email_delivery_audit from public, anon, authenticated, service_role;

create function private.reject_critical_security_email_delivery_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' and not exists (
    select 1 from private.critical_security_email_outbox as delivery where delivery.id = old.delivery_id
  ) then
    return old;
  end if;
  raise exception 'critical security email delivery audit is append-only' using errcode = '42501';
end;
$function$;

revoke all on function private.reject_critical_security_email_delivery_audit_mutation() from public, anon, authenticated, service_role;
create trigger critical_security_email_delivery_audit_append_only
  before update or delete on private.critical_security_email_delivery_audit
  for each row execute function private.reject_critical_security_email_delivery_audit_mutation();
create trigger critical_security_email_delivery_audit_no_truncate
  before truncate on private.critical_security_email_delivery_audit
  for each statement execute function private.reject_critical_security_email_delivery_audit_mutation();

create function private.enqueue_critical_security_email(
  p_alert_type text,
  p_source_key text,
  p_source_security_event_id bigint default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count integer := 0;
  v_email_enabled boolean;
begin
  if p_alert_type not in ('staff_sign_in_anomaly', 'brute_force_attack', 'backup_failure', 'backup_validation_failure', 'production_security_incident')
    or p_source_key !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$' then
    return 0;
  end if;

  -- Serialize policy reads with the Owner's FOR UPDATE toggle. If this
  -- producer wins, OFF waits and then skips its queued row; if OFF wins, this
  -- producer observes false and cannot insert a later stranded message.
  select setting.enabled into v_email_enabled
  from private.runtime_flags as setting
  where setting.flag = 'critical_security_email'
  for share;
  if not coalesce(v_email_enabled, false) then return 0; end if;

  with inserted as (
    insert into private.critical_security_email_outbox (alert_type, source_key, source_security_event_id, recipient_user_id)
    select p_alert_type, p_source_key, p_source_security_event_id, user_role.user_id
    from private.user_roles as user_role
    join public.profiles as profile on profile.id = user_role.user_id and profile.account_state = 'active'
    join auth.users as auth_user on auth_user.id = user_role.user_id and auth_user.email_confirmed_at is not null
    where user_role.role = 'owner' and coalesce(pg_catalog.btrim(auth_user.email), '') <> ''
    on conflict (alert_type, source_key, recipient_user_id) do nothing
    returning id
  )
  insert into private.critical_security_email_delivery_audit (delivery_id, action)
  select inserted.id, 'queued' from inserted;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function private.enqueue_critical_security_email(text, text, bigint) from public, anon, authenticated, service_role;

create function private.enqueue_critical_security_email_from_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.event_type = 'staff_sign_in_anomaly' then
    perform private.enqueue_critical_security_email(
      'staff_sign_in_anomaly', 'security_event:' || new.id::text, new.id
    );
  end if;
  return new;
end;
$function$;

revoke all on function private.enqueue_critical_security_email_from_event() from public, anon, authenticated, service_role;
create trigger critical_security_email_on_staff_sign_in_anomaly
  after insert on private.security_events
  for each row execute function private.enqueue_critical_security_email_from_event();

create function private.owner_get_critical_security_email()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if not private.has_staff_role('owner') or not private.has_recent_totp() then
    raise exception 'recent Owner MFA is required' using errcode = '42501';
  end if;
  return exists (
    select 1 from private.runtime_flags as setting
    where setting.flag = 'critical_security_email' and setting.enabled
  );
end;
$function$;

revoke all on function private.owner_get_critical_security_email() from public, anon, service_role;
grant execute on function private.owner_get_critical_security_email() to authenticated;

create function public.owner_get_critical_security_email()
returns boolean language sql security invoker set search_path = ''
as $function$ select private.owner_get_critical_security_email(); $function$;
revoke all on function public.owner_get_critical_security_email() from public, anon, service_role;
grant execute on function public.owner_get_critical_security_email() to authenticated;

create function private.owner_set_critical_security_email(p_enabled boolean, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_before boolean;
begin
  if v_user_id is null or not private.has_staff_role('owner') or not private.has_recent_totp()
    or p_enabled is null or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason, ''))) not between 1 and 500 then
    return false;
  end if;

  select setting.enabled into v_before
  from private.runtime_flags as setting
  where setting.flag = 'critical_security_email'
  for update;

  if not found then return false; end if;
  if not private.has_staff_role('owner') or not private.has_recent_totp() then
    return false;
  end if;
  if v_before = p_enabled then return true; end if;

  update private.runtime_flags
  set enabled = p_enabled, updated_at = pg_catalog.clock_timestamp()
  where flag = 'critical_security_email';
  insert into private.critical_security_email_settings_audit (actor_user_id, enabled_before, enabled_after, reason)
  values (v_user_id, v_before, p_enabled, pg_catalog.left(pg_catalog.btrim(p_reason), 500));
  if not p_enabled then
    with skipped as (
      update private.critical_security_email_outbox as delivery
      set status = 'skipped', lease_token = null, leased_until = null, last_error_code = 'policy_disabled'
      where delivery.status in ('pending', 'leased')
      returning delivery.id, delivery.last_error_code
    )
    insert into private.critical_security_email_delivery_audit (delivery_id, action, error_code)
    select skipped.id, 'skipped', skipped.last_error_code from skipped;
  end if;
  return true;
end;
$function$;

revoke all on function private.owner_set_critical_security_email(boolean, text) from public, anon, service_role;
grant execute on function private.owner_set_critical_security_email(boolean, text) to authenticated;

create function public.owner_set_critical_security_email(p_enabled boolean, p_reason text)
returns boolean language sql security invoker set search_path = ''
as $function$ select private.owner_set_critical_security_email(p_enabled, p_reason); $function$;
revoke all on function public.owner_set_critical_security_email(boolean, text) from public, anon, service_role;
grant execute on function public.owner_set_critical_security_email(boolean, text) to authenticated;

create function private.owner_list_critical_security_email_audit(p_limit integer default 30)
returns table (id bigint, actor_user_id uuid, enabled_before boolean, enabled_after boolean, reason text, occurred_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if not private.has_staff_role('owner') or not private.has_recent_totp() then
    raise exception 'recent Owner MFA is required' using errcode = '42501';
  end if;
  return query
    select audit.id, audit.actor_user_id, audit.enabled_before, audit.enabled_after, audit.reason, audit.occurred_at
    from private.critical_security_email_settings_audit as audit
    order by audit.occurred_at desc limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$function$;

revoke all on function private.owner_list_critical_security_email_audit(integer) from public, anon, service_role;
grant execute on function private.owner_list_critical_security_email_audit(integer) to authenticated;

create function public.owner_list_critical_security_email_audit(p_limit integer default 30)
returns table (id bigint, actor_user_id uuid, enabled_before boolean, enabled_after boolean, reason text, occurred_at timestamptz)
language sql security invoker set search_path = ''
as $function$ select * from private.owner_list_critical_security_email_audit(p_limit); $function$;
revoke all on function public.owner_list_critical_security_email_audit(integer) from public, anon, service_role;
grant execute on function public.owner_list_critical_security_email_audit(integer) to authenticated;

create function private.claim_critical_security_email()
returns table (delivery_id uuid, lease_token uuid, alert_type text, created_at timestamptz, recipient_email text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_delivery private.critical_security_email_outbox%rowtype;
  v_email text;
  v_email_enabled boolean;
begin
  -- Lock order is policy row → outbox rows, matching Owner OFF. This prevents
  -- a claim from passing a stale enabled check while shutdown drains the queue.
  select setting.enabled into v_email_enabled
  from private.runtime_flags as setting
  where setting.flag = 'critical_security_email'
  for share;
  if not coalesce(v_email_enabled, false) then return; end if;

  with skipped as (
    update private.critical_security_email_outbox as delivery
    set status = 'skipped', lease_token = null, leased_until = null, last_error_code = 'signal_expired'
    where delivery.status in ('pending', 'leased')
      and delivery.created_at < pg_catalog.clock_timestamp() - interval '24 hours'
    returning delivery.id, delivery.last_error_code
  )
  insert into private.critical_security_email_delivery_audit (delivery_id, action, error_code)
  select skipped.id, 'skipped', skipped.last_error_code from skipped;

  with failed as (
    update private.critical_security_email_outbox as delivery
    set status = 'failed', lease_token = null, leased_until = null, last_error_code = 'retry_limit_reached'
    where delivery.status = 'leased' and delivery.attempts >= 5
      and delivery.leased_until < pg_catalog.clock_timestamp()
    returning delivery.id, delivery.last_error_code
  )
  insert into private.critical_security_email_delivery_audit (delivery_id, action, error_code)
  select failed.id, 'failed', failed.last_error_code from failed;

  with skipped as (
    update private.critical_security_email_outbox as delivery
    set status = 'skipped', lease_token = null, leased_until = null, last_error_code = 'recipient_unavailable'
    where delivery.status in ('pending', 'leased')
      and not exists (
        select 1 from private.user_roles as user_role
        join public.profiles as profile on profile.id = user_role.user_id and profile.account_state = 'active'
        join auth.users as auth_user on auth_user.id = user_role.user_id and auth_user.email_confirmed_at is not null
        where user_role.user_id = delivery.recipient_user_id and user_role.role = 'owner'
          and coalesce(pg_catalog.btrim(auth_user.email), '') <> ''
      )
    returning delivery.id, delivery.last_error_code
  )
  insert into private.critical_security_email_delivery_audit (delivery_id, action, error_code)
  select skipped.id, 'skipped', skipped.last_error_code from skipped;

  select delivery.* into v_delivery
  from private.critical_security_email_outbox as delivery
  join private.user_roles as user_role on user_role.user_id = delivery.recipient_user_id and user_role.role = 'owner'
  join public.profiles as profile on profile.id = delivery.recipient_user_id and profile.account_state = 'active'
  join auth.users as auth_user on auth_user.id = delivery.recipient_user_id and auth_user.email_confirmed_at is not null
  where delivery.attempts < 5
    and ((delivery.status = 'pending' and delivery.available_at <= pg_catalog.clock_timestamp())
      or (delivery.status = 'leased' and delivery.leased_until < pg_catalog.clock_timestamp()))
    and delivery.created_at >= pg_catalog.clock_timestamp() - interval '24 hours'
  order by delivery.created_at, delivery.id
  for update of delivery skip locked
  limit 1;

  if not found then return; end if;

  select auth_user.email into v_email
  from auth.users as auth_user
  where auth_user.id = v_delivery.recipient_user_id
    and auth_user.email_confirmed_at is not null
    and coalesce(pg_catalog.btrim(auth_user.email), '') <> '';
  if not found then return; end if;

  update private.critical_security_email_outbox as delivery
  set status = 'leased', attempts = attempts + 1,
      lease_token = gen_random_uuid(), leased_until = pg_catalog.clock_timestamp() + interval '5 minutes'
  where delivery.id = v_delivery.id
  returning delivery.* into v_delivery;

  insert into private.critical_security_email_delivery_audit (delivery_id, action)
  values (v_delivery.id, 'leased');

  return query select v_delivery.id, v_delivery.lease_token, v_delivery.alert_type, v_delivery.created_at, v_email;
end;
$function$;

revoke all on function private.claim_critical_security_email() from public, anon, authenticated, service_role;
create function public.mmwr_claim_critical_security_email()
returns table (delivery_id uuid, lease_token uuid, alert_type text, created_at timestamptz, recipient_email text)
language sql security definer set search_path = ''
as $function$ select * from private.claim_critical_security_email(); $function$;
revoke all on function public.mmwr_claim_critical_security_email() from public, anon, authenticated;
grant execute on function public.mmwr_claim_critical_security_email() to service_role;

create function private.finish_critical_security_email(p_delivery_id uuid, p_lease_token uuid, p_outcome text, p_error_code text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_delivery private.critical_security_email_outbox%rowtype;
  v_next_status text;
  v_next_error text;
  v_now timestamptz;
begin
  if p_outcome not in ('sent', 'retry', 'failed')
    or (p_error_code is not null and p_error_code not in ('smtp_unavailable', 'delivery_uncertain', 'smtp_rejected')) then
    return false;
  end if;

  select delivery.* into v_delivery
  from private.critical_security_email_outbox as delivery
  where delivery.id = p_delivery_id and delivery.status = 'leased'
    and delivery.lease_token = p_lease_token and delivery.leased_until > pg_catalog.clock_timestamp()
  for update;
  if not found then return false; end if;

  -- The predicate above can be evaluated before FOR UPDATE waits on a row
  -- lock. Recheck after acquiring the lock so a lease that expired during
  -- that wait cannot complete or reschedule delivery.
  v_now := pg_catalog.clock_timestamp();
  if v_delivery.leased_until <= v_now then return false; end if;

  if p_outcome = 'sent' then
    update private.critical_security_email_outbox as delivery
    set status = 'sent', sent_at = pg_catalog.clock_timestamp(), lease_token = null, leased_until = null, last_error_code = null
    where delivery.id = v_delivery.id;
    insert into private.critical_security_email_delivery_audit (delivery_id, action)
    values (v_delivery.id, 'sent');
  elsif p_outcome = 'retry' and v_delivery.attempts < 5 then
    update private.critical_security_email_outbox as delivery
    set status = 'pending', lease_token = null, leased_until = null,
        available_at = pg_catalog.clock_timestamp() + pg_catalog.make_interval(secs => least(3600, 30 * pg_catalog.power(2::numeric, greatest(attempts - 1, 0))::integer)),
        last_error_code = coalesce(p_error_code, 'delivery_uncertain')
    where delivery.id = v_delivery.id;
    insert into private.critical_security_email_delivery_audit (delivery_id, action, error_code)
    values (v_delivery.id, 'retry_scheduled', coalesce(p_error_code, 'delivery_uncertain'));
  else
    v_next_status := case when p_outcome = 'retry' then 'failed' else 'failed' end;
    v_next_error := case when p_outcome = 'retry' then 'retry_limit_reached' else coalesce(p_error_code, 'smtp_rejected') end;
    update private.critical_security_email_outbox as delivery
    set status = v_next_status, lease_token = null, leased_until = null, last_error_code = v_next_error
    where delivery.id = v_delivery.id;
    insert into private.critical_security_email_delivery_audit (delivery_id, action, error_code)
    values (v_delivery.id, 'failed', v_next_error);
  end if;
  return true;
end;
$function$;

revoke all on function private.finish_critical_security_email(uuid, uuid, text, text) from public, anon, authenticated, service_role;
create function public.mmwr_finish_critical_security_email(p_delivery_id uuid, p_lease_token uuid, p_outcome text, p_error_code text default null)
returns boolean language sql security definer set search_path = ''
as $function$ select private.finish_critical_security_email(p_delivery_id, p_lease_token, p_outcome, p_error_code); $function$;
revoke all on function public.mmwr_finish_critical_security_email(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.mmwr_finish_critical_security_email(uuid, uuid, text, text) to service_role;

create function private.enqueue_critical_security_email_service(p_alert_type text, p_signal_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- Login-related brute-force mail is reserved for the approved recovery-code
  -- threshold trigger; generic service signals cannot manufacture that alert.
  if p_signal_id is null or p_alert_type not in ('backup_failure', 'backup_validation_failure', 'production_security_incident') then
    return 0;
  end if;
  return private.enqueue_critical_security_email(p_alert_type, 'signal:' || p_signal_id::text, null);
end;
$function$;

revoke all on function private.enqueue_critical_security_email_service(text, uuid) from public, anon, authenticated, service_role;
create function public.mmwr_enqueue_critical_security_email(p_alert_type text, p_signal_id uuid)
returns integer language sql security definer set search_path = ''
as $function$ select private.enqueue_critical_security_email_service(p_alert_type, p_signal_id); $function$;
revoke all on function public.mmwr_enqueue_critical_security_email(text, uuid) from public, anon, authenticated;
grant execute on function public.mmwr_enqueue_critical_security_email(text, uuid) to service_role;

-- Add the Owner-only settings panel to the role-validated dashboard registry.
alter table private.staff_dashboard_preferences
  drop constraint staff_dashboard_preference_widget_count;
alter table private.staff_dashboard_preferences
  add constraint staff_dashboard_preference_widget_count
  check (pg_catalog.cardinality(widget_ids) between 1 and 12);

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
    v_default_ids := array['dashboard_summary', 'reports', 'submissions', 'post_editor', 'notifications', 'analytics', 'posts', 'homepage_tags', 'sanctions', 'staff_access', 'risk_lexicon', 'security_email']::text[];
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
    v_allowed := array['dashboard_summary', 'reports', 'submissions', 'post_editor', 'notifications', 'analytics', 'posts', 'homepage_tags', 'sanctions', 'staff_access', 'risk_lexicon', 'security_email']::text[];
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

-- Rollback: drop this migration's public wrappers, trigger, and private
-- functions/tables. Remove only its critical_security_email runtime row after
-- disabling the feature. Preserve flags owned by earlier/later migrations;
-- rebuild runtime_flags_name_valid from every migration that remains installed.
