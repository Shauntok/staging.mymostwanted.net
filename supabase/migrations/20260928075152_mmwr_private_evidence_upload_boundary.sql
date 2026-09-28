-- Untrusted evidence starts in one private quarantine bucket. No read policy is
-- created here: uploads cannot be fetched, previewed, or served until a later
-- reviewed workflow grants narrowly scoped access after content scanning.

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
  v_extension text;
  v_mime_type text;
begin
  if v_user_id is null or p_name is null then
    return false;
  end if;

  v_extension := pg_catalog.lower(storage.extension(p_name));
  v_mime_type := pg_catalog.lower(p_metadata ->> 'mimetype');
  if v_extension is null or v_mime_type is null then
    return false;
  end if;

  if case v_extension
    when 'jpg' then v_mime_type <> 'image/jpeg'
    when 'jpeg' then v_mime_type <> 'image/jpeg'
    when 'png' then v_mime_type <> 'image/png'
    when 'webp' then v_mime_type <> 'image/webp'
    when 'pdf' then v_mime_type <> 'application/pdf'
    when 'mp3' then v_mime_type <> 'audio/mpeg'
    when 'm4a' then v_mime_type <> 'audio/mp4'
    when 'wav' then v_mime_type not in ('audio/wav', 'audio/x-wav')
    when 'doc' then v_mime_type <> 'application/msword'
    when 'docx' then v_mime_type <> 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    else true
  end then
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

create policy mmwr_evidence_quarantine_submitter_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'mmwr-evidence-quarantine'
    and private.can_upload_evidence_object(name, metadata)
  );
