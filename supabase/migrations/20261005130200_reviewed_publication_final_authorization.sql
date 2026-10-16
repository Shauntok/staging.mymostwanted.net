-- Forward-only local correction. Keep both publication gates disabled.
-- A reviewer may wait on intake/area/Tag locks after the submission lock;
-- no write may reuse authorization or a timestamp taken before those waits.

create or replace function public.publish_reviewed_submission(
  p_submission_id uuid,
  p_approved_title text,
  p_public_excerpt text,
  p_full_body text,
  p_tag_ids uuid[],
  p_risk_level text,
  p_reason text,
  p_expected_submission_updated_at timestamptz,
  p_expected_latest_addendum_id uuid,
  p_public_social_platforms text[] default array[]::text[]
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_is_owner boolean := private.has_staff_role('owner');
  v_enabled boolean := false;
  v_submission private.submissions%rowtype;
  v_intake private.submission_intake_details%rowtype;
  v_post_id uuid;
  v_now timestamptz;
  v_platform text;
  v_url text;
  v_tag_id uuid;
  v_tag_is_active boolean;
  v_latest_addendum_id uuid;
begin
  if v_user_id is null or p_submission_id is null
    or p_expected_submission_updated_at is null
    or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_approved_title, ''))) not between 1 and 300
    or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_public_excerpt, ''))) not between 1 and 200
    or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_full_body, ''))) not between 1 and 200000
    or p_risk_level is null or p_risk_level not in ('ordinary', 'high')
    or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason, ''))) not between 1 and 1000
    or (not v_is_owner and not private.has_staff_role('admin'))
    or not private.has_recent_totp() then
    return null;
  end if;

  select coalesce(runtime_flag.enabled, false) into v_enabled
  from private.runtime_flags as runtime_flag
  where runtime_flag.flag = 'submission_publication'
  for share;
  if not coalesce(v_enabled, false) then return null; end if;

  select submission.* into v_submission
  from private.submissions as submission
  where submission.id = p_submission_id
  for update;
  if not found or v_submission.status not in ('received', 'reviewing', 'needs_more_information')
    or (v_submission.risk_level = 'high' and not v_is_owner)
    or (p_risk_level = 'high' and not v_is_owner)
    or exists (select 1 from private.submission_publications as publication where publication.submission_id = p_submission_id) then
    return null;
  end if;

  -- The parent-row lock serializes this check with append_submission_information.
  -- Refuse to publish if the reviewer opened an older source/addenda snapshot.
  select addendum.id into v_latest_addendum_id
  from private.submission_addenda as addendum
  where addendum.submission_id = p_submission_id
  order by addendum.created_at desc, addendum.id desc
  limit 1;
  if v_submission.updated_at is distinct from p_expected_submission_updated_at
    or v_latest_addendum_id is distinct from p_expected_latest_addendum_id then
    raise exception 'submission source changed; reload before publishing' using errcode = '40001';
  end if;

  -- Revalidate current staff identity, role, risk, feature gate and TOTP after
  -- waiting for the submission row lock.
  v_is_owner := private.has_staff_role('owner');
  if not private.has_recent_totp()
    or (not v_is_owner and (not private.has_staff_role('admin') or v_submission.risk_level = 'high' or p_risk_level = 'high')) then
    return null;
  end if;
  select coalesce(runtime_flag.enabled, false) into v_enabled
  from private.runtime_flags as runtime_flag
  where runtime_flag.flag = 'submission_publication'
  for share;
  if not coalesce(v_enabled, false) then return null; end if;

  select intake.* into v_intake
  from private.submission_intake_details as intake
  join private.areas as area on area.id = intake.area_id and area.is_active
  where intake.submission_id = p_submission_id
  for share of intake, area;
  if not found then return null; end if;

  if p_tag_ids is null or coalesce(pg_catalog.cardinality(p_tag_ids), 0) > 20
    or (select count(distinct tag_id) from pg_catalog.unnest(p_tag_ids) as ids(tag_id)) <> pg_catalog.cardinality(p_tag_ids) then
    return null;
  end if;
  -- Lock active tags in a stable order so they cannot be disabled between
  -- validation and the post_tags insert, and concurrent publishers acquire
  -- overlapping tag locks consistently.
  for v_tag_id in
    select ids.tag_id
    from pg_catalog.unnest(p_tag_ids) as ids(tag_id)
    order by ids.tag_id
  loop
    select tag.is_active into v_tag_is_active
    from private.tags as tag
    where tag.id = v_tag_id
    for share;
    if not found or not coalesce(v_tag_is_active, false) then return null; end if;
  end loop;

  if p_public_social_platforms is null or coalesce(pg_catalog.cardinality(p_public_social_platforms), 0) > 4
    or (select count(distinct selected_platform.platform) from pg_catalog.unnest(p_public_social_platforms) as selected_platform(platform)) <> pg_catalog.cardinality(p_public_social_platforms) then
    return null;
  end if;
  foreach v_platform in array p_public_social_platforms loop
    if v_platform not in ('facebook','instagram','tiktok','telegram') then return null; end if;
    v_url := v_intake.social_links ->> v_platform;
    if not private.is_valid_public_social_url(v_platform, v_url) then return null; end if;
  end loop;

  -- Intake/area and Tag locks can wait after the earlier submission-lock
  -- check. Revalidate the active role/session and TOTP at the final write
  -- boundary, then sample the common publication/audit timestamp.
  v_is_owner := private.has_staff_role('owner');
  if not private.has_recent_totp()
    or (not v_is_owner and (not private.has_staff_role('admin')
      or v_submission.risk_level = 'high' or p_risk_level = 'high')) then
    return null;
  end if;
  v_now := pg_catalog.clock_timestamp();

  insert into private.posts (
    area_id, submitter_id, approved_title, primary_name, public_excerpt, full_body,
    risk_level, status, published_at, last_published_at, created_at, updated_at
  ) values (
    v_intake.area_id, v_submission.submitter_id, pg_catalog.btrim(p_approved_title),
    pg_catalog.btrim(v_intake.primary_name), pg_catalog.btrim(p_public_excerpt),
    pg_catalog.btrim(p_full_body), p_risk_level, 'published', v_now, v_now, v_now, v_now
  ) returning id into v_post_id;

  insert into private.post_tags (post_id, tag_id)
  select v_post_id, tag_id from pg_catalog.unnest(p_tag_ids) as ids(tag_id);

  insert into private.submission_publications (
    submission_id, post_id, actor_user_id, reason, public_social_platforms, published_at
  ) values (
    p_submission_id, v_post_id, v_user_id, pg_catalog.btrim(p_reason),
    p_public_social_platforms, v_now
  );

  foreach v_platform in array p_public_social_platforms loop
    insert into public.published_social_links (post_id, platform, url)
    values (v_post_id, v_platform, v_intake.social_links ->> v_platform);
  end loop;

  update private.submissions as submission
  set status = 'published', internal_reviewer_notes = pg_catalog.btrim(p_reason), updated_at = v_now
  where submission.id = p_submission_id;

  insert into private.submission_reviews (
    submission_id, reviewer_id, decision, risk_level, internal_notes, safe_response, created_at
  ) values (
    p_submission_id, v_user_id, 'approve', p_risk_level, pg_catalog.btrim(p_reason),
    v_submission.safe_reviewer_response, v_now
  );

  insert into private.submission_staff_audit (
    submission_id, actor_user_id, action, status_before, status_after, reason, internal_notes, safe_response, occurred_at
  ) values (
    p_submission_id, v_user_id, 'published', v_submission.status, 'published', pg_catalog.btrim(p_reason),
    pg_catalog.btrim(p_reason), v_submission.safe_reviewer_response, v_now
  );

  insert into private.moderation_events (
    actor_user_id, post_id, action, reason, prior_state, next_state, risk_level, occurred_at
  ) values (
    v_user_id, v_post_id, 'publish', pg_catalog.btrim(p_reason), 'submission_review', 'published', p_risk_level, v_now
  );

  return v_post_id;
end;
$function$;
revoke all on function public.publish_reviewed_submission(uuid, text, text, text, uuid[], text, text, timestamptz, uuid, text[]) from public, anon, authenticated, service_role;
grant execute on function public.publish_reviewed_submission(uuid, text, text, text, uuid[], text, text, timestamptz, uuid, text[]) to authenticated;
