-- Make the external Auth deletion at-most-once after an explicit DB checkpoint.
-- An expired claim with a persisted attempt marker goes to Owner review rather
-- than issuing a second Auth deletion request after an interrupted/ambiguous run.
alter table public.profiles
  add column deletion_auth_attempted_at timestamptz,
  drop constraint profiles_deletion_review_reason_valid,
  add constraint profiles_deletion_review_reason_valid check (
    deletion_review_reason is null
    or deletion_review_reason in (
      'evidence_owned', 'auth_cleanup_failed', 'auth_cleanup_uncertain'
    )
  ),
  add constraint profiles_deletion_auth_attempt_state_valid check (
    deletion_auth_attempted_at is null
    or account_state = 'deletion_processing'
  );

alter table private.account_deletion_review_events
  drop constraint account_deletion_review_reason_valid,
  add constraint account_deletion_review_reason_valid check (
    reason in ('evidence_owned', 'auth_cleanup_failed', 'auth_cleanup_uncertain')
  );

create or replace function public.claim_expired_account_deletions(p_batch_size integer default 20)
returns table (user_id uuid)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_candidate record;
  v_account_state text;
  v_requested_at timestamptz;
  v_previous_claimed_at timestamptz;
  v_auth_attempted_at timestamptz;
  v_has_evidence boolean;
  v_claim_time timestamptz;
  v_profile_found boolean;
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
        and profile.deletion_requested_at <= pg_catalog.clock_timestamp() - interval '7 days')
      or (profile.account_state = 'deletion_processing'
        and profile.deletion_claimed_at <= pg_catalog.clock_timestamp() - interval '30 minutes')
    )
      and not exists (
        select 1 from private.user_roles as user_role
        where user_role.user_id = profile.id
      )
    order by profile.deletion_requested_at, profile.id
    for update of profile skip locked
    limit greatest(1, least(coalesce(p_batch_size, 20), 25))
  loop
    select profile.account_state,
           profile.deletion_requested_at,
           profile.deletion_claimed_at,
           profile.deletion_auth_attempted_at
    into v_account_state, v_requested_at, v_previous_claimed_at, v_auth_attempted_at
    from public.profiles as profile
    where profile.id = v_candidate.id;

    v_profile_found := found;
    v_claim_time := pg_catalog.clock_timestamp();
    if not v_profile_found then
      continue;
    end if;
    if v_account_state = 'deletion_pending' then
      if v_requested_at is null
        or v_requested_at > v_claim_time - interval '7 days' then
        continue;
      end if;
    elsif v_account_state = 'deletion_processing' then
      if v_previous_claimed_at is null
        or v_previous_claimed_at > v_claim_time - interval '30 minutes' then
        continue;
      end if;
    else
      continue;
    end if;

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

    v_claim_time := pg_catalog.clock_timestamp();
    if v_has_evidence or (
      v_account_state = 'deletion_processing'
      and v_auth_attempted_at is not null
    ) then
      update public.profiles as profile
      set account_state = 'deletion_review_required',
          deletion_claimed_at = null,
          deletion_auth_attempted_at = null,
          deletion_review_reason = case
            when v_has_evidence then 'evidence_owned'
            else 'auth_cleanup_uncertain'
          end,
          updated_at = v_claim_time
      where profile.id = v_candidate.id;

      insert into private.account_deletion_review_events (subject_user_id, reason)
      values (
        v_candidate.id,
        case when v_has_evidence then 'evidence_owned' else 'auth_cleanup_uncertain' end
      );
    else
      update public.profiles as profile
      set account_state = 'deletion_processing',
          deletion_claimed_at = v_claim_time,
          deletion_auth_attempted_at = null,
          deletion_review_reason = null,
          updated_at = v_claim_time
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

create function public.begin_account_deletion_auth_attempt(p_user_id uuid)
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
    where flag.flag = 'account_deletion'
      and flag.enabled
  ) or not exists (
    select 1 from private.runtime_flags as flag
    where flag.flag = 'account_deletion_cleanup'
      and flag.enabled
  ) then
    return false;
  end if;

  select profile.account_state,
         profile.deletion_claimed_at,
         profile.deletion_auth_attempted_at
  into v_account_state, v_claimed_at, v_auth_attempted_at
  from public.profiles as profile
  where profile.id = p_user_id
  for update;

  v_profile_found := found;
  v_attempt_time := pg_catalog.clock_timestamp();
  if not v_profile_found
    or v_account_state <> 'deletion_processing'
    or v_claimed_at is null
    or v_claimed_at <= v_attempt_time - interval '30 minutes'
    or v_auth_attempted_at is not null then
    return false;
  end if;

  select exists (
    select 1
    from storage.objects as object
    where object.bucket_id = 'mmwr-evidence-quarantine'
      and (
        object.owner_id = p_user_id::text
        or pg_catalog.left(object.name, pg_catalog.length(p_user_id::text) + 1)
          = p_user_id::text || '/'
      )
    union all
    select 1
    from private.evidence_metadata as evidence
    where evidence.uploaded_by = p_user_id
  ) into v_has_evidence;

  v_attempt_time := pg_catalog.clock_timestamp();
  if v_has_evidence then
    update public.profiles as profile
    set account_state = 'deletion_review_required',
        deletion_claimed_at = null,
        deletion_auth_attempted_at = null,
        deletion_review_reason = 'evidence_owned',
        updated_at = v_attempt_time
    where profile.id = p_user_id;

    insert into private.account_deletion_review_events (subject_user_id, reason)
    values (p_user_id, 'evidence_owned');
    return false;
  end if;

  update public.profiles as profile
  set deletion_auth_attempted_at = v_attempt_time,
      updated_at = v_attempt_time
  where profile.id = p_user_id
    and profile.account_state = 'deletion_processing'
    and profile.deletion_auth_attempted_at is null;

  return found;
end;
$function$;

revoke all on function public.begin_account_deletion_auth_attempt(uuid)
  from public, anon, authenticated;
grant execute on function public.begin_account_deletion_auth_attempt(uuid)
  to service_role;

create or replace function public.mark_account_deletion_review_required(
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
      deletion_auth_attempted_at = null,
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
