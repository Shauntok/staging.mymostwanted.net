-- Transactional, private outbox for the self-hosted ClamAV scanner.
-- Scanner endpoints and feature flags remain disabled until an operator configures them.

create table private.evidence_scan_jobs (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid not null unique references private.evidence_metadata (id) on delete cascade,
  state text not null default 'queued',
  attempts integer not null default 0,
  available_at timestamptz not null default pg_catalog.now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint evidence_scan_job_state_valid check (state in ('queued', 'leased', 'completed', 'quarantined', 'failed')),
  constraint evidence_scan_job_attempts_valid check (attempts between 0 and 5),
  constraint evidence_scan_job_lease_consistent check (
    (state = 'leased' and lease_token is not null and lease_expires_at is not null)
    or (state <> 'leased' and lease_token is null and lease_expires_at is null)
  )
);

create index evidence_scan_jobs_claim_idx on private.evidence_scan_jobs (available_at, created_at)
  where state in ('queued', 'leased');

create table private.evidence_scan_audit (
  id bigint generated always as identity primary key,
  job_id uuid,
  evidence_id uuid not null,
  outcome text not null,
  reason_code text not null,
  sha256 text,
  engine_version text,
  signature_version text,
  attempt_number integer not null,
  occurred_at timestamptz not null default pg_catalog.now(),
  constraint evidence_scan_audit_outcome_valid check (outcome in ('clean', 'infected', 'unsupported', 'error', 'lease_expired', 'max_attempts')),
  constraint evidence_scan_audit_reason_valid check (reason_code in ('scan_clean', 'malware_detected', 'unsupported_file_type', 'invalid_file_signature', 'storage_unavailable', 'scanner_unavailable', 'scanner_error', 'retry_limit_reached', 'lease_expired')),
  constraint evidence_scan_audit_sha256_valid check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  constraint evidence_scan_audit_attempt_valid check (attempt_number between 0 and 5)
);

create index evidence_scan_audit_evidence_idx on private.evidence_scan_audit (evidence_id, occurred_at desc);

alter table private.evidence_scan_jobs enable row level security;
alter table private.evidence_scan_audit enable row level security;
revoke all on table private.evidence_scan_jobs from public, anon, authenticated, service_role;
revoke all on table private.evidence_scan_audit from public, anon, authenticated, service_role;

create function private.reject_evidence_scan_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'evidence scan audit is append-only';
end;
$function$;

create trigger evidence_scan_audit_no_row_mutation
before update or delete on private.evidence_scan_audit
for each row execute function private.reject_evidence_scan_audit_mutation();
create trigger evidence_scan_audit_no_truncate
before truncate on private.evidence_scan_audit
for each statement execute function private.reject_evidence_scan_audit_mutation();
revoke all on function private.reject_evidence_scan_audit_mutation() from public, anon, authenticated, service_role;

create function private.enqueue_evidence_scan_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.scan_state = 'pending' then
    insert into private.evidence_scan_jobs (evidence_id)
    values (new.id)
    on conflict (evidence_id) do nothing;
  end if;
  return new;
end;
$function$;

create trigger evidence_scan_job_after_insert
after insert on private.evidence_metadata
for each row execute function private.enqueue_evidence_scan_job();
revoke all on function private.enqueue_evidence_scan_job() from public, anon, authenticated, service_role;

-- Backfill pending metadata created before this migration.
insert into private.evidence_scan_jobs (evidence_id)
select evidence.id from private.evidence_metadata as evidence
where evidence.scan_state = 'pending'
on conflict (evidence_id) do nothing;

create function private.claim_evidence_scan_job()
returns table (
  job_id uuid,
  evidence_id uuid,
  object_path text,
  mime_type text,
  lease_token uuid,
  lease_expires_at timestamptz,
  attempt_number integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job private.evidence_scan_jobs%rowtype;
  v_evidence private.evidence_metadata%rowtype;
  v_now timestamptz;
  v_lease_token uuid;
  v_lease_expires_at timestamptz;
begin
  -- Expired leases are eligible for retry; exhausted work fails closed to quarantine.
  for v_job in
    select job.* from private.evidence_scan_jobs as job
    where job.attempts >= 5
      and (job.state = 'queued' or (job.state = 'leased' and job.lease_expires_at <= pg_catalog.clock_timestamp()))
    for update skip locked
  loop
    update private.evidence_scan_jobs as job
    set state = 'failed', lease_token = null, lease_expires_at = null, updated_at = pg_catalog.clock_timestamp()
    where job.id = v_job.id;
    update private.evidence_metadata as evidence set scan_state = 'quarantined'
      where evidence.id = v_job.evidence_id and evidence.scan_state = 'pending';
    insert into private.evidence_scan_audit (job_id, evidence_id, outcome, reason_code, attempt_number)
    values (v_job.id, v_job.evidence_id, 'max_attempts', 'retry_limit_reached', v_job.attempts);
  end loop;

  select job.* into v_job
  from private.evidence_scan_jobs as job
  join private.evidence_metadata as evidence on evidence.id = job.evidence_id
    where evidence.scan_state = 'pending'
    and job.attempts < 5
    and job.available_at <= pg_catalog.clock_timestamp()
    and (job.state = 'queued' or (job.state = 'leased' and job.lease_expires_at <= pg_catalog.clock_timestamp()))
  order by job.available_at, job.created_at
  for update of job skip locked
  limit 1;
  if not found then return; end if;

  if v_job.state = 'leased' then
    insert into private.evidence_scan_audit (job_id, evidence_id, outcome, reason_code, attempt_number)
    values (v_job.id, v_job.evidence_id, 'lease_expired', 'lease_expired', v_job.attempts);
  end if;

  select evidence.* into v_evidence from private.evidence_metadata as evidence where evidence.id = v_job.evidence_id;
  v_lease_token := pg_catalog.gen_random_uuid();
  -- The worker may spend up to 120s downloading, 120s on ClamAV VERSION,
  -- 120s streaming a scan, plus bounded 30s claim/result API calls. Keep
  -- enough lease headroom for a slow but valid 10 MiB sample to finish.
  -- Sample only after all earlier row-lock waits in this transaction.
  v_now := pg_catalog.clock_timestamp();
  v_lease_expires_at := v_now + interval '10 minutes';
  update private.evidence_scan_jobs as job
  set state = 'leased', attempts = job.attempts + 1, lease_token = v_lease_token,
      lease_expires_at = v_lease_expires_at, updated_at = v_now
  where job.id = v_job.id;

  return query select v_job.id, v_evidence.id, v_evidence.object_path, v_evidence.mime_type,
    v_lease_token, v_lease_expires_at, v_job.attempts + 1;
end;
$function$;
revoke all on function private.claim_evidence_scan_job() from public, anon, authenticated, service_role;

create function private.finish_evidence_scan_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_outcome text,
  p_reason_code text,
  p_sha256 text,
  p_engine_version text,
  p_signature_version text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job private.evidence_scan_jobs%rowtype;
  v_evidence_id uuid;
  v_now timestamptz;
  v_reason_code text;
begin
  if p_job_id is null or p_lease_token is null or p_outcome is null or p_reason_code is null
    or p_outcome not in ('clean', 'infected', 'unsupported', 'error')
    or p_reason_code not in ('scan_clean', 'malware_detected', 'unsupported_file_type', 'invalid_file_signature', 'storage_unavailable', 'scanner_unavailable', 'scanner_error', 'retry_limit_reached')
    or (p_outcome = 'clean' and (p_reason_code <> 'scan_clean' or p_sha256 is null))
    or (p_outcome = 'infected' and (p_reason_code <> 'malware_detected' or p_sha256 is null))
    or (p_outcome = 'unsupported' and p_reason_code not in ('unsupported_file_type', 'invalid_file_signature'))
    or (p_outcome = 'error' and p_reason_code not in ('storage_unavailable', 'scanner_unavailable', 'scanner_error', 'retry_limit_reached'))
    or (p_sha256 is not null and p_sha256 !~ '^[0-9a-f]{64}$')
    or pg_catalog.length(coalesce(p_engine_version, '')) > 100
    or pg_catalog.length(coalesce(p_signature_version, '')) > 100 then
    return false;
  end if;

  select job.* into v_job from private.evidence_scan_jobs as job
  where job.id = p_job_id and job.state = 'leased' and job.lease_token = p_lease_token
  for update;
  if not found then return false; end if;

  select evidence.id into v_evidence_id
  from private.evidence_metadata as evidence
  where evidence.id = v_job.evidence_id and evidence.scan_state = 'pending'
  for update;
  if not found then return false; end if;

  -- Check expiry after obtaining both row locks; transaction-start time could
  -- otherwise accept a lease that expired while this call waited.
  v_now := pg_catalog.clock_timestamp();
  if v_job.lease_expires_at <= v_now then return false; end if;

  v_reason_code := p_reason_code;
  if p_outcome = 'clean' then
    update private.evidence_metadata set scan_state = 'clean' where id = v_evidence_id and scan_state = 'pending';
    update private.evidence_scan_jobs set state = 'completed', lease_token = null, lease_expires_at = null, updated_at = v_now where id = v_job.id;
  elsif p_outcome = 'infected' then
    update private.evidence_metadata set scan_state = 'quarantined' where id = v_evidence_id and scan_state = 'pending';
    update private.evidence_scan_jobs set state = 'quarantined', lease_token = null, lease_expires_at = null, updated_at = v_now where id = v_job.id;
  elsif p_outcome = 'unsupported' then
    update private.evidence_metadata set scan_state = 'rejected' where id = v_evidence_id and scan_state = 'pending';
    update private.evidence_scan_jobs set state = 'failed', lease_token = null, lease_expires_at = null, updated_at = v_now where id = v_job.id;
  elsif v_job.attempts < 5 then
    update private.evidence_scan_jobs set state = 'queued', available_at = v_now + (least(v_job.attempts, 4) * interval '1 minute'),
      lease_token = null, lease_expires_at = null, updated_at = v_now where id = v_job.id;
  else
    update private.evidence_metadata set scan_state = 'quarantined' where id = v_evidence_id and scan_state = 'pending';
    update private.evidence_scan_jobs set state = 'failed', lease_token = null, lease_expires_at = null, updated_at = v_now where id = v_job.id;
    v_reason_code := 'retry_limit_reached';
  end if;

  insert into private.evidence_scan_audit (
    job_id, evidence_id, outcome, reason_code, sha256, engine_version, signature_version, attempt_number
  ) values (
    v_job.id, v_evidence_id, p_outcome, v_reason_code, p_sha256,
    nullif(pg_catalog.btrim(p_engine_version), ''),
    nullif(pg_catalog.btrim(p_signature_version), ''), v_job.attempts
  );
  return true;
end;
$function$;
revoke all on function private.finish_evidence_scan_job(uuid, uuid, text, text, text, text, text) from public, anon, authenticated, service_role;

-- SECURITY DEFINER wrappers expose only the two bounded scanner operations to service_role.
create function public.mmwr_claim_evidence_scan_job()
returns table (
  job_id uuid,
  evidence_id uuid,
  object_path text,
  mime_type text,
  lease_token uuid,
  lease_expires_at timestamptz,
  attempt_number integer
)
language sql
security definer
set search_path = ''
as $function$ select * from private.claim_evidence_scan_job() $function$;
revoke all on function public.mmwr_claim_evidence_scan_job() from public, anon, authenticated;
grant execute on function public.mmwr_claim_evidence_scan_job() to service_role;

create function public.mmwr_finish_evidence_scan_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_outcome text,
  p_reason_code text,
  p_sha256 text,
  p_engine_version text,
  p_signature_version text
)
returns boolean
language sql
security definer
set search_path = ''
as $function$
  select private.finish_evidence_scan_job(p_job_id, p_lease_token, p_outcome, p_reason_code, p_sha256, p_engine_version, p_signature_version)
$function$;
revoke all on function public.mmwr_finish_evidence_scan_job(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.mmwr_finish_evidence_scan_job(uuid, uuid, text, text, text, text, text) to service_role;
