-- Keep row locks and FOUND checks while avoiding unused PL/pgSQL target variables.
-- Each selected identity is constrained by the same primary-key filter.
CREATE OR REPLACE FUNCTION private.remove_own_reaction(p_post_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_account_state text;
  v_removed integer;
begin
  if v_user_id is null then
    return false;
  end if;

  perform auth_user.id
  from auth.users as auth_user
  where auth_user.id = v_user_id
  for key share;
  if not found then
    return false;
  end if;

  perform post_row.id
  from private.posts as post_row
  where post_row.id = p_post_id
  for update;
  if not found then
    return false;
  end if;

  select profile.account_state into v_account_state
  from public.profiles as profile where profile.id = v_user_id;
  if v_account_state is distinct from 'active' then
    return false;
  end if;

  delete from private.reactions as reaction
  where reaction.user_id = v_user_id and reaction.post_id = p_post_id;
  get diagnostics v_removed = row_count;
  if v_removed = 0 then
    return false;
  end if;

  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION private.set_own_reaction(p_post_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_account_state text;
  v_post_status text;
  v_area_active boolean;
begin
  if v_user_id is null then
    return false;
  end if;

  -- All user-driven reaction paths lock Auth first, then post, then reaction rows.
  perform auth_user.id
  from auth.users as auth_user
  where auth_user.id = v_user_id
  for key share;
  if not found then
    return false;
  end if;

  -- Match the owner moderation lock so hide/restore cannot race reaction writes.
  select post_row.status, area.is_active
    into v_post_status, v_area_active
  from private.posts as post_row
  left join private.areas as area on area.id = post_row.area_id
  where post_row.id = p_post_id
  for update of post_row;

  if not found or v_post_status <> 'published' or v_area_active is distinct from true
    or not exists (
      select 1 from public.published_previews as preview where preview.post_id = p_post_id
    ) then
    return false;
  end if;

  select profile.account_state into v_account_state
  from public.profiles as profile where profile.id = v_user_id;
  if v_account_state is distinct from 'active' then
    return false;
  end if;

  insert into private.reactions (user_id, post_id)
  values (v_user_id, p_post_id)
  on conflict (user_id, post_id) do nothing;

  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION private.staff_apply_account_sanction(p_target_user_id uuid, p_action text, p_expires_at timestamp with time zone, p_reason text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_event_id bigint;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_is_owner boolean;
begin
  v_is_owner := private.has_staff_role('owner');
  if v_actor is null
    or (not v_is_owner and not private.has_staff_role('admin'))
    or not private.has_recent_totp()
    or p_target_user_id is null
    or p_target_user_id = v_actor
    or p_action is null
    or p_action not in ('warning', 'submission_suspension', 'account_suspension', 'permanent_ban')
    or p_reason is null
    or pg_catalog.char_length(pg_catalog.btrim(p_reason)) not between 1 and 500
    or (p_action = 'permanent_ban' and not v_is_owner)
    or (p_action in ('submission_suspension', 'account_suspension') and (p_expires_at is null or p_expires_at <= v_now))
    or (p_action in ('warning', 'permanent_ban') and p_expires_at is not null) then
    return null;
  end if;

  perform profile.id
  from public.profiles as profile
  where profile.id = p_target_user_id
    and profile.account_state = 'active'
  for update;
  if not found
    or exists (
      select 1 from private.user_roles as user_role
      where user_role.user_id = p_target_user_id
        and (user_role.role = 'owner' or (user_role.role = 'admin' and not private.has_staff_role('owner')))
    )
    or not private.has_recent_totp()
    or (not private.has_staff_role('owner') and not private.has_staff_role('admin')) then
    return null;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_target_user_id::text, 0));

  -- Re-evaluate authority and requested expiry after all potentially blocking locks.
  v_now := pg_catalog.clock_timestamp();
  v_is_owner := private.has_staff_role('owner');
  if (not v_is_owner and not private.has_staff_role('admin'))
    or not private.has_recent_totp()
    or (p_action = 'permanent_ban' and not v_is_owner)
    or (p_action in ('submission_suspension', 'account_suspension') and p_expires_at <= v_now)
    or exists (
      select 1 from private.user_roles as user_role
      where user_role.user_id = p_target_user_id
        and (user_role.role = 'owner' or (user_role.role = 'admin' and not v_is_owner))
    ) then
    return null;
  end if;

  if p_action in ('submission_suspension', 'account_suspension', 'permanent_ban')
    and private.account_has_active_sanction(p_target_user_id, p_action) then
    return null;
  end if;

  if p_action = 'permanent_ban' then
    if not private.has_staff_role('owner') or not private.has_recent_totp() then return null; end if;
    update public.profiles as profile set account_state = 'banned'
    where profile.id = p_target_user_id and profile.account_state = 'active';
    if not found then return null; end if;
  end if;

  insert into private.account_sanction_events (
    target_user_id, actor_user_id, action, reason, expires_at
  ) values (
    p_target_user_id, v_actor, p_action, pg_catalog.btrim(p_reason), p_expires_at
  ) returning id into v_event_id;

  return v_event_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_my_user_report(p_kind text, p_post_id uuid, p_reason text, p_message text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_account_state text;
  v_recent_count integer;
  v_message text := pg_catalog.btrim(coalesce(p_message, ''));
  v_report_id uuid;
  v_now timestamptz;
begin
  if v_user_id is null
    or p_kind is null or p_reason is null
    or p_kind not in ('report', 'feedback')
    or pg_catalog.char_length(v_message) not between 1 and 2000
    or (p_kind = 'report' and p_reason not in ('inaccurate_information', 'privacy', 'safety', 'spam', 'other'))
    or (p_kind = 'feedback' and p_reason not in ('suggestion', 'accessibility', 'technical_issue', 'other'))
    or (p_kind = 'report' and p_post_id is null)
    or (p_kind = 'feedback' and p_post_id is not null) then
    return null;
  end if;

  -- Serialize account submissions so parallel requests cannot skip the cap.
  perform auth_user.id
  from auth.users as auth_user where auth_user.id = v_user_id for update;
  if not found then return null; end if;

  select profile.account_state into v_account_state
  from public.profiles as profile where profile.id = v_user_id;
  if v_account_state is distinct from 'active' then return null; end if;

  if p_kind = 'report' and not exists (
    select 1 from private.posts as post_row
    join private.areas as area on area.id = post_row.area_id and area.is_active
    join public.published_previews as preview on preview.post_id = post_row.id
    where post_row.id = p_post_id and post_row.status = 'published'
  ) then
    return null;
  end if;

  -- now() is fixed at transaction start. Sample after the lock and other
  -- authorization checks so a delayed request cannot use a stale hour window.
  v_now := pg_catalog.clock_timestamp();
  select pg_catalog.count(*)::integer into v_recent_count
  from private.user_reports as report
  where report.submitted_by = v_user_id
    and report.submitted_at > v_now - interval '1 hour';
  if v_recent_count >= 5 then return null; end if;

  insert into private.user_reports (
    submitted_by, report_kind, post_id, reason, message, submitted_at
  ) values (
    v_user_id, p_kind, p_post_id, p_reason, v_message, v_now
  ) returning id into v_report_id;
  return v_report_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.create_my_user_report(p_submitter_id uuid, p_kind text, p_post_id uuid, p_reason text, p_message text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_account_state text;
  v_recent_count integer;
  v_message text := pg_catalog.btrim(coalesce(p_message, ''));
  v_report_id uuid;
  v_now timestamptz;
begin
  if (select auth.role()) is distinct from 'service_role'
    or p_submitter_id is null
    or p_kind is null or p_reason is null
    or p_kind not in ('report', 'feedback')
    or pg_catalog.char_length(v_message) not between 1 and 2000
    or (p_kind = 'report' and p_reason not in ('inaccurate_information', 'privacy', 'safety', 'spam', 'other'))
    or (p_kind = 'feedback' and p_reason not in ('suggestion', 'accessibility', 'technical_issue', 'other'))
    or (p_kind = 'report' and p_post_id is null)
    or (p_kind = 'feedback' and p_post_id is not null) then
    return null;
  end if;

  -- Serialize account submissions so parallel requests cannot skip the cap.
  perform auth_user.id
  from auth.users as auth_user where auth_user.id = p_submitter_id for update;
  if not found then return null; end if;

  select profile.account_state into v_account_state
  from public.profiles as profile where profile.id = p_submitter_id;
  if v_account_state is distinct from 'active' then return null; end if;

  if p_kind = 'report' and not exists (
    select 1 from private.posts as post_row
    join private.areas as area on area.id = post_row.area_id and area.is_active
    join public.published_previews as preview on preview.post_id = post_row.id
    where post_row.id = p_post_id and post_row.status = 'published'
  ) then
    return null;
  end if;

  v_now := pg_catalog.clock_timestamp();
  select pg_catalog.count(*)::integer into v_recent_count
  from private.user_reports as report
  where report.submitted_by = p_submitter_id
    and report.submitted_at > v_now - interval '1 hour';
  if v_recent_count >= 5 then
    raise exception using errcode = 'P0001', message = 'report_rate_limited';
  end if;

  insert into private.user_reports (
    submitted_by, report_kind, post_id, reason, message, submitted_at
  ) values (
    p_submitter_id, p_kind, p_post_id, p_reason, v_message, v_now
  ) returning id into v_report_id;
  return v_report_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.get_staff_submission_publication_source(p_submission_id uuid)
 RETURNS TABLE(submission_id uuid, submission_updated_at timestamp with time zone, latest_addendum_id uuid, risk_level text, primary_name text, area_id uuid, area_name text, area_type text, submitted_title text, original_source text, additional_information text[], social_links jsonb, declaration_version text, declared_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_enabled boolean := false;
begin
  if v_user_id is null or p_submission_id is null
    or not (private.has_staff_role('admin') or private.has_staff_role('owner'))
    or not private.has_recent_totp() then
    raise exception 'staff submission access denied' using errcode = '42501';
  end if;

  select coalesce(runtime_flag.enabled, false) into v_enabled
  from private.runtime_flags as runtime_flag
  where runtime_flag.flag = 'submission_publication'
  for share;
  if not coalesce(v_enabled, false) then return; end if;

  perform submission.id
  from private.submissions as submission
  where submission.id = p_submission_id
    and submission.status in ('received', 'reviewing', 'needs_more_information')
    and (submission.risk_level <> 'high' or private.has_staff_role('owner'));
  if not found then return; end if;
  if not exists (
    select 1 from private.submission_intake_details as intake
    join private.areas as area on area.id = intake.area_id and area.is_active
    where intake.submission_id = p_submission_id
  ) then return; end if;

  insert into private.submission_staff_audit (submission_id, actor_user_id, action)
  values (p_submission_id, v_user_id, 'publication_source_opened');

  return query
  select submission.id, submission.updated_at,
    (select addendum.id from private.submission_addenda as addendum
      where addendum.submission_id = submission.id
      order by addendum.created_at desc, addendum.id desc limit 1),
    submission.risk_level, intake.primary_name, area.id,
    area.area_name, area.area_type, submission.submitted_title, submission.original_source,
    coalesce((select pg_catalog.array_agg(addendum.additional_information order by addendum.created_at, addendum.id)
      from private.submission_addenda as addendum where addendum.submission_id = submission.id), array[]::text[]),
    intake.social_links, intake.declaration_version, intake.declared_at
  from private.submissions as submission
  join private.submission_intake_details as intake on intake.submission_id = submission.id
  join private.areas as area on area.id = intake.area_id and area.is_active
  where submission.id = p_submission_id
    and submission.status in ('received', 'reviewing', 'needs_more_information')
    and (submission.risk_level <> 'high' or private.has_staff_role('owner'));
end;
$function$;

CREATE OR REPLACE FUNCTION public.toggle_my_post_reaction(p_post_id uuid, p_reaction_type text)
 RETURNS TABLE(accepted boolean, selected_reaction text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_account_state text;
  v_post_status text;
  v_area_active boolean;
  v_existing_type text;
begin
  if v_user_id is null or p_reaction_type not in ('helpful', 'thanks', 'support') then
    return query select false, null::text; return;
  end if;

  perform auth_user.id
  from auth.users as auth_user where auth_user.id = v_user_id for key share;
  if not found then return query select false, null::text; return; end if;

  select post_row.status, area.is_active into v_post_status, v_area_active
  from private.posts as post_row
  left join private.areas as area on area.id = post_row.area_id
  where post_row.id = p_post_id for update of post_row;
  if not found or v_post_status <> 'published' or v_area_active is distinct from true
    or not exists (select 1 from public.published_previews as preview where preview.post_id = p_post_id) then
    return query select false, null::text; return;
  end if;

  select profile.account_state into v_account_state
  from public.profiles as profile where profile.id = v_user_id;
  if v_account_state is distinct from 'active'
    or private.account_has_active_sanction(v_user_id, 'account_suspension') then
    return query select false, null::text; return;
  end if;

  select reaction.reaction_type into v_existing_type
  from private.reactions as reaction
  where reaction.user_id = v_user_id and reaction.post_id = p_post_id
  for update;
  if found and v_existing_type = p_reaction_type then
    delete from private.reactions as reaction where reaction.user_id = v_user_id and reaction.post_id = p_post_id;
    return query select true, null::text;
  elsif found then
    update private.reactions as reaction set reaction_type = p_reaction_type
    where reaction.user_id = v_user_id and reaction.post_id = p_post_id;
    return query select true, p_reaction_type;
  else
    insert into private.reactions (user_id, post_id, reaction_type)
    values (v_user_id, p_post_id, p_reaction_type);
    return query select true, p_reaction_type;
  end if;
end;
$function$;

