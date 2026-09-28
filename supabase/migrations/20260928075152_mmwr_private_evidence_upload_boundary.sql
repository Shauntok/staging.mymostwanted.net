-- Untrusted evidence starts in one private quarantine bucket. The only SELECT
-- exception lets Storage return the just-uploaded object's metadata; listing,
-- info, download, and preview remain unavailable until a reviewed workflow.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mmwr-evidence-quarantine',
  'mmwr-evidence-quarantine',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/x-wav',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create function private.can_upload_evidence_object(p_name text, p_metadata jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_folders text[];
  v_submission_id uuid;
  v_object_count bigint;
begin
  if v_user_id is null or p_name is null then
    return false;
  end if;

  if not private.evidence_mime_matches_extension(p_name, p_metadata ->> 'mimetype') then
    return false;
  end if;

  v_folders := storage.foldername(p_name);
  if pg_catalog.cardinality(v_folders) <> 2
    or v_folders[1] <> v_user_id::text
    or v_folders[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or storage.filename(p_name) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp|pdf|mp3|m4a|wav|doc|docx)$' then
    return false;
  end if;

  v_submission_id := v_folders[2]::uuid;

  -- Prevent concurrent uploads from exceeding the per-submission object cap.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_submission_id::text, 0));

  if not exists (
    select 1
    from private.submissions as submission
    where submission.id = v_submission_id
      and submission.submitter_id = v_user_id
      and submission.status in ('received', 'needs_more_information')
  ) then
    return false;
  end if;

  select pg_catalog.count(*) into v_object_count
  from storage.objects as evidence_object
  where evidence_object.bucket_id = 'mmwr-evidence-quarantine'
    and (storage.foldername(evidence_object.name))[1] = v_user_id::text
    and (storage.foldername(evidence_object.name))[2] = v_submission_id::text;

  return v_object_count < 5;
end;
$function$;

revoke all on function private.can_upload_evidence_object(text, jsonb) from public, anon, service_role;
grant execute on function private.can_upload_evidence_object(text, jsonb) to authenticated;

create function private.evidence_mime_matches_extension(p_name text, p_mime_type text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select case
    when p_name is null or p_mime_type is null then false
    when pg_catalog.lower(storage.extension(p_name)) = 'jpg' then pg_catalog.lower(p_mime_type) = 'image/jpeg'
    when pg_catalog.lower(storage.extension(p_name)) = 'jpeg' then pg_catalog.lower(p_mime_type) = 'image/jpeg'
    when pg_catalog.lower(storage.extension(p_name)) = 'png' then pg_catalog.lower(p_mime_type) = 'image/png'
    when pg_catalog.lower(storage.extension(p_name)) = 'webp' then pg_catalog.lower(p_mime_type) = 'image/webp'
    when pg_catalog.lower(storage.extension(p_name)) = 'pdf' then pg_catalog.lower(p_mime_type) = 'application/pdf'
    when pg_catalog.lower(storage.extension(p_name)) = 'mp3' then pg_catalog.lower(p_mime_type) = 'audio/mpeg'
    when pg_catalog.lower(storage.extension(p_name)) = 'm4a' then pg_catalog.lower(p_mime_type) = 'audio/mp4'
    when pg_catalog.lower(storage.extension(p_name)) = 'wav' then pg_catalog.lower(p_mime_type) in ('audio/wav', 'audio/x-wav')
    when pg_catalog.lower(storage.extension(p_name)) = 'doc' then pg_catalog.lower(p_mime_type) = 'application/msword'
    when pg_catalog.lower(storage.extension(p_name)) = 'docx' then pg_catalog.lower(p_mime_type) = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    else false
  end;
$function$;

revoke all on function private.evidence_mime_matches_extension(text, text) from public, anon, service_role;
grant execute on function private.evidence_mime_matches_extension(text, text) to authenticated;

create unique index evidence_metadata_object_path_unique
  on private.evidence_metadata (object_path);

create function private.register_submission_evidence(p_submission_id uuid, p_object_name text)
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
  if v_user_id is null or p_submission_id is null or p_object_name is null then
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
  if found then
    return v_evidence_id;
  end if;

  insert into private.evidence_metadata (
    submission_id, uploaded_by, object_path, mime_type, scan_state, visibility
  ) values (
    p_submission_id, v_user_id, p_object_name, pg_catalog.lower(v_mime_type), 'pending', 'internal_only'
  ) returning id into v_evidence_id;

  return v_evidence_id;
end;
$function$;

revoke all on function private.register_submission_evidence(uuid, text) from public, anon, service_role;
grant execute on function private.register_submission_evidence(uuid, text) to authenticated;

create function public.register_submission_evidence(p_submission_id uuid, p_object_name text)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.register_submission_evidence(p_submission_id, p_object_name);
$function$;

revoke all on function public.register_submission_evidence(uuid, text) from public, anon, service_role;
grant execute on function public.register_submission_evidence(uuid, text) to authenticated;

create policy mmwr_evidence_quarantine_submitter_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'mmwr-evidence-quarantine'
    and private.can_upload_evidence_object(name, metadata)
  );

-- Current Supabase Storage upload handlers perform INSERT ... RETURNING. Limit
-- the required SELECT privilege to that upload response operation so it cannot
-- be used for object listing, metadata queries, signed URLs, or file downloads.
create policy mmwr_evidence_quarantine_upload_response_metadata
  on storage.objects for select to authenticated
  using (
    bucket_id = 'mmwr-evidence-quarantine'
    and storage.allow_only_operation('storage.object.upload')
    and pg_catalog.cardinality(storage.foldername(name)) = 2
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
