-- Owner-only visibility control for clean submission evidence.
-- public_thumbnail means prepared for possible publication after approval; the
-- object remains in the private quarantine bucket and cannot be read publicly
-- while it is attached to a submission.

alter table private.runtime_flags drop constraint runtime_flags_name_valid;
alter table private.runtime_flags add constraint runtime_flags_name_valid
  check (flag in (
    'account_deletion', 'submission_risk_scanning', 'critical_security_email',
    'staff_evidence_preview', 'owner_evidence_visibility'
  ));

insert into private.runtime_flags (flag, enabled)
values ('owner_evidence_visibility', false)
on conflict (flag) do nothing;

alter table private.evidence_metadata alter column visibility set default 'public_thumbnail';

create table private.submission_evidence_visibility_audit (
  id bigint generated always as identity primary key,
  evidence_id uuid not null,
  submission_id uuid not null,
  actor_user_id uuid not null,
  visibility_before text not null,
  visibility_after text not null,
  reason text not null,
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint submission_evidence_visibility_before_valid check (visibility_before in ('internal_only', 'public_thumbnail')),
  constraint submission_evidence_visibility_after_valid check (visibility_after in ('internal_only', 'public_thumbnail')),
  constraint submission_evidence_visibility_reason_size check (pg_catalog.char_length(pg_catalog.btrim(reason)) between 1 and 500)
);
create index submission_evidence_visibility_audit_evidence_time_idx
  on private.submission_evidence_visibility_audit (evidence_id, occurred_at desc);
alter table private.submission_evidence_visibility_audit enable row level security;
revoke all on table private.submission_evidence_visibility_audit from public, anon, authenticated, service_role;

create function private.reject_submission_evidence_visibility_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'submission evidence visibility audit is append-only' using errcode = '55000';
end;
$function$;
create trigger submission_evidence_visibility_audit_no_mutation
before update or delete or truncate on private.submission_evidence_visibility_audit
for each statement execute function private.reject_submission_evidence_visibility_audit_mutation();
revoke all on function private.reject_submission_evidence_visibility_audit_mutation() from public, anon, authenticated, service_role;

create function private.owner_list_submission_evidence(p_submission_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  v_enabled boolean := false;
  v_items jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or p_submission_id is null
    or not private.has_staff_role('owner') or not private.has_recent_totp() then
    raise exception 'owner evidence visibility access denied' using errcode = '42501';
  end if;

  select coalesce(runtime_flag.enabled, false) into v_enabled
  from private.runtime_flags as runtime_flag
  where runtime_flag.flag = 'owner_evidence_visibility';
  if not coalesce(v_enabled, false) then
    return pg_catalog.jsonb_build_object('enabled', false, 'items', v_items);
  end if;

  if not exists (
    select 1 from private.submissions as submission
    where submission.id = p_submission_id
      and submission.status in ('received', 'reviewing', 'needs_more_information')
  ) then
    return pg_catalog.jsonb_build_object('enabled', true, 'items', v_items);
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', evidence.id,
      'mime_type', evidence.mime_type,
      'created_at', evidence.created_at,
      'visibility', evidence.visibility
    ) order by evidence.created_at, evidence.id), '[]'::jsonb)
    into v_items
  from private.evidence_metadata as evidence
  where evidence.submission_id = p_submission_id
    and evidence.scan_state = 'clean';

  return pg_catalog.jsonb_build_object('enabled', true, 'items', v_items);
end;
$function$;
revoke all on function private.owner_list_submission_evidence(uuid) from public, anon, service_role;
grant execute on function private.owner_list_submission_evidence(uuid) to authenticated;

create function public.owner_list_submission_evidence(p_submission_id uuid)
returns jsonb
language sql volatile security invoker set search_path = ''
as $function$
  select private.owner_list_submission_evidence(p_submission_id)
$function$;
revoke all on function public.owner_list_submission_evidence(uuid) from public, anon, service_role;
grant execute on function public.owner_list_submission_evidence(uuid) to authenticated;

create function private.owner_set_submission_evidence_visibility(
  p_evidence_id uuid,
  p_visibility text,
  p_reason text
)
returns boolean
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_submission_id uuid;
  v_visibility_before text;
  v_enabled boolean := false;
  v_now timestamptz;
begin
  if v_user_id is null or p_evidence_id is null or p_visibility is null
    or p_visibility not in ('internal_only', 'public_thumbnail')
    or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason, ''))) not between 1 and 500
    or not private.has_staff_role('owner') or not private.has_recent_totp() then
    raise exception 'owner evidence visibility access denied' using errcode = '42501';
  end if;

  select evidence.submission_id into v_submission_id
  from private.evidence_metadata as evidence
  where evidence.id = p_evidence_id
    and evidence.submission_id is not null
    and evidence.post_id is null;
  if not found then return false; end if;

  -- Lock the parent before evidence, matching submission lifecycle updates.
  perform 1 from private.submissions as submission
  where submission.id = v_submission_id
    and submission.status in ('received', 'reviewing', 'needs_more_information')
  for update;
  if not found then return false; end if;

  select evidence.visibility into v_visibility_before
  from private.evidence_metadata as evidence
  where evidence.id = p_evidence_id
    and evidence.submission_id = v_submission_id
    and evidence.post_id is null
    and evidence.scan_state = 'clean'
  for update;
  if not found then return false; end if;

  -- Hold the flag stable through the change and recheck proofs after all lock waits.
  select coalesce(runtime_flag.enabled, false) into v_enabled
  from private.runtime_flags as runtime_flag
  where runtime_flag.flag = 'owner_evidence_visibility'
  for share;
  v_now := pg_catalog.clock_timestamp();
  if not private.has_staff_role('owner') or not private.has_recent_totp() then
    raise exception 'owner evidence visibility access denied' using errcode = '42501';
  end if;
  if not coalesce(v_enabled, false) then
    raise exception 'owner evidence visibility is disabled' using errcode = '42501';
  end if;
  if not exists (
    select 1 from private.submissions as submission
    where submission.id = v_submission_id
      and submission.status in ('received', 'reviewing', 'needs_more_information')
  ) then return false; end if;
  if v_visibility_before = p_visibility then return false; end if;

  update private.evidence_metadata
  set visibility = p_visibility
  where id = p_evidence_id and submission_id = v_submission_id
    and scan_state = 'clean' and visibility = v_visibility_before;
  if not found then return false; end if;

  insert into private.submission_evidence_visibility_audit (
    evidence_id, submission_id, actor_user_id, visibility_before, visibility_after, reason, occurred_at
  ) values (
    p_evidence_id, v_submission_id, v_user_id, v_visibility_before, p_visibility, pg_catalog.btrim(p_reason), v_now
  );
  return true;
end;
$function$;
revoke all on function private.owner_set_submission_evidence_visibility(uuid, text, text) from public, anon, service_role;
grant execute on function private.owner_set_submission_evidence_visibility(uuid, text, text) to authenticated;

create function public.owner_set_submission_evidence_visibility(
  p_evidence_id uuid,
  p_visibility text,
  p_reason text
)
returns boolean
language sql volatile security invoker set search_path = ''
as $function$
  select private.owner_set_submission_evidence_visibility(p_evidence_id, p_visibility, p_reason)
$function$;
revoke all on function public.owner_set_submission_evidence_visibility(uuid, text, text) from public, anon, service_role;
grant execute on function public.owner_set_submission_evidence_visibility(uuid, text, text) to authenticated;

-- Apply the documented initial state to newly registered attachments only.
create or replace function private.register_submission_evidence(p_submission_id uuid, p_object_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_folders text[];
  v_mime_type text;
  v_evidence_id uuid;
begin
  if v_user_id is null or p_submission_id is null or p_object_name is null
    or private.account_has_active_sanction(v_user_id, 'submission_suspension')
    or private.account_has_active_sanction(v_user_id, 'account_suspension')
    or not exists (
      select 1 from public.profiles as profile
      where profile.id = v_user_id and profile.account_state = 'active'
    ) then
    return null;
  end if;

  v_folders := storage.foldername(p_object_name);
  if pg_catalog.cardinality(v_folders) <> 2
    or v_folders[1] <> v_user_id::text
    or v_folders[2] <> p_submission_id::text
    or storage.filename(p_object_name) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp|pdf|mp3|m4a|wav|doc|docx)$'
    or not exists (
      select 1 from private.submissions as submission
      where submission.id = p_submission_id
        and submission.submitter_id = v_user_id
        and submission.status in ('received', 'needs_more_information')
    ) then
    return null;
  end if;

  select evidence_object.metadata ->> 'mimetype' into v_mime_type
  from storage.objects as evidence_object
  where evidence_object.bucket_id = 'mmwr-evidence-quarantine'
    and evidence_object.name = p_object_name;
  if not found or not private.evidence_mime_matches_extension(p_object_name, v_mime_type) then
    return null;
  end if;

  select evidence.id into v_evidence_id
  from private.evidence_metadata as evidence
  where evidence.object_path = p_object_name;
  if found then return v_evidence_id; end if;

  insert into private.evidence_metadata (
    submission_id, uploaded_by, object_path, mime_type, scan_state, visibility
  ) values (
    p_submission_id, v_user_id, p_object_name, pg_catalog.lower(v_mime_type), 'pending', 'public_thumbnail'
  ) returning id into v_evidence_id;
  return v_evidence_id;
end;
$function$;
