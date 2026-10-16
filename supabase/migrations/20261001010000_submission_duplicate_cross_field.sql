-- Treat primary and supplemental descriptions as one exact-match pool, while
-- retaining the approved open-submission-only, advisory-only behavior.

create or replace function private.open_submission_peers_by_description(
  p_normalized_description text,
  p_exclude_submission_id uuid
)
returns setof uuid
language sql stable security definer set search_path = ''
as $function$
  select submission.id
  from private.submissions as submission
  where submission.id <> p_exclude_submission_id
    and submission.status in ('received', 'reviewing', 'needs_more_information')
    and private.normalize_submission_description(submission.original_source) = p_normalized_description
    and p_normalized_description <> ''
  union
  select addendum.submission_id
  from private.submission_addenda as addendum
  join private.submissions as submission on submission.id = addendum.submission_id
  where addendum.submission_id <> p_exclude_submission_id
    and submission.status in ('received', 'reviewing', 'needs_more_information')
    and private.normalize_submission_description(addendum.additional_information) = p_normalized_description
    and p_normalized_description <> '';
$function$;
revoke all on function private.open_submission_peers_by_description(text, uuid)
  from public, anon, authenticated, service_role;

create or replace function private.refresh_submission_ordinary_risk_signals(p_submission_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  v_enabled boolean := false;
  v_is_open boolean := false;
  v_has_clean_image boolean := false;
  v_has_duplicate boolean := false;
  v_signal_code text;
  v_active boolean;
begin
  if p_submission_id is null then return; end if;

  perform pg_catalog.pg_advisory_xact_lock(70610002::bigint);

  select coalesce(runtime_flag.enabled, false) into v_enabled
  from private.runtime_flags as runtime_flag
  where runtime_flag.flag = 'submission_risk_scanning';
  v_enabled := coalesce(v_enabled, false);

  select submission.status in ('received', 'reviewing', 'needs_more_information')
    into v_is_open
  from private.submissions as submission
  where submission.id = p_submission_id;
  if not found then return; end if;

  if v_enabled and v_is_open then
    select exists (
      select 1 from private.evidence_metadata as evidence
      where evidence.submission_id = p_submission_id
        and evidence.scan_state = 'clean'
        and evidence.mime_type in ('image/jpeg', 'image/png', 'image/webp')
    ) into v_has_clean_image;

    select exists (
      select 1
      from (
        select private.normalize_submission_description(submission.original_source) as description
        from private.submissions as submission
        where submission.id = p_submission_id
        union
        select private.normalize_submission_description(addendum.additional_information)
        from private.submission_addenda as addendum
        where addendum.submission_id = p_submission_id
      ) as current_description
      where current_description.description <> ''
        and exists (
          select 1
          from private.open_submission_peers_by_description(
            current_description.description, p_submission_id
          ) as peer(submission_id)
        )
    ) into v_has_duplicate;
  end if;

  foreach v_signal_code in array array['duplicate_open_description', 'missing_clean_image'] loop
    v_active := v_enabled and v_is_open and case v_signal_code
      when 'duplicate_open_description' then v_has_duplicate
      when 'missing_clean_image' then not v_has_clean_image
      else false
    end;

    if v_active then
      insert into private.submission_risk_signals (submission_id, signal_code, active)
      values (p_submission_id, v_signal_code, true)
      on conflict (submission_id, signal_code) do update
        set active = true, updated_at = pg_catalog.clock_timestamp();
    else
      update private.submission_risk_signals
        set active = false, updated_at = pg_catalog.clock_timestamp()
      where submission_id = p_submission_id and signal_code = v_signal_code and active;
    end if;
  end loop;
end;
$function$;
revoke all on function private.refresh_submission_ordinary_risk_signals(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.on_submission_ordinary_risk_input_change()
returns trigger
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  v_submission_id uuid;
  v_other_id uuid;
  v_normalized text;
  v_old_normalized text;
  v_new_lock bigint;
  v_old_lock bigint;
  v_scanning_enabled boolean := false;
begin
  if tg_table_name = 'runtime_flags' then
    if new.flag = 'submission_risk_scanning' then
      -- Wait for in-flight writes, and keep new writes out, while the flag
      -- transition refreshes the open set. Take table locks before the shared
      -- advisory lock to match writers' table-then-advisory lock order.
      lock table private.submissions, private.submission_addenda, private.evidence_metadata
        in share row exclusive mode;
      perform pg_catalog.pg_advisory_xact_lock(70610002::bigint);
      for v_submission_id in
        select submission.id from private.submissions as submission
        where submission.status in ('received', 'reviewing', 'needs_more_information')
      loop
        perform private.refresh_submission_ordinary_risk_signals(v_submission_id);
      end loop;
    end if;
    return null;
  end if;

  select coalesce(runtime_flag.enabled, false) into v_scanning_enabled
  from private.runtime_flags as runtime_flag
  where runtime_flag.flag = 'submission_risk_scanning';
  if not coalesce(v_scanning_enabled, false) then return null; end if;

  if tg_table_name = 'submissions' then
    v_submission_id := new.id;
    v_normalized := private.normalize_submission_description(new.original_source);
    v_old_normalized := case when tg_op = 'UPDATE'
      then private.normalize_submission_description(old.original_source) else '' end;

    v_new_lock := pg_catalog.hashtextextended(v_normalized, 0);
    v_old_lock := pg_catalog.hashtextextended(v_old_normalized, 0);
    if tg_op = 'UPDATE' and v_old_normalized <> '' and v_old_normalized <> v_normalized then
      if v_old_lock < v_new_lock then
        perform pg_catalog.pg_advisory_xact_lock(v_old_lock);
        perform pg_catalog.pg_advisory_xact_lock(v_new_lock);
      else
        perform pg_catalog.pg_advisory_xact_lock(v_new_lock);
        perform pg_catalog.pg_advisory_xact_lock(v_old_lock);
      end if;
    elsif v_normalized <> '' then
      perform pg_catalog.pg_advisory_xact_lock(v_new_lock);
    end if;

    if v_normalized <> '' then
      for v_other_id in
        select peer.submission_id
        from private.open_submission_peers_by_description(v_normalized, v_submission_id)
          as peer(submission_id)
      loop
        perform private.refresh_submission_ordinary_risk_signals(v_other_id);
      end loop;
    end if;

    if v_old_normalized <> '' and v_old_normalized is distinct from v_normalized then
      for v_other_id in
        select peer.submission_id
        from private.open_submission_peers_by_description(v_old_normalized, v_submission_id)
          as peer(submission_id)
      loop
        perform private.refresh_submission_ordinary_risk_signals(v_other_id);
      end loop;
    end if;

    perform private.refresh_submission_ordinary_risk_signals(v_submission_id);
    return null;
  end if;

  if tg_table_name = 'evidence_metadata' then
    if tg_op = 'DELETE' then
      v_submission_id := old.submission_id;
    else
      v_submission_id := new.submission_id;
    end if;
    if v_submission_id is not null then
      perform private.refresh_submission_ordinary_risk_signals(v_submission_id);
    end if;
    if tg_op = 'UPDATE' and old.submission_id is distinct from new.submission_id
      and old.submission_id is not null then
      perform private.refresh_submission_ordinary_risk_signals(old.submission_id);
    end if;
    return null;
  end if;

  v_submission_id := new.submission_id;
  v_normalized := private.normalize_submission_description(new.additional_information);
  if v_normalized = '' then
    perform private.refresh_submission_ordinary_risk_signals(v_submission_id);
    return null;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_normalized, 0));
  for v_other_id in
    select peer.submission_id
    from private.open_submission_peers_by_description(v_normalized, v_submission_id)
      as peer(submission_id)
  loop
    perform private.refresh_submission_ordinary_risk_signals(v_other_id);
  end loop;
  perform private.refresh_submission_ordinary_risk_signals(v_submission_id);
  return null;
end;
$function$;
revoke all on function private.on_submission_ordinary_risk_input_change()
  from public, anon, authenticated, service_role;

create or replace function private.refresh_submission_duplicate_peers_after_status_change()
returns trigger
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  v_peer_submission_id uuid;
  v_scanning_enabled boolean := false;
begin
  -- This refresh takes the shared transaction lock before it reads the flag.
  -- Read the flag only after that lock is held, so a concurrent disable either
  -- follows this transaction and clears its results or precedes it and
  -- prevents the peer-description scan below.
  perform private.refresh_submission_ordinary_risk_signals(new.id);

  select coalesce(runtime_flag.enabled, false) into v_scanning_enabled
  from private.runtime_flags as runtime_flag
  where runtime_flag.flag = 'submission_risk_scanning';
  if not coalesce(v_scanning_enabled, false) then return null; end if;

  -- Changing between open statuses does not change which submissions qualify
  -- as peers. Source edits have their own trigger, so only cross the open-set
  -- boundary when refreshing other submissions is necessary.
  if (old.status in ('received', 'reviewing', 'needs_more_information'))
    is not distinct from
     (new.status in ('received', 'reviewing', 'needs_more_information')) then
    return null;
  end if;

  for v_peer_submission_id in
    select distinct peer.submission_id
    from (
      select private.normalize_submission_description(submission.original_source) as description
      from private.submissions as submission
      where submission.id = new.id
      union
      select private.normalize_submission_description(addendum.additional_information)
      from private.submission_addenda as addendum
      where addendum.submission_id = new.id
    ) as current_description
    cross join lateral private.open_submission_peers_by_description(
      current_description.description, new.id
    ) as peer(submission_id)
    where current_description.description <> ''
  loop
    perform private.refresh_submission_ordinary_risk_signals(v_peer_submission_id);
  end loop;

  return null;
end;
$function$;
revoke all on function private.refresh_submission_duplicate_peers_after_status_change()
  from public, anon, authenticated, service_role;

-- If a non-default environment already enabled advisory scanning, recalculate
-- the open set once so newly supported cross-field matches are reflected.
do $block$
declare
  v_scanning_enabled boolean := false;
  v_submission_id uuid;
begin
  select coalesce(runtime_flag.enabled, false) into v_scanning_enabled
  from private.runtime_flags as runtime_flag
  where runtime_flag.flag = 'submission_risk_scanning';

  if coalesce(v_scanning_enabled, false) then
    for v_submission_id in
      select submission.id
      from private.submissions as submission
      where submission.status in ('received', 'reviewing', 'needs_more_information')
    loop
      perform private.refresh_submission_ordinary_risk_signals(v_submission_id);
    end loop;
  end if;
end;
$block$;
