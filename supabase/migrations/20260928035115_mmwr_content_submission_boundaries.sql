-- MMWR reviewed content and submission boundaries. No records or geography are seeded.
-- Full source text, review notes, evidence object paths, roles, and identities stay
-- in private. Public previews are denormalized, curated projections only.

create table private.areas (
  id uuid primary key default gen_random_uuid(),
  parent_area_id uuid references private.areas (id) on delete restrict,
  area_name text not null,
  area_type text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  constraint areas_name_nonblank check (pg_catalog.btrim(area_name) <> ''),
  constraint areas_type_valid check (area_type in ('state', 'city', 'independent_admin_area'))
);

create table private.tags (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  constraint tags_slug_nonblank check (pg_catalog.btrim(slug) <> ''),
  constraint tags_display_name_nonblank check (pg_catalog.btrim(display_name) <> ''),
  constraint tags_slug_normalized_unique unique (slug)
);

create table private.posts (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references private.areas (id) on delete restrict,
  submitter_id uuid references auth.users (id) on delete set null,
  approved_title text not null,
  primary_name text not null,
  public_excerpt text not null,
  full_body text not null,
  risk_level text not null default 'ordinary',
  status text not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint posts_title_nonblank check (pg_catalog.btrim(approved_title) <> ''),
  constraint posts_primary_name_nonblank check (pg_catalog.btrim(primary_name) <> ''),
  constraint posts_excerpt_nonblank check (pg_catalog.btrim(public_excerpt) <> ''),
  constraint posts_excerpt_preview_size check (pg_catalog.char_length(public_excerpt) <= 1200),
  constraint posts_body_nonblank check (pg_catalog.btrim(full_body) <> ''),
  constraint posts_risk_valid check (risk_level in ('ordinary', 'high')),
  constraint posts_status_valid check (status in ('draft', 'pending_review', 'approved', 'published', 'temporarily_hidden', 'permanently_removed')),
  constraint posts_published_timestamp_consistent check (
    (status in ('published', 'temporarily_hidden', 'permanently_removed') and published_at is not null)
    or (status not in ('published', 'temporarily_hidden', 'permanently_removed') and published_at is null)
  )
);

create table private.post_tags (
  post_id uuid not null references private.posts (id) on delete cascade,
  tag_id uuid not null references private.tags (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (post_id, tag_id)
);

create table private.aliases (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references private.posts (id) on delete cascade,
  alias_text text not null,
  state text not null default 'proposed',
  created_at timestamptz not null default pg_catalog.now(),
  constraint aliases_text_nonblank check (pg_catalog.btrim(alias_text) <> ''),
  constraint aliases_state_valid check (state in ('proposed', 'approved', 'retired'))
);

create table private.submissions (
  id uuid primary key default gen_random_uuid(),
  submitter_id uuid references auth.users (id) on delete set null,
  submitted_title text not null,
  original_source text not null,
  status text not null default 'received',
  safe_reviewer_response text,
  risk_level text not null default 'unassessed',
  internal_reviewer_notes text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint submissions_title_nonblank check (pg_catalog.btrim(submitted_title) <> ''),
  constraint submissions_source_nonblank check (pg_catalog.btrim(original_source) <> ''),
  constraint submissions_status_valid check (status in ('received', 'reviewing', 'needs_more_information', 'rejected', 'approved', 'published', 'closed')),
  constraint submissions_risk_valid check (risk_level in ('unassessed', 'ordinary', 'high'))
);

create table private.submission_addenda (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references private.submissions (id) on delete cascade,
  submitter_id uuid references auth.users (id) on delete set null,
  additional_information text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint submission_addenda_nonblank check (pg_catalog.btrim(additional_information) <> '')
);

create table private.submission_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references private.submissions (id) on delete cascade,
  reviewer_id uuid references auth.users (id) on delete set null,
  decision text not null,
  risk_level text not null,
  internal_notes text,
  safe_response text,
  created_at timestamptz not null default pg_catalog.now(),
  constraint submission_reviews_decision_valid check (decision in ('reviewing', 'needs_more_information', 'reject', 'approve', 'close')),
  constraint submission_reviews_risk_valid check (risk_level in ('ordinary', 'high'))
);

create table private.evidence_metadata (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references private.submissions (id) on delete cascade,
  post_id uuid references private.posts (id) on delete cascade,
  uploaded_by uuid references auth.users (id) on delete set null,
  object_path text not null,
  mime_type text not null,
  scan_state text not null default 'pending',
  visibility text not null default 'internal_only',
  created_at timestamptz not null default pg_catalog.now(),
  constraint evidence_metadata_one_parent check ((submission_id is null) <> (post_id is null)),
  constraint evidence_object_path_nonblank check (pg_catalog.btrim(object_path) <> ''),
  constraint evidence_mime_type_nonblank check (pg_catalog.btrim(mime_type) <> ''),
  constraint evidence_scan_state_valid check (scan_state in ('pending', 'clean', 'quarantined', 'rejected')),
  constraint evidence_visibility_valid check (visibility in ('internal_only', 'public_thumbnail'))
);

create table private.reactions (
  user_id uuid not null references auth.users (id) on delete cascade,
  post_id uuid not null references private.posts (id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (user_id, post_id)
);

create table private.moderation_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users (id) on delete set null,
  post_id uuid references private.posts (id) on delete set null,
  action text not null,
  reason text not null,
  prior_state text,
  next_state text,
  risk_level text,
  occurred_at timestamptz not null default pg_catalog.now(),
  constraint moderation_events_action_valid check (action in ('publish', 'hide', 'restore', 'remove')),
  constraint moderation_events_reason_nonblank check (pg_catalog.btrim(reason) <> ''),
  constraint moderation_events_risk_valid check (risk_level is null or risk_level in ('ordinary', 'high'))
);

create index submissions_owner_created_idx on private.submissions (submitter_id, created_at desc);
create index evidence_submission_idx on private.evidence_metadata (submission_id) where submission_id is not null;
create index evidence_post_idx on private.evidence_metadata (post_id) where post_id is not null;
create index reactions_post_idx on private.reactions (post_id);
create index moderation_events_post_idx on private.moderation_events (post_id, occurred_at desc);

create table public.published_previews (
  post_id uuid primary key references private.posts (id) on delete restrict,
  approved_title text not null,
  primary_name text not null,
  public_excerpt text not null,
  published_at timestamptz not null,
  public_tag_ids uuid[] not null default array[]::uuid[],
  public_tag_labels text[] not null default array[]::text[],
  public_area_id uuid not null,
  public_area_name text not null,
  thumbnail_available boolean not null default false
);

create table public.reaction_counts (
  post_id uuid primary key references private.posts (id) on delete restrict,
  reaction_count bigint not null,
  constraint public_reaction_count_positive check (reaction_count > 0)
);

create function private.sync_public_post_projection(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1
    from private.posts as post_row
    join private.areas as area on area.id = post_row.area_id and area.is_active
    where post_row.id = p_post_id and post_row.status = 'published'
  ) then
    delete from public.published_previews as preview where preview.post_id = p_post_id;
    delete from public.reaction_counts as reaction_count where reaction_count.post_id = p_post_id;
    return;
  end if;

  insert into public.published_previews (
    post_id, approved_title, primary_name, public_excerpt, published_at,
    public_tag_ids, public_tag_labels, public_area_id, public_area_name, thumbnail_available
  )
  select
    post_row.id,
    post_row.approved_title,
    post_row.primary_name,
    post_row.public_excerpt,
    post_row.published_at,
    array(
      select post_tag.tag_id
      from private.post_tags as post_tag
      join private.tags as tag_row on tag_row.id = post_tag.tag_id
      where post_tag.post_id = post_row.id and tag_row.is_active
      order by tag_row.display_name, tag_row.id
    ),
    array(
      select tag_row.display_name
      from private.post_tags as post_tag
      join private.tags as tag_row on tag_row.id = post_tag.tag_id
      where post_tag.post_id = post_row.id and tag_row.is_active
      order by tag_row.display_name, tag_row.id
    ),
    post_row.area_id,
    area.area_name,
    exists (
      select 1 from private.evidence_metadata as evidence
      where evidence.post_id = post_row.id
        and evidence.scan_state = 'clean'
        and evidence.visibility = 'public_thumbnail'
    )
  from private.posts as post_row
  join private.areas as area on area.id = post_row.area_id and area.is_active
  where post_row.id = p_post_id and post_row.status = 'published'
  on conflict (post_id) do update set
    approved_title = excluded.approved_title,
    primary_name = excluded.primary_name,
    public_excerpt = excluded.public_excerpt,
    published_at = excluded.published_at,
    public_tag_ids = excluded.public_tag_ids,
    public_tag_labels = excluded.public_tag_labels,
    public_area_id = excluded.public_area_id,
    public_area_name = excluded.public_area_name,
    thumbnail_available = excluded.thumbnail_available;

  insert into public.reaction_counts (post_id, reaction_count)
  select reaction.post_id, pg_catalog.count(*)
  from private.reactions as reaction
  where reaction.post_id = p_post_id
    and exists (select 1 from public.published_previews as preview where preview.post_id = p_post_id)
  group by reaction.post_id
  having pg_catalog.count(*) > 0
  on conflict (post_id) do update set reaction_count = excluded.reaction_count;

  delete from public.reaction_counts as reaction_count
  where reaction_count.post_id = p_post_id
    and not exists (select 1 from public.published_previews as preview where preview.post_id = p_post_id);
end;
$function$;

revoke all on function private.sync_public_post_projection(uuid) from public, anon, authenticated, service_role;

create function private.sync_post_publication_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status = 'published' then
    perform private.sync_public_post_projection(new.id);
  else
    delete from public.published_previews as preview where preview.post_id = new.id;
    delete from public.reaction_counts as reaction_count where reaction_count.post_id = new.id;
  end if;
  return new;
end;
$function$;

revoke all on function private.sync_post_publication_state() from public, anon, authenticated, service_role;

create trigger posts_sync_publication_projection
  after update of status, approved_title, primary_name, public_excerpt, area_id on private.posts
  for each row
  execute function private.sync_post_publication_state();

create function private.refresh_public_projection_for_catalog_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_post_id uuid;
begin
  if tg_table_name = 'tags' then
    for v_post_id in
      select post_tag.post_id
      from private.post_tags as post_tag
      join private.posts as post_row on post_row.id = post_tag.post_id
      where post_tag.tag_id = new.id and post_row.status = 'published'
    loop
      perform private.sync_public_post_projection(v_post_id);
    end loop;
  elsif tg_table_name = 'areas' then
    for v_post_id in
      select post_row.id from private.posts as post_row
      where post_row.area_id = new.id and post_row.status = 'published'
    loop
      perform private.sync_public_post_projection(v_post_id);
    end loop;
  end if;
  return new;
end;
$function$;

revoke all on function private.refresh_public_projection_for_catalog_change() from public, anon, authenticated, service_role;

create trigger tags_refresh_public_projection
  after update of display_name, is_active on private.tags
  for each row when (old.display_name is distinct from new.display_name or old.is_active is distinct from new.is_active)
  execute function private.refresh_public_projection_for_catalog_change();

create trigger areas_refresh_public_projection
  after update of area_name, is_active on private.areas
  for each row when (old.area_name is distinct from new.area_name or old.is_active is distinct from new.is_active)
  execute function private.refresh_public_projection_for_catalog_change();

create function private.refresh_public_projection_for_post_tag_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op <> 'INSERT' then
    perform private.sync_public_post_projection(old.post_id);
  end if;
  if tg_op <> 'DELETE' then
    perform private.sync_public_post_projection(new.post_id);
    return new;
  end if;
  return old;
end;
$function$;

revoke all on function private.refresh_public_projection_for_post_tag_change() from public, anon, authenticated, service_role;

create trigger post_tags_refresh_public_projection
  after insert or update or delete on private.post_tags
  for each row execute function private.refresh_public_projection_for_post_tag_change();

create function private.refresh_public_projection_for_evidence_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op <> 'INSERT' and old.post_id is not null then
    perform private.sync_public_post_projection(old.post_id);
  end if;
  if tg_op <> 'DELETE' and new.post_id is not null then
    perform private.sync_public_post_projection(new.post_id);
    return new;
  end if;
  return old;
end;
$function$;

revoke all on function private.refresh_public_projection_for_evidence_change() from public, anon, authenticated, service_role;

create trigger evidence_refresh_public_projection
  after insert or update or delete on private.evidence_metadata
  for each row execute function private.refresh_public_projection_for_evidence_change();

create function private.create_submission(p_title text, p_original_source text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_submission_id uuid;
begin
  if v_user_id is null
    or p_title is null or pg_catalog.btrim(p_title) = ''
    or p_original_source is null or pg_catalog.btrim(p_original_source) = ''
    or not exists (
      select 1
      from public.profiles as profile
      join auth.users as auth_user on auth_user.id = profile.id
      where profile.id = v_user_id
        and profile.account_state = 'active'
        and auth_user.email_confirmed_at is not null
    ) then
    return null;
  end if;

  insert into private.submissions (submitter_id, submitted_title, original_source)
  values (v_user_id, pg_catalog.btrim(p_title), p_original_source)
  returning id into v_submission_id;
  return v_submission_id;
end;
$function$;

revoke all on function private.create_submission(text, text) from public, anon, service_role;
grant execute on function private.create_submission(text, text) to authenticated;

create function public.create_submission(p_title text, p_original_source text)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.create_submission(p_title, p_original_source);
$function$;

revoke all on function public.create_submission(text, text) from public, anon, service_role;
grant execute on function public.create_submission(text, text) to authenticated;

create function private.append_submission_information(p_submission_id uuid, p_information text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_status text;
begin
  if v_user_id is null or p_information is null or pg_catalog.btrim(p_information) = '' then
    return false;
  end if;

  select submission.status into v_status
  from private.submissions as submission
  where submission.id = p_submission_id and submission.submitter_id = v_user_id
  for update;

  if v_status is distinct from 'needs_more_information' then
    return false;
  end if;

  insert into private.submission_addenda (submission_id, submitter_id, additional_information)
  values (p_submission_id, v_user_id, p_information);
  return true;
end;
$function$;

revoke all on function private.append_submission_information(uuid, text) from public, anon, service_role;
grant execute on function private.append_submission_information(uuid, text) to authenticated;

create function public.append_submission_information(p_submission_id uuid, p_information text)
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  select private.append_submission_information(p_submission_id, p_information);
$function$;

revoke all on function public.append_submission_information(uuid, text) from public, anon, service_role;
grant execute on function public.append_submission_information(uuid, text) to authenticated;

create function private.my_submission_statuses()
returns table (
  submission_id uuid,
  status text,
  safe_reviewer_response text,
  submitted_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select submission.id, submission.status, submission.safe_reviewer_response,
         submission.created_at, submission.updated_at
  from private.submissions as submission
  where submission.submitter_id = (select auth.uid())
  order by submission.created_at desc;
$function$;

revoke all on function private.my_submission_statuses() from public, anon, service_role;
grant execute on function private.my_submission_statuses() to authenticated;

create function public.my_submission_statuses()
returns table (
  submission_id uuid,
  status text,
  safe_reviewer_response text,
  submitted_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select * from private.my_submission_statuses();
$function$;

revoke all on function public.my_submission_statuses() from public, anon, service_role;
grant execute on function public.my_submission_statuses() to authenticated;

create function private.review_submission(p_submission_id uuid)
returns table (
  submission_id uuid,
  submitter_id uuid,
  submitted_title text,
  original_source text,
  status text,
  risk_level text,
  internal_reviewer_notes text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select submission.id, submission.submitter_id, submission.submitted_title,
         submission.original_source, submission.status, submission.risk_level,
         submission.internal_reviewer_notes
  from private.submissions as submission
  where submission.id = p_submission_id
    and (
      (submission.risk_level <> 'high' and private.has_staff_role('admin'))
      or private.has_staff_role('owner')
    );
$function$;

revoke all on function private.review_submission(uuid) from public, anon, service_role;
grant execute on function private.review_submission(uuid) to authenticated;

create function public.review_submission(p_submission_id uuid)
returns table (
  submission_id uuid,
  submitter_id uuid,
  submitted_title text,
  original_source text,
  status text,
  risk_level text,
  internal_reviewer_notes text
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select * from private.review_submission(p_submission_id);
$function$;

revoke all on function public.review_submission(uuid) from public, anon, service_role;
grant execute on function public.review_submission(uuid) to authenticated;

create function private.record_submission_review(
  p_submission_id uuid,
  p_next_status text,
  p_risk_level text,
  p_internal_notes text,
  p_safe_response text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_submission private.submissions%rowtype;
  v_actor uuid := (select auth.uid());
  v_is_owner boolean := private.has_staff_role('owner');
begin
  if v_actor is null
    or (not v_is_owner and not private.has_staff_role('admin'))
    or p_next_status not in ('reviewing', 'needs_more_information', 'rejected', 'approved', 'closed')
    or p_risk_level not in ('ordinary', 'high') then
    return false;
  end if;

  select submission.* into v_submission
  from private.submissions as submission
  where submission.id = p_submission_id
  for update;
  if not found or v_submission.status not in ('received', 'reviewing', 'needs_more_information') then
    return false;
  end if;

  if (p_risk_level = 'high' or v_submission.risk_level = 'high') and not v_is_owner then
    return false;
  end if;

  update private.submissions as submission
  set status = p_next_status,
      risk_level = p_risk_level,
      internal_reviewer_notes = p_internal_notes,
      safe_reviewer_response = p_safe_response,
      updated_at = pg_catalog.now()
  where submission.id = p_submission_id;

  insert into private.submission_reviews (
    submission_id, reviewer_id, decision, risk_level, internal_notes, safe_response
  ) values (
    p_submission_id,
    v_actor,
    case p_next_status
      when 'rejected' then 'reject'
      when 'approved' then 'approve'
      when 'closed' then 'close'
      else p_next_status
    end,
    p_risk_level,
    p_internal_notes,
    p_safe_response
  );
  return true;
end;
$function$;

revoke all on function private.record_submission_review(uuid, text, text, text, text) from public, anon, service_role;
grant execute on function private.record_submission_review(uuid, text, text, text, text) to authenticated;

create function public.record_submission_review(
  p_submission_id uuid,
  p_next_status text,
  p_risk_level text,
  p_internal_notes text,
  p_safe_response text
)
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  select private.record_submission_review(
    p_submission_id, p_next_status, p_risk_level, p_internal_notes, p_safe_response
  );
$function$;

revoke all on function public.record_submission_review(uuid, text, text, text, text) from public, anon, service_role;
grant execute on function public.record_submission_review(uuid, text, text, text, text) to authenticated;

create function private.read_post_full_body(p_post_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select post_row.full_body
  from private.posts as post_row
  where post_row.id = p_post_id
    and (select auth.uid()) is not null
    and (
      (post_row.status = 'published' and exists (
        select 1 from private.areas as area
        where area.id = post_row.area_id and area.is_active
      ))
      or (post_row.risk_level <> 'high' and private.has_staff_role('admin'))
      or private.has_staff_role('owner')
    );
$function$;

revoke all on function private.read_post_full_body(uuid) from public, anon, service_role;
grant execute on function private.read_post_full_body(uuid) to authenticated;

create function public.read_post_full_body(p_post_id uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $function$
  select private.read_post_full_body(p_post_id);
$function$;

revoke all on function public.read_post_full_body(uuid) from public, anon, service_role;
grant execute on function public.read_post_full_body(uuid) to authenticated;

create function private.set_own_reaction(p_post_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_account_state text;
  v_inserted integer;
begin
  if v_user_id is null or not exists (
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
  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    insert into public.reaction_counts (post_id, reaction_count)
    values (p_post_id, 1)
    on conflict (post_id) do update
    set reaction_count = public.reaction_counts.reaction_count + 1;
  end if;

  return true;
end;
$function$;

revoke all on function private.set_own_reaction(uuid) from public, anon, service_role;
grant execute on function private.set_own_reaction(uuid) to authenticated;

create function public.set_own_reaction(p_post_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  select private.set_own_reaction(p_post_id);
$function$;

revoke all on function public.set_own_reaction(uuid) from public, anon, service_role;
grant execute on function public.set_own_reaction(uuid) to authenticated;

create function private.remove_own_reaction(p_post_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_account_state text;
  v_removed integer;
begin
  if v_user_id is null then
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

  update public.reaction_counts as reaction_count
  set reaction_count = reaction_count.reaction_count - 1
  where reaction_count.post_id = p_post_id;
  delete from public.reaction_counts as reaction_count
  where reaction_count.post_id = p_post_id and reaction_count.reaction_count <= 0;
  return true;
end;
$function$;

revoke all on function private.remove_own_reaction(uuid) from public, anon, service_role;
grant execute on function private.remove_own_reaction(uuid) to authenticated;

create function public.remove_own_reaction(p_post_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  select private.remove_own_reaction(p_post_id);
$function$;

revoke all on function public.remove_own_reaction(uuid) from public, anon, service_role;
grant execute on function public.remove_own_reaction(uuid) to authenticated;

create function private.my_reaction_post_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select reaction.post_id from private.reactions as reaction
  where reaction.user_id = (select auth.uid());
$function$;

revoke all on function private.my_reaction_post_ids() from public, anon, service_role;
grant execute on function private.my_reaction_post_ids() to authenticated;

create function public.my_reaction_post_ids()
returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $function$
  select * from private.my_reaction_post_ids();
$function$;

revoke all on function public.my_reaction_post_ids() from public, anon, service_role;
grant execute on function public.my_reaction_post_ids() to authenticated;

create function private.publish_post(p_post_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_post private.posts%rowtype;
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or p_reason is null or pg_catalog.btrim(p_reason) = ''
    or not (private.has_staff_role('admin') or private.has_staff_role('owner')) then
    return false;
  end if;

  select post_row.* into v_post
  from private.posts as post_row
  where post_row.id = p_post_id
  for update;

  if not found or v_post.status not in ('pending_review', 'approved') then
    return false;
  end if;
  if not exists (
    select 1 from private.areas as area
    where area.id = v_post.area_id and area.is_active
  ) then
    return false;
  end if;
  if v_post.risk_level = 'high' and not private.has_staff_role('owner') then
    return false;
  end if;

  update private.posts as post_row
  set status = 'published', published_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where post_row.id = p_post_id;

  perform private.sync_public_post_projection(p_post_id);
  insert into private.moderation_events (
    actor_user_id, post_id, action, reason, prior_state, next_state, risk_level
  ) values (
    v_actor, p_post_id, 'publish', pg_catalog.btrim(p_reason), v_post.status, 'published', v_post.risk_level
  );
  return true;
end;
$function$;

revoke all on function private.publish_post(uuid, text) from public, anon, service_role;
grant execute on function private.publish_post(uuid, text) to authenticated;

create function public.publish_post(p_post_id uuid, p_reason text)
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  select private.publish_post(p_post_id, p_reason);
$function$;

revoke all on function public.publish_post(uuid, text) from public, anon, service_role;
grant execute on function public.publish_post(uuid, text) to authenticated;

create function private.owner_post_action(p_post_id uuid, p_action text, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_post private.posts%rowtype;
  v_actor uuid := (select auth.uid());
  v_next_state text;
begin
  if v_actor is null or p_reason is null or pg_catalog.btrim(p_reason) = ''
    or p_action not in ('hide', 'restore', 'remove')
    or not private.has_staff_role('owner') then
    return false;
  end if;

  select post_row.* into v_post
  from private.posts as post_row
  where post_row.id = p_post_id
  for update;
  if not found then
    return false;
  end if;

  if p_action = 'hide' and v_post.status = 'published' then
    v_next_state := 'temporarily_hidden';
  elsif p_action = 'restore' and v_post.status = 'temporarily_hidden' then
    if not exists (
      select 1 from private.areas as area
      where area.id = v_post.area_id and area.is_active
    ) then
      return false;
    end if;
    v_next_state := 'published';
  elsif p_action = 'remove' and v_post.status in ('published', 'temporarily_hidden') then
    v_next_state := 'permanently_removed';
  else
    return false;
  end if;

  update private.posts as post_row
  set status = v_next_state,
      published_at = case when p_action = 'restore' then coalesce(post_row.published_at, pg_catalog.now()) else post_row.published_at end,
      updated_at = pg_catalog.now()
  where post_row.id = p_post_id;

  if p_action = 'restore' then
    perform private.sync_public_post_projection(p_post_id);
  else
    delete from public.published_previews as preview where preview.post_id = p_post_id;
    delete from public.reaction_counts as reaction_count where reaction_count.post_id = p_post_id;
  end if;

  insert into private.moderation_events (
    actor_user_id, post_id, action, reason, prior_state, next_state, risk_level
  ) values (
    v_actor, p_post_id, p_action, pg_catalog.btrim(p_reason), v_post.status, v_next_state, v_post.risk_level
  );
  return true;
end;
$function$;

revoke all on function private.owner_post_action(uuid, text, text) from public, anon, service_role;
grant execute on function private.owner_post_action(uuid, text, text) to authenticated;

create function public.hide_post(p_post_id uuid, p_reason text)
returns boolean language sql security invoker set search_path = ''
as $function$ select private.owner_post_action(p_post_id, 'hide', p_reason); $function$;
revoke all on function public.hide_post(uuid, text) from public, anon, service_role;
grant execute on function public.hide_post(uuid, text) to authenticated;

create function public.restore_post(p_post_id uuid, p_reason text)
returns boolean language sql security invoker set search_path = ''
as $function$ select private.owner_post_action(p_post_id, 'restore', p_reason); $function$;
revoke all on function public.restore_post(uuid, text) from public, anon, service_role;
grant execute on function public.restore_post(uuid, text) to authenticated;

create function public.remove_post(p_post_id uuid, p_reason text)
returns boolean language sql security invoker set search_path = ''
as $function$ select private.owner_post_action(p_post_id, 'remove', p_reason); $function$;
revoke all on function public.remove_post(uuid, text) from public, anon, service_role;
grant execute on function public.remove_post(uuid, text) to authenticated;

alter table public.published_previews enable row level security;
alter table public.reaction_counts enable row level security;

alter table private.areas enable row level security;
alter table private.tags enable row level security;
alter table private.posts enable row level security;
alter table private.post_tags enable row level security;
alter table private.aliases enable row level security;
alter table private.submissions enable row level security;
alter table private.submission_addenda enable row level security;
alter table private.submission_reviews enable row level security;
alter table private.evidence_metadata enable row level security;
alter table private.reactions enable row level security;
alter table private.moderation_events enable row level security;

create policy published_previews_public_read
  on public.published_previews for select to anon, authenticated using (true);
create policy reaction_counts_public_read
  on public.reaction_counts for select to anon, authenticated using (true);

create policy areas_staff_read
  on private.areas for select to authenticated
  using (private.has_staff_role('admin') or private.has_staff_role('owner'));
create policy tags_staff_read
  on private.tags for select to authenticated
  using (private.has_staff_role('admin') or private.has_staff_role('owner'));
create policy posts_published_or_staff_read
  on private.posts for select to authenticated
  using (
    (status = 'published' and exists (
      select 1 from private.areas as area where area.id = area_id and area.is_active
    ))
    or (risk_level <> 'high' and private.has_staff_role('admin'))
    or private.has_staff_role('owner')
  );
create policy post_tags_staff_read
  on private.post_tags for select to authenticated
  using (private.has_staff_role('admin') or private.has_staff_role('owner'));
create policy aliases_staff_read
  on private.aliases for select to authenticated
  using (private.has_staff_role('admin') or private.has_staff_role('owner'));
create policy submissions_owner_or_staff_read
  on private.submissions for select to authenticated
  using (submitter_id = (select auth.uid()) or private.has_staff_role('admin') or private.has_staff_role('owner'));
create policy submission_addenda_owner_or_staff_read
  on private.submission_addenda for select to authenticated
  using (submitter_id = (select auth.uid()) or private.has_staff_role('admin') or private.has_staff_role('owner'));
create policy submission_reviews_staff_read
  on private.submission_reviews for select to authenticated
  using (
    (risk_level <> 'high' and private.has_staff_role('admin'))
    or private.has_staff_role('owner')
  );
create policy evidence_metadata_staff_read
  on private.evidence_metadata for select to authenticated
  using (private.has_staff_role('admin') or private.has_staff_role('owner'));
create policy reactions_owner_all
  on private.reactions for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy moderation_events_staff_read
  on private.moderation_events for select to authenticated
  using (private.has_staff_role('admin') or private.has_staff_role('owner'));

grant usage on schema public to anon, authenticated;
revoke all on table public.published_previews from public, anon, authenticated, service_role;
revoke all on table public.reaction_counts from public, anon, authenticated, service_role;
grant select (post_id, approved_title, primary_name, public_excerpt, published_at, public_tag_ids, public_tag_labels, public_area_id, public_area_name, thumbnail_available)
  on table public.published_previews to anon, authenticated;
grant select (post_id, reaction_count) on table public.reaction_counts to anon, authenticated;

revoke all on table private.areas from public, anon, authenticated, service_role;
revoke all on table private.tags from public, anon, authenticated, service_role;
revoke all on table private.posts from public, anon, authenticated, service_role;
revoke all on table private.post_tags from public, anon, authenticated, service_role;
revoke all on table private.aliases from public, anon, authenticated, service_role;
revoke all on table private.submissions from public, anon, authenticated, service_role;
revoke all on table private.submission_addenda from public, anon, authenticated, service_role;
revoke all on table private.submission_reviews from public, anon, authenticated, service_role;
revoke all on table private.evidence_metadata from public, anon, authenticated, service_role;
revoke all on table private.reactions from public, anon, authenticated, service_role;
revoke all on table private.moderation_events from public, anon, authenticated, service_role;
