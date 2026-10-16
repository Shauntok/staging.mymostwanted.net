-- Local-only foundation for turning an explicitly reviewed submission into a
-- public post. The submission entry point stays disabled, and publication has
-- an independent default-off gate. No migration is applied by this file.

alter table private.runtime_flags drop constraint runtime_flags_name_valid;
alter table private.runtime_flags add constraint runtime_flags_name_valid
  check (flag in (
    'account_deletion', 'submission_risk_scanning', 'critical_security_email',
    'staff_evidence_preview', 'owner_evidence_visibility', 'submission_publication'
  ));

insert into private.runtime_flags (flag, enabled)
values ('submission_publication', false)
on conflict (flag) do nothing;

create table private.submission_intake_details (
  submission_id uuid primary key references private.submissions (id) on delete restrict,
  primary_name text not null,
  area_id uuid not null references private.areas (id) on delete restrict,
  social_links jsonb not null default '{}'::jsonb,
  declaration_version text not null,
  declared_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint submission_intake_primary_name_size
    check (pg_catalog.char_length(pg_catalog.btrim(primary_name)) between 1 and 200),
  constraint submission_intake_social_links_object
    check (pg_catalog.jsonb_typeof(social_links) = 'object'),
  constraint submission_intake_declaration_version_size
    check (pg_catalog.char_length(pg_catalog.btrim(declaration_version)) between 1 and 100)
);
alter table private.submission_intake_details enable row level security;
revoke all on table private.submission_intake_details from public, anon, authenticated, service_role;

create table private.submission_publications (
  submission_id uuid primary key references private.submissions (id) on delete restrict,
  post_id uuid not null unique references private.posts (id) on delete restrict,
  actor_user_id uuid references auth.users (id) on delete set null,
  reason text not null,
  public_social_platforms text[] not null default array[]::text[],
  published_at timestamptz not null,
  constraint submission_publication_reason_size
    check (pg_catalog.char_length(pg_catalog.btrim(reason)) between 1 and 1000),
  constraint submission_publication_social_platforms_valid
    check (public_social_platforms <@ array['facebook','instagram','tiktok','telegram']::text[])
);
alter table private.submission_publications enable row level security;
revoke all on table private.submission_publications from public, anon, authenticated, service_role;

create function private.reject_submission_publication_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' and old.actor_user_id is not null and new.actor_user_id is null
    and (pg_catalog.to_jsonb(old) - 'actor_user_id') = (pg_catalog.to_jsonb(new) - 'actor_user_id') then
    return new;
  end if;
  raise exception 'submission publication record is immutable' using errcode = '55000';
end;
$function$;
revoke all on function private.reject_submission_publication_mutation() from public, anon, authenticated, service_role;
create trigger submission_publications_immutable
  before update or delete on private.submission_publications
  for each row execute function private.reject_submission_publication_mutation();
create trigger submission_publications_no_truncate
  before truncate on private.submission_publications
  for each statement execute function private.reject_submission_publication_mutation();

create table public.published_social_links (
  post_id uuid not null references private.posts (id) on delete restrict,
  platform text not null,
  url text not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (post_id, platform),
  constraint published_social_platform_valid check (platform in ('facebook','instagram','tiktok','telegram')),
  constraint published_social_url_size check (pg_catalog.char_length(url) between 1 and 500)
);
alter table public.published_social_links enable row level security;
revoke all on table public.published_social_links from public, anon, authenticated, service_role;
create policy published_social_links_visible_with_post
  on public.published_social_links for select to anon, authenticated
  using (exists (
    select 1 from public.published_previews as preview
    where preview.post_id = published_social_links.post_id
  ));
grant select on table public.published_social_links to anon, authenticated;

create function private.is_valid_public_social_url(p_platform text, p_url text)
returns boolean
language plpgsql immutable
set search_path = ''
as $function$
declare
  v_parts text[];
  v_host text;
begin
  if p_platform not in ('facebook','instagram','tiktok','telegram')
    or p_url is null or pg_catalog.char_length(p_url) > 500
    or p_url <> pg_catalog.btrim(p_url)
    or p_url ~ '[[:space:][:cntrl:]]' then
    return false;
  end if;
  v_parts := pg_catalog.regexp_match(pg_catalog.lower(p_url), '^https://([^/:?#]+)(/[^?#]*)?$');
  if v_parts is null then return false; end if;
  v_host := v_parts[1];
  return case p_platform
    when 'facebook' then v_host = 'facebook.com' or v_host = 'fb.com'
      or v_host like '%.facebook.com' or v_host like '%.fb.com'
    when 'instagram' then v_host = 'instagram.com' or v_host like '%.instagram.com'
    when 'tiktok' then v_host = 'tiktok.com' or v_host like '%.tiktok.com'
    when 'telegram' then v_host in ('t.me','telegram.me')
      or v_host like '%.t.me' or v_host like '%.telegram.me'
    else false
  end;
end;
$function$;
revoke all on function private.is_valid_public_social_url(text, text) from public, anon, authenticated, service_role;

alter table private.submission_staff_audit drop constraint submission_staff_audit_action_valid;
alter table private.submission_staff_audit add constraint submission_staff_audit_action_valid
  check (action in ('queue_opened', 'submission_opened', 'review_history_opened', 'status_changed', 'publication_source_opened', 'published'));

create function public.get_staff_submission_publication_source(p_submission_id uuid)
returns table (
  submission_id uuid,
  submission_updated_at timestamptz,
  latest_addendum_id uuid,
  risk_level text,
  primary_name text,
  area_id uuid,
  area_name text,
  area_type text,
  submitted_title text,
  original_source text,
  additional_information text[],
  social_links jsonb,
  declaration_version text,
  declared_at timestamptz
)
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_enabled boolean := false;
  v_submission private.submissions%rowtype;
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

  select submission.* into v_submission
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
revoke all on function public.get_staff_submission_publication_source(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_staff_submission_publication_source(uuid) to authenticated;

create function public.list_staff_publication_tags()
returns table (tag_id uuid, display_name text)
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  v_enabled boolean := false;
begin
  if auth.uid() is null
    or not (private.has_staff_role('admin') or private.has_staff_role('owner'))
    or not private.has_recent_totp() then
    raise exception 'staff publication access denied' using errcode = '42501';
  end if;
  select coalesce(runtime_flag.enabled, false) into v_enabled
  from private.runtime_flags as runtime_flag
  where runtime_flag.flag = 'submission_publication'
  for share;
  if not coalesce(v_enabled, false) then return; end if;
  return query select tag.id, tag.display_name
    from private.tags as tag where tag.is_active order by tag.display_name, tag.id limit 200;
end;
$function$;
revoke all on function public.list_staff_publication_tags() from public, anon, authenticated, service_role;
grant execute on function public.list_staff_publication_tags() to authenticated;

create function public.publish_reviewed_submission(
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
  v_now := pg_catalog.clock_timestamp();
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
