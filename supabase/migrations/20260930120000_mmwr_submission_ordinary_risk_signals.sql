-- Advisory-only risk signals for duplicate open-submission descriptions and
-- missing clean images. The existing submission_risk_scanning flag gates all
-- signals and remains disabled by default.

create table private.submission_risk_signals (
  submission_id uuid not null references private.submissions (id) on delete cascade,
  signal_code text not null,
  active boolean not null default true,
  first_detected_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (submission_id, signal_code),
  constraint submission_risk_signal_code_valid
    check (signal_code in ('duplicate_open_description', 'missing_clean_image'))
);
alter table private.submission_risk_signals enable row level security;
revoke all on table private.submission_risk_signals from public, anon, authenticated, service_role;
create index submission_risk_signals_active_idx
  on private.submission_risk_signals (submission_id, signal_code) where active;

create function private.normalize_submission_description(p_text text)
returns text
language sql immutable
set search_path = ''
as $function$
  select pg_catalog.lower(pg_catalog.btrim(
    pg_catalog.regexp_replace(coalesce(p_text, ''), '[[:space:]]+', ' ', 'g')
  ));
$function$;
revoke all on function private.normalize_submission_description(text) from public, anon, authenticated, service_role;

create function private.refresh_submission_ordinary_risk_signals(p_submission_id uuid)
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

create function private.on_submission_ordinary_risk_input_change()
returns trigger
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  v_submission_id uuid;
  v_other_id uuid;
  v_normalized text;
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

  -- Serialize identical descriptions without retaining a text fingerprint.
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

create trigger submission_ordinary_risk_insert_refresh
  after insert on private.submissions
  for each row execute function private.on_submission_ordinary_risk_input_change();
create trigger submission_ordinary_risk_status_refresh
  after update of status on private.submissions
  for each row execute function private.on_submission_ordinary_risk_input_change();
create trigger submission_ordinary_risk_evidence_refresh
  after insert or delete on private.evidence_metadata
  for each row execute function private.on_submission_ordinary_risk_input_change();
create trigger submission_ordinary_risk_evidence_update_refresh
  after update of scan_state, mime_type, submission_id on private.evidence_metadata
  for each row execute function private.on_submission_ordinary_risk_input_change();
create trigger submission_ordinary_risk_addendum_refresh
  after insert on private.submission_addenda
  for each row execute function private.on_submission_ordinary_risk_input_change();
create trigger submission_ordinary_risk_setting_refresh
  after update of enabled on private.runtime_flags
  for each row when (new.flag = 'submission_risk_scanning' and old.enabled is distinct from new.enabled)
  execute function private.on_submission_ordinary_risk_input_change();

drop function public.list_staff_submissions(integer);
create function public.list_staff_submissions(p_limit integer default 50)
returns table (
  id uuid,
  submitted_title text,
  status text,
  risk_level text,
  created_at timestamptz,
  risk_signals text[]
)
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null
    or not (private.has_staff_role('admin') or private.has_staff_role('owner'))
    or not private.has_recent_totp() then
    raise exception 'staff submission access denied' using errcode = '42501';
  end if;

  return query
  with picked as materialized (
    select submission.id, submission.created_at
    from private.submissions as submission
    where submission.status in ('received', 'reviewing', 'needs_more_information')
      and (private.has_staff_role('owner') or submission.risk_level <> 'high')
    order by submission.created_at desc, submission.id desc
    limit greatest(1, least(coalesce(p_limit, 50), 50))
  ), logged as (
    insert into private.submission_staff_audit (submission_id, actor_user_id, action)
    select picked.id, v_user_id, 'queue_opened' from picked returning submission_id
  )
  select submission.id, submission.submitted_title, submission.status,
    submission.risk_level, submission.created_at,
    coalesce((select pg_catalog.array_agg(signal.signal_code order by signal.signal_code)
      from private.submission_risk_signals as signal
      where signal.submission_id = submission.id and signal.active), array[]::text[])
  from private.submissions as submission
  join logged on logged.submission_id = submission.id
  order by submission.created_at desc, submission.id desc;
end
$function$;
revoke all on function public.list_staff_submissions(integer) from public, anon, authenticated, service_role;
grant execute on function public.list_staff_submissions(integer) to authenticated;

drop function public.get_staff_submission(uuid);
create function public.get_staff_submission(p_submission_id uuid)
returns table (
  id uuid,
  submitted_title text,
  original_source text,
  status text,
  risk_level text,
  internal_reviewer_notes text,
  safe_reviewer_response text,
  created_at timestamptz,
  risk_signals text[]
)
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null
    or p_submission_id is null
    or not (private.has_staff_role('admin') or private.has_staff_role('owner'))
    or not private.has_recent_totp() then
    raise exception 'staff submission access denied' using errcode = '42501';
  end if;

  if not exists (
    select 1 from private.submissions as submission
    where submission.id = p_submission_id
      and submission.status in ('received', 'reviewing', 'needs_more_information')
      and (submission.risk_level <> 'high' or private.has_staff_role('owner'))
  ) then return; end if;

  insert into private.submission_staff_audit (submission_id, actor_user_id, action)
  values (p_submission_id, v_user_id, 'submission_opened');

  return query
  select submission.id, submission.submitted_title, submission.original_source,
    submission.status, submission.risk_level, submission.internal_reviewer_notes,
    submission.safe_reviewer_response, submission.created_at,
    coalesce((select pg_catalog.array_agg(signal.signal_code order by signal.signal_code)
      from private.submission_risk_signals as signal
      where signal.submission_id = submission.id and signal.active), array[]::text[])
  from private.submissions as submission
  where submission.id = p_submission_id
    and submission.status in ('received', 'reviewing', 'needs_more_information')
    and (submission.risk_level <> 'high' or private.has_staff_role('owner'));
end
$function$;
revoke all on function public.get_staff_submission(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_staff_submission(uuid) to authenticated;

-- Keep the approved prototype state: the default remains OFF. If an operator
-- had already enabled scanning before this migration, initialize signals for
-- open submissions only; no closed or resolved records are scanned.
do $block$
declare
  v_enabled boolean := false;
  v_submission_id uuid;
begin
  select coalesce(runtime_flag.enabled, false) into v_enabled
  from private.runtime_flags as runtime_flag
  where runtime_flag.flag = 'submission_risk_scanning';

  if coalesce(v_enabled, false) then
    for v_submission_id in
      select submission.id from private.submissions as submission
      where submission.status in ('received', 'reviewing', 'needs_more_information')
    loop
      perform private.refresh_submission_ordinary_risk_signals(v_submission_id);
    end loop;
  end if;
end;
$block$;
