-- Safe, separately gated account-deletion cleanup.
-- Accounts with any Storage object or evidence metadata remain available only
-- for Owner review. This migration does not enable either runtime flag.

alter table private.runtime_flags
  drop constraint runtime_flags_name_valid;
alter table private.runtime_flags
  add constraint runtime_flags_name_valid
  check (flag in (
    'account_deletion', 'submission_risk_scanning', 'critical_security_email',
    'staff_evidence_preview', 'owner_evidence_visibility', 'submission_publication',
    'account_deletion_cleanup'
  ));

insert into private.runtime_flags (flag, enabled)
values ('account_deletion_cleanup', false)
on conflict (flag) do nothing;

-- Serialize an evidence upload against the deletion worker's profile claim.
-- A pending/processing account cannot start another upload; an upload already
-- holding the shared row lock completes before the worker checks Storage.
create or replace function private.can_upload_evidence_object(p_name text, p_metadata jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_account_state text;
  v_folders text[];
  v_submission_id uuid;
  v_object_count bigint;
begin
  if v_user_id is null or p_name is null then
    return false;
  end if;

  select profile.account_state into v_account_state
  from public.profiles as profile
  where profile.id = v_user_id
  for share;
  if not found or v_account_state <> 'active' then
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

revoke all on function private.can_upload_evidence_object(text, jsonb)
  from public, anon, service_role;
grant execute on function private.can_upload_evidence_object(text, jsonb)
  to authenticated;

alter table public.profiles
  drop constraint profiles_account_state_valid;
alter table public.profiles
  add constraint profiles_account_state_valid check (
    account_state in (
      'active', 'suspended', 'banned', 'deletion_pending',
      'deletion_processing', 'deletion_review_required'
    )
  );

alter table public.profiles
  add column deletion_claimed_at timestamptz,
  add column deletion_review_reason text,
  add constraint profiles_deletion_review_reason_valid check (
    deletion_review_reason is null
    or deletion_review_reason in ('evidence_owned', 'auth_cleanup_failed')
  ),
  add constraint profiles_deletion_claim_state_valid check (
    (account_state = 'deletion_processing') = (deletion_claimed_at is not null)
  ),
  add constraint profiles_deletion_review_state_valid check (
    (account_state = 'deletion_review_required') = (deletion_review_reason is not null)
  );

create table private.account_deletion_review_events (
  id bigint generated always as identity primary key,
  subject_user_id uuid references auth.users (id) on delete set null,
  reason text not null,
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint account_deletion_review_reason_valid check (
    reason in ('evidence_owned', 'auth_cleanup_failed')
  )
);
create index account_deletion_review_events_user_time_idx
  on private.account_deletion_review_events (subject_user_id, occurred_at desc);
alter table private.account_deletion_review_events enable row level security;
revoke all on table private.account_deletion_review_events
  from public, anon, authenticated, service_role;

create function public.claim_expired_account_deletions(p_batch_size integer default 20)
returns table (user_id uuid)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_candidate record;
  v_has_evidence boolean;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if (select auth.jwt() ->> 'role') is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from private.runtime_flags as flag
    where flag.flag = 'account_deletion'
      and flag.enabled
  ) or not exists (
    select 1 from private.runtime_flags as flag
    where flag.flag = 'account_deletion_cleanup'
      and flag.enabled
  ) then
    return;
  end if;

  for v_candidate in
    select profile.id
    from public.profiles as profile
    where (
      (profile.account_state = 'deletion_pending'
        and profile.deletion_requested_at <= v_now - interval '7 days')
      or (profile.account_state = 'deletion_processing'
        and profile.deletion_claimed_at <= v_now - interval '30 minutes')
    )
      and not exists (
        select 1 from private.user_roles as user_role
        where user_role.user_id = profile.id
      )
    order by profile.deletion_requested_at, profile.id
    for update of profile skip locked
    limit greatest(1, least(coalesce(p_batch_size, 20), 25))
  loop
    -- Include orphaned metadata as well as every object under the uploader's
    -- UUID prefix. Never enumerate or delete file names in the worker.
    select exists (
      select 1
      from storage.objects as object
      where object.bucket_id = 'mmwr-evidence-quarantine'
        and (
          object.owner_id = v_candidate.id::text
          or pg_catalog.left(object.name, pg_catalog.length(v_candidate.id::text) + 1)
            = v_candidate.id::text || '/'
        )
      union all
      select 1
      from private.evidence_metadata as evidence
      where evidence.uploaded_by = v_candidate.id
    ) into v_has_evidence;

    if v_has_evidence then
      update public.profiles as profile
      set account_state = 'deletion_review_required',
          deletion_claimed_at = null,
          deletion_review_reason = 'evidence_owned',
          updated_at = v_now
      where profile.id = v_candidate.id;

      insert into private.account_deletion_review_events (subject_user_id, reason)
      values (v_candidate.id, 'evidence_owned');
    else
      update public.profiles as profile
      set account_state = 'deletion_processing',
          deletion_claimed_at = v_now,
          deletion_review_reason = null,
          updated_at = v_now
      where profile.id = v_candidate.id;

      user_id := v_candidate.id;
      return next;
    end if;
  end loop;
end;
$function$;

revoke all on function public.claim_expired_account_deletions(integer)
  from public, anon, authenticated;
grant execute on function public.claim_expired_account_deletions(integer)
  to service_role;

create function public.mark_account_deletion_review_required(
  p_user_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_reason text;
begin
  if (select auth.jwt() ->> 'role') is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if p_reason is null or p_reason not in ('evidence_owned', 'auth_cleanup_failed') then
    return false;
  end if;
  v_reason := p_reason;

  update public.profiles as profile
  set account_state = 'deletion_review_required',
      deletion_claimed_at = null,
      deletion_review_reason = v_reason,
      updated_at = pg_catalog.clock_timestamp()
  where profile.id = p_user_id
    and profile.account_state = 'deletion_processing';

  if not found then
    return false;
  end if;

  insert into private.account_deletion_review_events (subject_user_id, reason)
  values (p_user_id, v_reason);
  return true;
end;
$function$;

revoke all on function public.mark_account_deletion_review_required(uuid, text)
  from public, anon, authenticated;
grant execute on function public.mark_account_deletion_review_required(uuid, text)
  to service_role;

create function private.owner_list_account_deletion_reviews()
returns table (
  username text,
  requested_at timestamptz,
  review_reason text
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
    or not private.has_staff_role('owner')
    or not private.has_recent_totp() then
    return;
  end if;

  return query
  select profile.username, profile.deletion_requested_at, profile.deletion_review_reason
  from public.profiles as profile
  where profile.account_state = 'deletion_review_required'
  order by profile.deletion_requested_at, profile.id
  limit 100;
end;
$function$;

revoke all on function private.owner_list_account_deletion_reviews()
  from public, anon, authenticated, service_role;
grant execute on function private.owner_list_account_deletion_reviews()
  to authenticated;

create function public.owner_list_account_deletion_reviews()
returns table (
  username text,
  requested_at timestamptz,
  review_reason text
)
language sql
security invoker
set search_path = ''
as $function$
  select * from private.owner_list_account_deletion_reviews();
$function$;

revoke all on function public.owner_list_account_deletion_reviews()
  from public, anon, service_role;
grant execute on function public.owner_list_account_deletion_reviews()
  to authenticated;
