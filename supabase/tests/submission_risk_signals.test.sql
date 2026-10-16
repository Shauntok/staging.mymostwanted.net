create extension if not exists pgtap with schema extensions;

begin;

select plan(15);

insert into private.areas (id, area_name, area_type)
values ('87000000-0000-4000-8000-000000000020', 'Risk fixture state', 'state');

insert into private.submissions (id, submitted_title, original_source, status, risk_level)
values
  ('87000000-0000-4000-8000-000000000001', 'Primary duplicate fixture', '  Synthetic   repeated description  ', 'received', 'ordinary'),
  ('87000000-0000-4000-8000-000000000002', 'Supplement duplicate fixture', 'A different source', 'needs_more_information', 'ordinary'),
  ('87000000-0000-4000-8000-000000000003', 'Unique open fixture', 'A separate locally authored description', 'reviewing', 'ordinary'),
  ('87000000-0000-4000-8000-000000000004', 'Closed duplicate fixture', 'synthetic repeated description', 'closed', 'ordinary');

insert into private.submission_addenda (id, submission_id, additional_information)
values ('87000000-0000-4000-8000-000000000012', '87000000-0000-4000-8000-000000000002', 'synthetic repeated description');

select is((select enabled from private.runtime_flags where flag = 'submission_risk_scanning'), false, 'ordinary risk signal scanning starts disabled');
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'private.submission_risk_signals'::regclass)
  and not has_table_privilege('anon', 'private.submission_risk_signals', 'SELECT')
  and not has_table_privilege('authenticated', 'private.submission_risk_signals', 'SELECT'),
  'risk signals use RLS and have no direct client read grants'
);
select ok(
  (select pg_catalog.count(*)::integer from pg_catalog.pg_attribute
   where attrelid = 'private.submission_risk_signals'::regclass and attnum > 0 and not attisdropped) = 5
  and not exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'private.submission_risk_signals'::regclass
      and attname in ('normalized_text', 'description', 'fingerprint', 'text_hash') and not attisdropped
  ),
  'risk signal records store codes and references, not description text or a retained text fingerprint'
);
select is((select pg_catalog.count(*)::integer from private.submission_risk_signals), 0, 'closed scanning gate stores no risk signals for synthetic submissions');

update private.runtime_flags set enabled = true where flag = 'submission_risk_scanning';
select is((select active from private.submission_risk_signals where submission_id = '87000000-0000-4000-8000-000000000001' and signal_code = 'duplicate_open_description'), true, 'exact normalized primary-to-supplementary description match flags the open primary submission');
select is((select active from private.submission_risk_signals where submission_id = '87000000-0000-4000-8000-000000000002' and signal_code = 'duplicate_open_description'), true, 'matching supplementary description flags its open submission');
select is((select pg_catalog.count(*)::integer from private.submission_risk_signals where submission_id = '87000000-0000-4000-8000-000000000004' and active), 0, 'closed identical description is not considered an open duplicate');
select ok(
  (select risk_level = 'ordinary' and status = 'received' from private.submissions where id = '87000000-0000-4000-8000-000000000001')
  and (select risk_level = 'ordinary' and status = 'needs_more_information' from private.submissions where id = '87000000-0000-4000-8000-000000000002'),
  'advisory duplicate signals do not block submissions or elevate their risk level'
);
select ok(
  (select active from private.submission_risk_signals where submission_id = '87000000-0000-4000-8000-000000000001' and signal_code = 'missing_clean_image')
  and (select active from private.submission_risk_signals where submission_id = '87000000-0000-4000-8000-000000000002' and signal_code = 'missing_clean_image'),
  'open submissions without a clean scanned image receive the ordinary missing-image signal'
);
select is((select active from private.submission_risk_signals where submission_id = '87000000-0000-4000-8000-000000000003' and signal_code = 'missing_clean_image'), true, 'unique open submission receives the same missing-image signal without being marked a duplicate');

insert into private.evidence_metadata (id, submission_id, object_path, mime_type, scan_state, visibility)
values ('87000000-0000-4000-8000-000000000022', '87000000-0000-4000-8000-000000000002', 'synthetic/clean.jpg', 'image/jpeg', 'clean', 'internal_only');
select is((select active from private.submission_risk_signals where submission_id = '87000000-0000-4000-8000-000000000002' and signal_code = 'missing_clean_image'), false, 'clean image evidence clears the missing-image signal');

insert into private.evidence_metadata (id, submission_id, object_path, mime_type, scan_state, visibility)
values ('87000000-0000-4000-8000-000000000023', '87000000-0000-4000-8000-000000000001', 'synthetic/document.pdf', 'application/pdf', 'clean', 'internal_only');
select is((select active from private.submission_risk_signals where submission_id = '87000000-0000-4000-8000-000000000001' and signal_code = 'missing_clean_image'), true, 'a clean non-image attachment does not count as a clean image');

update private.submissions set status = 'approved' where id = '87000000-0000-4000-8000-000000000001';
select is((select pg_catalog.count(*)::integer from private.submission_risk_signals where submission_id = '87000000-0000-4000-8000-000000000001' and active), 0, 'closed submission no longer carries active ordinary risk signals');
select is((select active from private.submission_risk_signals where submission_id = '87000000-0000-4000-8000-000000000002' and signal_code = 'duplicate_open_description'), false, 'remaining open peer clears its duplicate signal when the matching submission closes');
select is((select active from private.submission_risk_signals where submission_id = '87000000-0000-4000-8000-000000000002' and signal_code = 'missing_clean_image'), false, 'remaining peer keeps its independently resolved clean-image signal state');

select * from finish();
rollback;
