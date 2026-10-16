create extension if not exists pgtap with schema extensions;

begin;

select plan(23);

insert into private.submissions (id, submitted_title, original_source, status, risk_level)
values
  ('88000000-0000-4000-8000-000000000001', 'Scanner clean fixture', 'Synthetic scanner source one', 'received', 'ordinary'),
  ('88000000-0000-4000-8000-000000000002', 'Scanner infected fixture', 'Synthetic scanner source two', 'received', 'ordinary'),
  ('88000000-0000-4000-8000-000000000003', 'Scanner retry fixture', 'Synthetic scanner source three', 'received', 'ordinary');

insert into private.evidence_metadata (id, submission_id, object_path, mime_type, scan_state, visibility)
values
  ('88000000-0000-4000-8000-000000000011', '88000000-0000-4000-8000-000000000001', 'synthetic/clean-fixture.jpg', 'image/jpeg', 'pending', 'internal_only'),
  ('88000000-0000-4000-8000-000000000012', '88000000-0000-4000-8000-000000000002', 'synthetic/infected-fixture.jpg', 'image/jpeg', 'pending', 'internal_only'),
  ('88000000-0000-4000-8000-000000000013', '88000000-0000-4000-8000-000000000003', 'synthetic/retry-fixture.jpg', 'image/jpeg', 'pending', 'internal_only');

update private.evidence_scan_jobs
set available_at = case evidence_id
      when '88000000-0000-4000-8000-000000000011' then pg_catalog.clock_timestamp() - interval '2 minutes'
      when '88000000-0000-4000-8000-000000000012' then pg_catalog.clock_timestamp() - interval '1 minute'
      else pg_catalog.clock_timestamp()
    end,
    created_at = case evidence_id
      when '88000000-0000-4000-8000-000000000011' then pg_catalog.clock_timestamp() - interval '2 minutes'
      when '88000000-0000-4000-8000-000000000012' then pg_catalog.clock_timestamp() - interval '1 minute'
      else pg_catalog.clock_timestamp()
    end;

create temporary table pgtap_scanner_claims (
  job_id uuid not null,
  evidence_id uuid not null,
  object_path text not null,
  mime_type text not null,
  lease_token uuid not null,
  lease_expires_at timestamptz not null,
  attempt_number integer not null
);
grant select, insert on pgtap_scanner_claims to service_role;

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'private.evidence_scan_jobs'::regclass)
  and (select relrowsecurity from pg_catalog.pg_class where oid = 'private.evidence_scan_audit'::regclass),
  'scanner work and audit tables both use RLS'
);
select ok(
  not has_table_privilege('anon', 'private.evidence_scan_jobs', 'SELECT')
  and not has_table_privilege('authenticated', 'private.evidence_scan_jobs', 'SELECT')
  and not has_table_privilege('service_role', 'private.evidence_scan_jobs', 'SELECT')
  and not has_table_privilege('authenticated', 'private.evidence_scan_audit', 'SELECT'),
  'clients and scanner service cannot directly enumerate jobs or audit rows'
);
select ok(
  has_function_privilege('service_role', 'public.mmwr_claim_evidence_scan_job()', 'EXECUTE')
  and has_function_privilege('service_role', 'public.mmwr_finish_evidence_scan_job(uuid,uuid,text,text,text,text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.mmwr_claim_evidence_scan_job()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.mmwr_finish_evidence_scan_job(uuid,uuid,text,text,text,text,text)', 'EXECUTE'),
  'only service_role can claim or finish an evidence scan job'
);
select is((select pg_catalog.count(*)::integer from private.evidence_scan_jobs where state = 'queued'), 3, 'pending evidence is queued once when registered');
select is((select pg_catalog.count(*)::integer from pg_catalog.pg_attribute where attrelid = 'private.evidence_scan_audit'::regclass and attnum > 0 and not attisdropped and attname in ('object_path', 'signed_url', 'file_bytes')), 0, 'scanner audit schema contains no object path, signed URL, or file bytes');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
insert into pgtap_scanner_claims
select job_id, evidence_id, object_path, mime_type, lease_token, lease_expires_at, attempt_number
from public.mmwr_claim_evidence_scan_job();
select is((select pg_catalog.count(*)::integer from pgtap_scanner_claims), 1, 'scanner claims one pending job at a time');
select ok(
  (select attempt_number = 1 and mime_type = 'image/jpeg' and object_path = 'synthetic/clean-fixture.jpg'
    and lease_expires_at > pg_catalog.clock_timestamp() + interval '9 minutes'
   from pgtap_scanner_claims where evidence_id = '88000000-0000-4000-8000-000000000011'),
  'first claim increments attempts and returns the bounded path with a ten-minute lease'
);
select is(
  public.mmwr_finish_evidence_scan_job(
    (select job_id from pgtap_scanner_claims where evidence_id = '88000000-0000-4000-8000-000000000011'),
    '88000000-0000-4000-8000-000000000099', 'clean', 'scan_clean', pg_catalog.repeat('a', 64), 'fixture-engine', 'fixture-signatures'
  ),
  false,
  'wrong lease token cannot finish the claimed job'
);
select is(
  public.mmwr_finish_evidence_scan_job(
    (select job_id from pgtap_scanner_claims where evidence_id = '88000000-0000-4000-8000-000000000011'),
    (select lease_token from pgtap_scanner_claims where evidence_id = '88000000-0000-4000-8000-000000000011'),
    'clean', 'scan_clean', pg_catalog.repeat('a', 64), 'fixture-engine', 'fixture-signatures'
  ),
  true,
  'valid lease can complete a clean scan'
);
select is((select pg_catalog.count(*)::integer from pgtap_scanner_claims where evidence_id = '88000000-0000-4000-8000-000000000011'), 1, 'captured claim is bound to the claimed evidence item');
select is(
  public.mmwr_finish_evidence_scan_job(
    (select job_id from pgtap_scanner_claims where evidence_id = '88000000-0000-4000-8000-000000000011'),
    (select lease_token from pgtap_scanner_claims where evidence_id = '88000000-0000-4000-8000-000000000011'),
    'clean', 'scan_clean', pg_catalog.repeat('a', 64), 'fixture-engine', 'fixture-signatures'
  ),
  false,
  'completed lease cannot be replayed'
);
reset role;

select is((select scan_state from private.evidence_metadata where id = '88000000-0000-4000-8000-000000000011'), 'clean', 'clean scan enables the metadata state only after a valid result');
select is((select state from private.evidence_scan_jobs where evidence_id = '88000000-0000-4000-8000-000000000011'), 'completed', 'clean scan completes and releases the job lease');
select is((select pg_catalog.count(*)::integer from private.evidence_scan_audit where evidence_id = '88000000-0000-4000-8000-000000000011' and outcome = 'clean' and sha256 = pg_catalog.repeat('a', 64)), 1, 'clean result is appended to scanner audit');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
insert into pgtap_scanner_claims
select job_id, evidence_id, object_path, mime_type, lease_token, lease_expires_at, attempt_number
from public.mmwr_claim_evidence_scan_job();
reset role;
update private.evidence_scan_jobs
set lease_expires_at = pg_catalog.clock_timestamp() - interval '1 second'
where evidence_id = '88000000-0000-4000-8000-000000000012';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
insert into pgtap_scanner_claims
select job_id, evidence_id, object_path, mime_type, lease_token, lease_expires_at, attempt_number
from public.mmwr_claim_evidence_scan_job();
select is((select pg_catalog.count(*)::integer from pgtap_scanner_claims where evidence_id = '88000000-0000-4000-8000-000000000012' and attempt_number = 2), 1, 'expired lease is reclaimed with a new attempt');
select is(
  public.mmwr_finish_evidence_scan_job(
    (select job_id from pgtap_scanner_claims where evidence_id = '88000000-0000-4000-8000-000000000012' and attempt_number = 1),
    (select lease_token from pgtap_scanner_claims where evidence_id = '88000000-0000-4000-8000-000000000012' and attempt_number = 1),
    'infected', 'malware_detected', pg_catalog.repeat('b', 64), 'fixture-engine', 'fixture-signatures'
  ),
  false,
  'expired prior lease token cannot quarantine or finish after reclaim'
);
select is(
  public.mmwr_finish_evidence_scan_job(
    (select job_id from pgtap_scanner_claims where evidence_id = '88000000-0000-4000-8000-000000000012' and attempt_number = 2),
    (select lease_token from pgtap_scanner_claims where evidence_id = '88000000-0000-4000-8000-000000000012' and attempt_number = 2),
    'infected', 'malware_detected', pg_catalog.repeat('b', 64), 'fixture-engine', 'fixture-signatures'
  ),
  true,
  'current scan lease can quarantine detected malware'
);
reset role;

select is((select scan_state from private.evidence_metadata where id = '88000000-0000-4000-8000-000000000012'), 'quarantined', 'infected scan leaves evidence quarantined');
select is((select pg_catalog.count(*)::integer from private.evidence_scan_audit where evidence_id = '88000000-0000-4000-8000-000000000012' and outcome = 'lease_expired'), 1, 'lease reclaim is recorded without file data');

update private.evidence_scan_jobs set attempts = 5 where evidence_id = '88000000-0000-4000-8000-000000000013';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is((select pg_catalog.count(*)::integer from public.mmwr_claim_evidence_scan_job()), 0, 'retry-exhausted evidence is never returned to the scanner');
reset role;
select is((select state from private.evidence_scan_jobs where evidence_id = '88000000-0000-4000-8000-000000000013'), 'failed', 'retry exhaustion fails the queued job');
select is((select scan_state from private.evidence_metadata where id = '88000000-0000-4000-8000-000000000013'), 'quarantined', 'retry exhaustion quarantines pending evidence');

select throws_ok(
  $$update private.evidence_scan_audit set reason_code = 'scanner_error' where evidence_id = '88000000-0000-4000-8000-000000000011'$$,
  'P0001', 'evidence scan audit is append-only', 'scanner audit is append-only'
);

select * from finish();
rollback;
