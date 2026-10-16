-- Extend advisory-only duplicate matching to the submission's primary
-- description (original_source) as well as appended descriptions. Matching
-- text is compared in place and is never copied or fingerprinted persistently.

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

  -- Serialize signal refreshes so concurrent status changes on duplicate
  -- submissions cannot update the same signal rows in opposite order.
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
      from private.submissions as current_submission
      join private.submissions as other_submission
        on other_submission.id <> current_submission.id
       and private.normalize_submission_description(other_submission.original_source)
         = private.normalize_submission_description(current_submission.original_source)
       and other_submission.status in ('received', 'reviewing', 'needs_more_information')
      where current_submission.id = p_submission_id
        and private.normalize_submission_description(current_submission.original_source) <> ''
    ) or exists (
      select 1
      from private.submission_addenda as current_addendum
      join private.submission_addenda as other_addendum
        on private.normalize_submission_description(current_addendum.additional_information)
         = private.normalize_submission_description(other_addendum.additional_information)
       and other_addendum.submission_id <> current_addendum.submission_id
      join private.submissions as other_submission
        on other_submission.id = other_addendum.submission_id
      where current_addendum.submission_id = p_submission_id
        and private.normalize_submission_description(current_addendum.additional_information) <> ''
        and other_submission.status in ('received', 'reviewing', 'needs_more_information')
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
revoke all on function private.refresh_submission_ordinary_risk_signals(uuid) from public, anon, authenticated, service_role;

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
    -- transaction evaluates the peer, while the global signal lock protects
    -- multi-row refresh order. Advisory lock values are transient only.
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

    if tg_op = 'UPDATE' then
      if old.status in ('received', 'reviewing', 'needs_more_information')
        and new.status not in ('received', 'reviewing', 'needs_more_information') then
        for v_other_id in
          select distinct signal.submission_id
          from private.submission_risk_signals as signal
          where signal.active and signal.signal_code = 'duplicate_open_description'
            and signal.submission_id <> v_submission_id
        loop
          perform private.refresh_submission_ordinary_risk_signals(v_other_id);
        end loop;
      end if;
    end if;
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
revoke all on function private.on_submission_ordinary_risk_input_change() from public, anon, authenticated, service_role;

create trigger submission_ordinary_risk_source_update_refresh
  after update of original_source on private.submissions
  for each row execute function private.on_submission_ordinary_risk_input_change();

-- Existing insert/status and addendum/evidence triggers already invoke the
-- replaced trigger function. No submission creation grant or feature flag is
-- changed by this migration.
