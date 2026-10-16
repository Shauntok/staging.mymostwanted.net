-- Private, minimized backup run status. No credentials, manifest contents,
-- source object paths, or provider exception text are stored here.

create table private.backup_runs (
  run_id text primary key,
  trigger_kind text not null,
  requested_by uuid references auth.users (id) on delete set null,
  status text not null,
  phase text not null,
  integrity_verified boolean not null default false,
  artifact_count integer not null default 0,
  encrypted_bytes bigint not null default 0,
  manifest_object_key text,
  failure_code text,
  started_at timestamptz not null default pg_catalog.clock_timestamp(),
  completed_at timestamptz,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint backup_runs_id_valid check (run_id ~ '^backup_[0-9]{8}T[0-9]{6}Z_[a-f0-9]{16}$'),
  constraint backup_runs_trigger_valid check (trigger_kind in ('scheduled', 'owner_manual')),
  constraint backup_runs_status_valid check (status in ('running', 'succeeded', 'failed')),
  constraint backup_runs_phase_valid check (phase in ('database_export', 'storage_backup', 'manifest_verification', 'complete', 'failed')),
  constraint backup_runs_integrity_valid check (
    (status = 'succeeded' and integrity_verified and phase = 'complete'
      and artifact_count >= 4 and encrypted_bytes > 0 and manifest_object_key is not null
      and failure_code is null and completed_at is not null)
    or (status = 'running' and not integrity_verified and phase in ('database_export', 'storage_backup', 'manifest_verification')
      and manifest_object_key is null and failure_code is null and completed_at is null)
    or (status = 'failed' and not integrity_verified and phase = 'failed'
      and manifest_object_key is null and failure_code is not null
      and failure_code in ('backup_failed', 'backup_validation_failed') and completed_at is not null)
  ),
  constraint backup_runs_manifest_key_valid check (
    manifest_object_key is null
    or manifest_object_key ~ ('^runs/' || run_id || '/manifest_[A-Za-z0-9_-]{1,80}\.mmwrbk$')
  ),
  constraint backup_runs_manual_actor_valid check (
    (trigger_kind = 'scheduled' and requested_by is null)
    or trigger_kind = 'owner_manual'
  ),
  constraint backup_runs_artifact_count_valid check (artifact_count between 0 and 100001),
  constraint backup_runs_encrypted_bytes_valid check (encrypted_bytes >= 0)
);

create index backup_runs_recent_idx on private.backup_runs (started_at desc, run_id desc);
create index backup_runs_retention_idx on private.backup_runs (completed_at desc, run_id desc)
  where status = 'succeeded' and integrity_verified;

alter table private.backup_runs enable row level security;
revoke all on table private.backup_runs from public, anon, authenticated, service_role;

create table private.backup_run_audit (
  id bigint generated always as identity primary key,
  run_id text not null references private.backup_runs (run_id),
  status text not null,
  phase text not null,
  failure_code text,
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint backup_run_audit_status_valid check (status in ('running', 'succeeded', 'failed')),
  constraint backup_run_audit_phase_valid check (phase in ('database_export', 'storage_backup', 'manifest_verification', 'complete', 'failed')),
  constraint backup_run_audit_failure_valid check (
    failure_code is null or failure_code in ('backup_failed', 'backup_validation_failed')
  ),
  constraint backup_run_audit_consistent check (
    (status = 'failed' and phase = 'failed' and failure_code is not null
      and failure_code in ('backup_failed', 'backup_validation_failed'))
    or (status <> 'failed' and failure_code is null)
  )
);

alter table private.backup_run_audit enable row level security;
revoke all on table private.backup_run_audit from public, anon, authenticated, service_role;

create function private.reject_backup_run_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'backup run audit is append-only' using errcode = '42501';
end;
$function$;

revoke all on function private.reject_backup_run_audit_mutation() from public, anon, authenticated, service_role;
create trigger backup_run_audit_append_only
  before update or delete on private.backup_run_audit
  for each row execute function private.reject_backup_run_audit_mutation();
create trigger backup_run_audit_no_truncate
  before truncate on private.backup_run_audit
  for each statement execute function private.reject_backup_run_audit_mutation();

create function private.audit_backup_run_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into private.backup_run_audit (run_id, status, phase, failure_code)
  values (new.run_id, new.status, new.phase, new.failure_code);
  return new;
end;
$function$;

revoke all on function private.audit_backup_run_change() from public, anon, authenticated, service_role;
create trigger backup_run_audit_after_change
  after insert or update on private.backup_runs
  for each row execute function private.audit_backup_run_change();

-- A failed backup run may enqueue one fixed Owner alert when the separate
-- Critical Security Email policy is enabled. Delivery remains asynchronous.
create function private.enqueue_backup_failure_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_should_enqueue boolean := false;
begin
  if new.status = 'failed' then
    if tg_op = 'INSERT' then
      v_should_enqueue := true;
    elsif old.status is distinct from 'failed' then
      v_should_enqueue := true;
    end if;
  end if;
  if v_should_enqueue then
    perform private.enqueue_critical_security_email(
      case new.failure_code
        when 'backup_validation_failed' then 'backup_validation_failure'
        else 'backup_failure'
      end,
      'backup_run:' || new.run_id, null
    );
  end if;
  return new;
exception when others then
  -- Email queue failures must not roll back the backup run status.
  return new;
end;
$function$;

revoke all on function private.enqueue_backup_failure_email() from public, anon, authenticated, service_role;
create trigger backup_run_failure_email
  after insert or update on private.backup_runs
  for each row when (new.status = 'failed')
  execute function private.enqueue_backup_failure_email();

create function private.record_backup_run(
  p_run_id text,
  p_trigger_kind text,
  p_requested_by uuid,
  p_status text,
  p_phase text,
  p_integrity_verified boolean,
  p_artifact_count integer,
  p_encrypted_bytes bigint,
  p_manifest_object_key text default null,
  p_failure_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing private.backup_runs%rowtype;
begin
  if p_run_id is null
    or p_run_id !~ '^backup_[0-9]{8}T[0-9]{6}Z_[a-f0-9]{16}$'
    or p_trigger_kind is null
    or p_trigger_kind not in ('scheduled', 'owner_manual')
    or (p_trigger_kind = 'scheduled' and p_requested_by is not null)
    or (p_trigger_kind = 'owner_manual' and p_requested_by is null)
    or p_status is null
    or p_status not in ('running', 'succeeded', 'failed')
    or p_phase is null
    or p_phase not in ('database_export', 'storage_backup', 'manifest_verification', 'complete', 'failed')
    or p_integrity_verified is null
    or p_artifact_count is null
    or p_artifact_count not between 0 and 100001
    or p_encrypted_bytes is null
    or p_encrypted_bytes < 0
    or (p_failure_code is not null
      and p_failure_code not in ('backup_failed', 'backup_validation_failed')) then
    raise exception 'backup run status is invalid' using errcode = '22023';
  end if;

  if p_status = 'running'
    and (p_phase not in ('database_export', 'storage_backup', 'manifest_verification')
      or p_integrity_verified or p_manifest_object_key is not null or p_failure_code is not null)
    or p_status = 'succeeded'
    and (p_phase <> 'complete' or not p_integrity_verified or p_artifact_count < 4
      or p_encrypted_bytes = 0 or p_manifest_object_key is null
      or p_manifest_object_key !~ ('^runs/' || p_run_id || '/manifest_[A-Za-z0-9_-]{1,80}\.mmwrbk$')
      or p_failure_code is not null)
    or p_status = 'failed'
    and (p_phase <> 'failed' or p_integrity_verified or p_manifest_object_key is not null
      or p_failure_code is null
      or p_failure_code not in ('backup_failed', 'backup_validation_failed')) then
    raise exception 'backup run status transition is inconsistent' using errcode = '22023';
  end if;

  select * into v_existing from private.backup_runs where run_id = p_run_id for update;
  if not found then
    if p_status <> 'running' or p_phase <> 'database_export' then
      raise exception 'backup run must start with database export' using errcode = '22023';
    end if;
    insert into private.backup_runs (
      run_id, trigger_kind, requested_by, status, phase, integrity_verified,
      artifact_count, encrypted_bytes, manifest_object_key, failure_code
    ) values (
      p_run_id, p_trigger_kind, p_requested_by, p_status, p_phase, p_integrity_verified,
      p_artifact_count, p_encrypted_bytes, p_manifest_object_key, p_failure_code
    );
    return;
  end if;

  if v_existing.status <> 'running'
    or v_existing.trigger_kind <> p_trigger_kind
    or v_existing.requested_by is distinct from p_requested_by then
    raise exception 'backup run is already terminal or its identity changed' using errcode = '22023';
  end if;
  if p_artifact_count < v_existing.artifact_count
    or p_encrypted_bytes < v_existing.encrypted_bytes
    or (p_status <> 'failed'
      and array_position(array['database_export', 'storage_backup', 'manifest_verification']::text[], p_phase)
        < array_position(array['database_export', 'storage_backup', 'manifest_verification']::text[], v_existing.phase))
    or (p_status = 'succeeded' and v_existing.phase <> 'manifest_verification') then
    raise exception 'backup run progress cannot move backwards' using errcode = '22023';
  end if;

  update private.backup_runs set
    status = p_status,
    phase = p_phase,
    integrity_verified = p_integrity_verified,
    artifact_count = p_artifact_count,
    encrypted_bytes = p_encrypted_bytes,
    manifest_object_key = p_manifest_object_key,
    failure_code = p_failure_code,
    completed_at = case when p_status in ('succeeded', 'failed') then pg_catalog.clock_timestamp() else null end,
    updated_at = pg_catalog.clock_timestamp()
  where run_id = p_run_id;
end;
$function$;

revoke all on function private.record_backup_run(text, text, uuid, text, text, boolean, integer, bigint, text, text)
  from public, anon, authenticated, service_role;
grant execute on function private.record_backup_run(text, text, uuid, text, text, boolean, integer, bigint, text, text)
  to service_role;

create function public.mmwr_record_backup_run(
  p_run_id text,
  p_trigger_kind text,
  p_requested_by uuid,
  p_status text,
  p_phase text,
  p_integrity_verified boolean,
  p_artifact_count integer,
  p_encrypted_bytes bigint,
  p_manifest_object_key text default null,
  p_failure_code text default null
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.record_backup_run(
    p_run_id, p_trigger_kind, p_requested_by, p_status, p_phase,
    p_integrity_verified, p_artifact_count, p_encrypted_bytes,
    p_manifest_object_key, p_failure_code
  );
$function$;

revoke all on function public.mmwr_record_backup_run(text, text, uuid, text, text, boolean, integer, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.mmwr_record_backup_run(text, text, uuid, text, text, boolean, integer, bigint, text, text)
  to service_role;

create function private.staff_list_backup_runs(p_limit integer default 20)
returns table (
  run_id text,
  trigger_kind text,
  status text,
  phase text,
  integrity_verified boolean,
  artifact_count integer,
  encrypted_bytes bigint,
  failure_code text,
  started_at timestamptz,
  completed_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if not (private.has_staff_role('owner') or private.has_staff_role('admin'))
    or not private.has_recent_totp() then
    raise exception 'recent staff MFA is required' using errcode = '42501';
  end if;
  return query
    select run.run_id, run.trigger_kind, run.status, run.phase,
      run.integrity_verified, run.artifact_count, run.encrypted_bytes,
      run.failure_code, run.started_at, run.completed_at
    from private.backup_runs as run
    order by run.started_at desc, run.run_id desc
    limit greatest(1, least(coalesce(p_limit, 20), 50));
end;
$function$;

revoke all on function private.staff_list_backup_runs(integer) from public, anon, service_role;
grant execute on function private.staff_list_backup_runs(integer) to authenticated;

create function public.staff_list_backup_runs(p_limit integer default 20)
returns table (
  run_id text,
  trigger_kind text,
  status text,
  phase text,
  integrity_verified boolean,
  artifact_count integer,
  encrypted_bytes bigint,
  failure_code text,
  started_at timestamptz,
  completed_at timestamptz
)
language sql
volatile
security invoker
set search_path = ''
as $function$ select * from private.staff_list_backup_runs(p_limit); $function$;

revoke all on function public.staff_list_backup_runs(integer) from public, anon, service_role;
grant execute on function public.staff_list_backup_runs(integer) to authenticated;

