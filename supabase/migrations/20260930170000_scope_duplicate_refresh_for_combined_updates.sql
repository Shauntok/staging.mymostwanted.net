-- The primary-description trigger also fires when a single UPDATE changes
-- both original_source and status. Status-peer refreshes belong exclusively
-- to refresh_submission_duplicate_peers_after_status_change(); do not refresh
-- every active duplicate signal from this input-change trigger.

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
begin
  if tg_table_name = 'runtime_flags' then
    if new.flag = 'submission_risk_scanning' then
      for v_submission_id in
        select submission.id from private.submissions as submission
        where submission.status in ('received', 'reviewing', 'needs_more_information')
      loop
        perform private.refresh_submission_ordinary_risk_signals(v_submission_id);
      end loop;
    end if;
    return null;
  end if;

  if tg_table_name = 'submissions' then
    v_submission_id := new.id;
    v_normalized := private.normalize_submission_description(new.original_source);
    v_old_normalized := case when tg_op = 'UPDATE'
      then private.normalize_submission_description(old.original_source) else '' end;

    -- Description-key locks serialize identical inserts/edits before either
    -- transaction evaluates peers. The shared signal lock serializes writes
    -- to the fixed per-submission signal rows; neither lock is persisted.
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
        select other_submission.id
        from private.submissions as other_submission
        where other_submission.id <> v_submission_id
          and other_submission.status in ('received', 'reviewing', 'needs_more_information')
          and private.normalize_submission_description(other_submission.original_source) = v_normalized
      loop
        perform private.refresh_submission_ordinary_risk_signals(v_other_id);
      end loop;
    end if;

    if v_old_normalized <> '' and v_old_normalized is distinct from v_normalized then
      for v_other_id in
        select other_submission.id
        from private.submissions as other_submission
        where other_submission.id <> v_submission_id
          and other_submission.status in ('received', 'reviewing', 'needs_more_information')
          and private.normalize_submission_description(other_submission.original_source) = v_old_normalized
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
  if v_normalized = '' then return null; end if;

  -- Serialize identical supplemental descriptions without retaining a text fingerprint.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_normalized, 0));

  for v_other_id in
    select distinct other_addendum.submission_id
    from private.submission_addenda as other_addendum
    join private.submissions as other_submission
      on other_submission.id = other_addendum.submission_id
    where other_addendum.submission_id <> v_submission_id
      and other_submission.status in ('received', 'reviewing', 'needs_more_information')
      and private.normalize_submission_description(other_addendum.additional_information) = v_normalized
  loop
    perform private.refresh_submission_ordinary_risk_signals(v_other_id);
  end loop;
  perform private.refresh_submission_ordinary_risk_signals(v_submission_id);
  return null;
end;
$function$;
revoke all on function private.on_submission_ordinary_risk_input_change()
  from public, anon, authenticated, service_role;
