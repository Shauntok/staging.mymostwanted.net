-- Sanitized list thumbnails are stored separately from quarantined evidence.
-- This migration creates no public object path or enabled runtime flag.

alter table private.runtime_flags drop constraint runtime_flags_name_valid;
alter table private.runtime_flags add constraint runtime_flags_name_valid
  check (flag in (
    'account_deletion', 'submission_risk_scanning', 'critical_security_email',
    'staff_evidence_preview', 'owner_evidence_visibility', 'submission_publication',
    'account_deletion_cleanup', 'public_thumbnails'
  ));

insert into private.runtime_flags (flag, enabled)
values ('public_thumbnails', false)
on conflict (flag) do nothing;

alter table private.evidence_metadata
  add column thumbnail_object_path text,
  add constraint evidence_thumbnail_path_format check (
    thumbnail_object_path is null or thumbnail_object_path ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
  );
create unique index evidence_thumbnail_object_path_unique
  on private.evidence_metadata (thumbnail_object_path)
  where thumbnail_object_path is not null;

alter table public.published_previews
  add column public_thumbnail_count integer not null default 0,
  add constraint published_previews_thumbnail_count_valid check (public_thumbnail_count >= 0);
grant select (public_thumbnail_count) on table public.published_previews to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mmwr-public-thumbnail-derivatives',
  'mmwr-public-thumbnail-derivatives',
  false,
  524288,
  array['image/webp']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create function private.set_public_thumbnail_projection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count integer := 0;
begin
  if exists (
    select 1 from private.runtime_flags as flag
    where flag.flag = 'public_thumbnails' and flag.enabled
  ) then
    select pg_catalog.count(*)::integer into v_count
    from private.evidence_metadata as evidence
    where evidence.post_id = new.post_id
      and evidence.scan_state = 'clean'
      and evidence.visibility = 'public_thumbnail'
      and evidence.thumbnail_object_path is not null;
  end if;

  new.public_thumbnail_count := v_count;
  new.thumbnail_available := v_count > 0;
  return new;
end;
$function$;
revoke all on function private.set_public_thumbnail_projection() from public, anon, authenticated, service_role;
create trigger published_previews_thumbnail_projection
before insert or update on public.published_previews
for each row execute function private.set_public_thumbnail_projection();

create function private.refresh_public_thumbnail_projection_setting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.flag = 'public_thumbnails' and (tg_op = 'INSERT' or old.enabled is distinct from new.enabled) then
    update public.published_previews as preview set public_thumbnail_count = preview.public_thumbnail_count;
  end if;
  return new;
end;
$function$;
revoke all on function private.refresh_public_thumbnail_projection_setting() from public, anon, authenticated, service_role;
create trigger public_thumbnail_runtime_flag_refresh
after insert or update of enabled on private.runtime_flags
for each row execute function private.refresh_public_thumbnail_projection_setting();

update public.published_previews as preview
set public_thumbnail_count = (
  select pg_catalog.count(*)::integer
  from private.evidence_metadata as evidence
  where evidence.post_id = preview.post_id
    and evidence.scan_state = 'clean'
    and evidence.visibility = 'public_thumbnail'
    and evidence.thumbnail_object_path is not null
);

create function public.mmwr_get_scanner_thumbnail_target(p_job_id uuid, p_lease_token uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_path text;
begin
  if p_job_id is null or p_lease_token is null
    or not exists (
      select 1 from private.runtime_flags as flag
      where flag.flag = 'public_thumbnails' and flag.enabled
    ) then
    return null;
  end if;

  select evidence.uploaded_by::text || '/' || job.id::text || '/' || job.lease_token::text || '.webp'
    into v_path
  from private.evidence_scan_jobs as job
  join private.evidence_metadata as evidence on evidence.id = job.evidence_id
  where job.id = p_job_id
    and job.state = 'leased'
    and job.lease_token = p_lease_token
    and job.lease_expires_at > pg_catalog.clock_timestamp()
    and evidence.scan_state = 'pending'
    and evidence.visibility = 'public_thumbnail'
    and evidence.submission_id is not null
    and evidence.post_id is null
    and evidence.uploaded_by is not null
    and evidence.mime_type in ('image/jpeg', 'image/png', 'image/webp');
  return v_path;
end;
$function$;
revoke all on function public.mmwr_get_scanner_thumbnail_target(uuid,uuid) from public, anon, authenticated;
grant execute on function public.mmwr_get_scanner_thumbnail_target(uuid,uuid) to service_role;

create function public.mmwr_register_evidence_thumbnail(p_job_id uuid, p_lease_token uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_job private.evidence_scan_jobs%rowtype;
  v_evidence private.evidence_metadata%rowtype;
  v_now timestamptz;
  v_path text;
begin
  if p_job_id is null or p_lease_token is null
    or not exists (
      select 1 from private.runtime_flags as flag
      where flag.flag = 'public_thumbnails' and flag.enabled
    ) then
    return false;
  end if;

  select job.* into v_job from private.evidence_scan_jobs as job
  where job.id = p_job_id and job.state = 'leased' and job.lease_token = p_lease_token
  for update;
  if not found then return false; end if;

  select evidence.* into v_evidence from private.evidence_metadata as evidence
  where evidence.id = v_job.evidence_id and evidence.scan_state = 'pending'
  for update;
  if not found then return false; end if;

  v_now := pg_catalog.clock_timestamp();
  if v_job.lease_expires_at <= v_now
    or v_evidence.visibility <> 'public_thumbnail'
    or v_evidence.submission_id is null
    or v_evidence.post_id is not null
    or v_evidence.uploaded_by is null
    or v_evidence.mime_type not in ('image/jpeg', 'image/png', 'image/webp')
    then
    return false;
  end if;

  v_path := v_evidence.uploaded_by::text || '/' || v_job.id::text || '/' || v_job.lease_token::text || '.webp';
  if v_evidence.thumbnail_object_path = v_path then return true; end if;
  if v_evidence.thumbnail_object_path is not null then return false; end if;
  update private.evidence_metadata as evidence
  set thumbnail_object_path = v_path
  where evidence.id = v_evidence.id and evidence.scan_state = 'pending'
    and evidence.visibility = 'public_thumbnail' and evidence.thumbnail_object_path is null;
  return found;
end;
$function$;
revoke all on function public.mmwr_register_evidence_thumbnail(uuid,uuid) from public, anon, authenticated;
grant execute on function public.mmwr_register_evidence_thumbnail(uuid,uuid) to service_role;

create function public.mmwr_public_thumbnail_path(p_post_id uuid, p_position integer)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_path text;
begin
  if p_post_id is null or p_position is null or p_position < 0 or p_position > 2
    or not exists (
      select 1 from private.runtime_flags as flag
      where flag.flag = 'public_thumbnails' and flag.enabled
    ) then
    return null;
  end if;

  select evidence.thumbnail_object_path into v_path
  from private.posts as post_row
  join public.published_previews as preview on preview.post_id = post_row.id and preview.content_type = 'story'
  join private.evidence_metadata as evidence on evidence.post_id = post_row.id
    and evidence.scan_state = 'clean'
    and evidence.visibility = 'public_thumbnail'
    and evidence.thumbnail_object_path is not null
  where post_row.id = p_post_id and post_row.status = 'published'
  order by evidence.created_at, evidence.id
  offset p_position
  limit 1;
  return v_path;
end;
$function$;
revoke all on function public.mmwr_public_thumbnail_path(uuid,integer) from public, anon, authenticated;
grant execute on function public.mmwr_public_thumbnail_path(uuid,integer) to service_role;

-- Account deletion must also stop at the final checkpoint if an uploader's
-- sanitized derivative remains, even when its evidence metadata was removed.
create or replace function public.begin_account_deletion_auth_attempt(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_state text;
  v_claimed_at timestamptz;
  v_auth_attempted_at timestamptz;
  v_has_evidence boolean;
  v_attempt_time timestamptz;
  v_profile_found boolean;
begin
  if (select auth.jwt() ->> 'role') is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from private.runtime_flags as flag
    where flag.flag = 'account_deletion' and flag.enabled
  ) or not exists (
    select 1 from private.runtime_flags as flag
    where flag.flag = 'account_deletion_cleanup' and flag.enabled
  ) then
    return false;
  end if;

  select profile.account_state, profile.deletion_claimed_at, profile.deletion_auth_attempted_at
  into v_account_state, v_claimed_at, v_auth_attempted_at
  from public.profiles as profile
  where profile.id = p_user_id
  for update;
  v_profile_found := found;
  v_attempt_time := pg_catalog.clock_timestamp();
  if not v_profile_found or v_account_state <> 'deletion_processing'
    or v_claimed_at is null or v_claimed_at <= v_attempt_time - interval '30 minutes'
    or v_auth_attempted_at is not null
    or exists (select 1 from private.user_roles as user_role where user_role.user_id = p_user_id)
    or not exists (select 1 from private.runtime_flags as flag where flag.flag = 'account_deletion' and flag.enabled)
    or not exists (select 1 from private.runtime_flags as flag where flag.flag = 'account_deletion_cleanup' and flag.enabled) then
    return false;
  end if;

  select exists (
    select 1 from storage.objects as object
    where object.bucket_id = 'mmwr-evidence-quarantine'
      and (object.owner_id = p_user_id::text or pg_catalog.left(object.name, pg_catalog.length(p_user_id::text) + 1) = p_user_id::text || '/')
    union all
    select 1 from storage.objects as object
    where object.bucket_id = 'mmwr-public-thumbnail-derivatives'
      and (object.owner_id = p_user_id::text or pg_catalog.left(object.name, pg_catalog.length(p_user_id::text) + 1) = p_user_id::text || '/')
    union all
    select 1 from private.evidence_metadata as evidence where evidence.uploaded_by = p_user_id
  ) into v_has_evidence;

  v_attempt_time := pg_catalog.clock_timestamp();
  if v_has_evidence then
    update public.profiles as profile
    set account_state = 'deletion_review_required', deletion_claimed_at = null,
        deletion_auth_attempted_at = null, deletion_review_reason = 'evidence_owned',
        updated_at = v_attempt_time
    where profile.id = p_user_id;
    insert into private.account_deletion_review_events (subject_user_id, reason)
    values (p_user_id, 'evidence_owned');
    return false;
  end if;

  update public.profiles as profile
  set deletion_auth_attempted_at = v_attempt_time, updated_at = v_attempt_time
  where profile.id = p_user_id
    and profile.account_state = 'deletion_processing'
    and profile.deletion_auth_attempted_at is null;
  return found;
end;
$function$;
revoke all on function public.begin_account_deletion_auth_attempt(uuid) from public, anon, authenticated;
grant execute on function public.begin_account_deletion_auth_attempt(uuid) to service_role;
