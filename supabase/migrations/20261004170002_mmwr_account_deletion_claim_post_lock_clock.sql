-- Re-sample expiration and lease timestamps after each candidate row lock.
-- A claim must receive a full 30-minute lease even if row locking waits.
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
    -- The cursor now owns this profile row lock. Refresh eligibility after any
    -- wait, and again below before recording a new lease or review transition.
    select profile.account_state,
           profile.deletion_requested_at,
           profile.deletion_claimed_at
    into v_account_state, v_requested_at, v_previous_claimed_at
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

    -- Storage inspection may take time. Use a fresh wall clock for every
    -- profile write so the lease and update timestamp begin at the decision.
    v_claim_time := pg_catalog.clock_timestamp();
    if v_has_evidence then
      update public.profiles as profile
      set account_state = 'deletion_review_required',
          deletion_claimed_at = null,
          deletion_review_reason = 'evidence_owned',
          updated_at = v_claim_time
      where profile.id = v_candidate.id;

      insert into private.account_deletion_review_events (subject_user_id, reason)
      values (v_candidate.id, 'evidence_owned');
    else
      update public.profiles as profile
      set account_state = 'deletion_processing',
          deletion_claimed_at = v_claim_time,
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
