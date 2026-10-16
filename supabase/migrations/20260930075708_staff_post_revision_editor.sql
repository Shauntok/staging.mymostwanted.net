-- Reviewed copy edits retain complete before/after snapshots and never modify
-- identity, geography, evidence, risk classification, or publication state.

create table private.post_revision_events (
  id bigint generated always as identity primary key,
  post_id uuid not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  reason text not null,
  before_value jsonb not null,
  after_value jsonb not null,
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint post_revision_reason_size check (
    pg_catalog.char_length(pg_catalog.btrim(reason)) between 1 and 1000
  )
);
create index post_revision_events_post_time_idx
  on private.post_revision_events (post_id, occurred_at desc, id desc);
alter table private.post_revision_events enable row level security;
revoke all on table private.post_revision_events from public, anon, authenticated, service_role;

create function private.reject_post_revision_event_mutation()
returns trigger language plpgsql set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE'
    and old.actor_user_id is not null
    and new.actor_user_id is null
    and (to_jsonb(old) - 'actor_user_id') = (to_jsonb(new) - 'actor_user_id') then
    return new;
  end if;
  raise exception 'post revision history is append-only' using errcode = '42501';
end;
$function$;
revoke all on function private.reject_post_revision_event_mutation() from public, anon, authenticated, service_role;
create trigger post_revision_events_append_only
  before update or delete on private.post_revision_events
  for each row execute function private.reject_post_revision_event_mutation();
create trigger post_revision_events_no_truncate
  before truncate on private.post_revision_events
  for each statement execute function private.reject_post_revision_event_mutation();

create function private.staff_list_posts_for_revision(p_search text default null)
returns table (post_id uuid, approved_title text, risk_level text, status text, updated_at timestamptz)
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  v_query text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_search, '')));
begin
  if (select auth.uid()) is null
    or (not private.has_staff_role('owner') and not private.has_staff_role('admin'))
    or not private.has_recent_totp() then
    raise exception 'Staff access and recent TOTP required' using errcode = '42501';
  end if;
  if pg_catalog.char_length(v_query) > 120 or (v_query <> '' and pg_catalog.char_length(v_query) < 3) then
    raise exception 'Search must be empty or between 3 and 120 characters' using errcode = '22023';
  end if;
  return query
  select post_row.id, post_row.approved_title, post_row.risk_level, post_row.status, post_row.updated_at
  from private.posts as post_row
  where post_row.status in ('published', 'temporarily_hidden')
    and (private.has_staff_role('owner') or post_row.risk_level <> 'high')
    and (v_query = '' or pg_catalog.strpos(pg_catalog.lower(post_row.approved_title), v_query) > 0)
  order by post_row.updated_at desc, post_row.id desc
  limit 100;
end;
$function$;
revoke all on function private.staff_list_posts_for_revision(text) from public, anon, service_role;
grant execute on function private.staff_list_posts_for_revision(text) to authenticated;
create function public.staff_list_posts_for_revision(p_search text default null)
returns table (post_id uuid, approved_title text, risk_level text, status text, updated_at timestamptz)
language sql volatile security invoker set search_path = ''
as $function$ select * from private.staff_list_posts_for_revision(p_search); $function$;
revoke all on function public.staff_list_posts_for_revision(text) from public, anon, service_role;
grant execute on function public.staff_list_posts_for_revision(text) to authenticated;

create function private.staff_get_post_for_revision(p_post_id uuid)
returns table (
  post_id uuid,
  approved_title text,
  public_excerpt text,
  full_body text,
  risk_level text,
  status text,
  tag_ids uuid[],
  tag_labels text[],
  active_tag_ids uuid[],
  active_tag_labels text[],
  primary_name text,
  area_name text,
  updated_at timestamptz
)
language plpgsql volatile security definer set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
    or p_post_id is null
    or (not private.has_staff_role('owner') and not private.has_staff_role('admin'))
    or not private.has_recent_totp() then
    raise exception 'Staff access and recent TOTP required' using errcode = '42501';
  end if;
  return query
  select post_row.id, post_row.approved_title, post_row.public_excerpt, post_row.full_body,
    post_row.risk_level, post_row.status,
    coalesce((select pg_catalog.array_agg(post_tag.tag_id order by tag_row.display_name, tag_row.id)
      from private.post_tags as post_tag join private.tags as tag_row on tag_row.id = post_tag.tag_id
      where post_tag.post_id = post_row.id), '{}'::uuid[]),
    coalesce((select pg_catalog.array_agg(tag_row.display_name order by tag_row.display_name, tag_row.id)
      from private.post_tags as post_tag join private.tags as tag_row on tag_row.id = post_tag.tag_id
      where post_tag.post_id = post_row.id), '{}'::text[]),
    coalesce((select pg_catalog.array_agg(tag_row.id order by tag_row.display_name, tag_row.id)
      from private.tags as tag_row where tag_row.is_active), '{}'::uuid[]),
    coalesce((select pg_catalog.array_agg(tag_row.display_name order by tag_row.display_name, tag_row.id)
      from private.tags as tag_row where tag_row.is_active), '{}'::text[]),
    post_row.primary_name, area.area_name, post_row.updated_at
  from private.posts as post_row
  join private.areas as area on area.id = post_row.area_id
  where post_row.id = p_post_id
    and post_row.status in ('published', 'temporarily_hidden')
    and (private.has_staff_role('owner') or post_row.risk_level <> 'high');
end;
$function$;
revoke all on function private.staff_get_post_for_revision(uuid) from public, anon, service_role;
grant execute on function private.staff_get_post_for_revision(uuid) to authenticated;
create function public.staff_get_post_for_revision(p_post_id uuid)
returns table (
  post_id uuid, approved_title text, public_excerpt text, full_body text, risk_level text, status text,
  tag_ids uuid[], tag_labels text[], active_tag_ids uuid[], active_tag_labels text[], primary_name text,
  area_name text, updated_at timestamptz
)
language sql volatile security invoker set search_path = ''
as $function$ select * from private.staff_get_post_for_revision(p_post_id); $function$;
revoke all on function public.staff_get_post_for_revision(uuid) from public, anon, service_role;
grant execute on function public.staff_get_post_for_revision(uuid) to authenticated;

create function private.staff_list_post_revision_history(p_post_id uuid, p_limit integer default 30)
returns table (id bigint, actor_username text, reason text, before_value jsonb, after_value jsonb, occurred_at timestamptz)
language plpgsql volatile security definer set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
    or p_post_id is null
    or (not private.has_staff_role('owner') and not private.has_staff_role('admin'))
    or not private.has_recent_totp() then
    raise exception 'Staff access and recent TOTP required' using errcode = '42501';
  end if;
  if not exists (select 1 from private.posts as post_row where post_row.id = p_post_id
    and (private.has_staff_role('owner') or post_row.risk_level <> 'high')) then
    return;
  end if;
  return query
  select event.id, profile.username, event.reason, event.before_value, event.after_value, event.occurred_at
  from private.post_revision_events as event
  left join public.profiles as profile on profile.id = event.actor_user_id
  where event.post_id = p_post_id
  order by event.occurred_at desc, event.id desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
end;
$function$;
revoke all on function private.staff_list_post_revision_history(uuid, integer) from public, anon, service_role;
grant execute on function private.staff_list_post_revision_history(uuid, integer) to authenticated;
create function public.staff_list_post_revision_history(p_post_id uuid, p_limit integer default 30)
returns table (id bigint, actor_username text, reason text, before_value jsonb, after_value jsonb, occurred_at timestamptz)
language sql volatile security invoker set search_path = ''
as $function$ select * from private.staff_list_post_revision_history(p_post_id, p_limit); $function$;
revoke all on function public.staff_list_post_revision_history(uuid, integer) from public, anon, service_role;
grant execute on function public.staff_list_post_revision_history(uuid, integer) to authenticated;

create function private.staff_save_post_revision(
  p_post_id uuid,
  p_expected_updated_at timestamptz,
  p_approved_title text,
  p_public_excerpt text,
  p_full_body text,
  p_tag_ids uuid[],
  p_reason text
)
returns bigint
language plpgsql security definer set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_post private.posts%rowtype;
  v_ids uuid[];
  v_before jsonb;
  v_after jsonb;
  v_event_id bigint;
  v_old_ids uuid[];
begin
  if v_actor is null
    or (not private.has_staff_role('owner') and not private.has_staff_role('admin'))
    or not private.has_recent_totp()
    or p_post_id is null
    or p_expected_updated_at is null
    or p_approved_title is null or pg_catalog.char_length(pg_catalog.btrim(p_approved_title)) not between 1 and 300
    or p_public_excerpt is null or pg_catalog.char_length(pg_catalog.btrim(p_public_excerpt)) not between 1 and 200
    or p_full_body is null or pg_catalog.char_length(pg_catalog.btrim(p_full_body)) not between 1 and 200000
    or pg_catalog.cardinality(coalesce(p_tag_ids, '{}'::uuid[])) > 30
    or pg_catalog.cardinality(coalesce(p_tag_ids, '{}'::uuid[])) <> (
      select pg_catalog.count(distinct selected.tag_id)::integer
      from pg_catalog.unnest(coalesce(p_tag_ids, '{}'::uuid[])) as selected(tag_id)
    )
    or p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) not between 1 and 1000 then
    raise exception 'Invalid revision request or staff access' using errcode = '22023';
  end if;
  select post_row.* into v_post from private.posts as post_row where post_row.id = p_post_id for update;
  if not found or v_post.status not in ('published', 'temporarily_hidden')
    or (v_post.risk_level = 'high' and not private.has_staff_role('owner')) then
    raise exception 'Post is unavailable for this reviewer' using errcode = '42501';
  end if;
  if (not private.has_staff_role('owner') and not private.has_staff_role('admin'))
    or not private.has_recent_totp()
    or (v_post.risk_level = 'high' and not private.has_staff_role('owner')) then
    raise exception 'Owner access and recent TOTP required' using errcode = '42501';
  end if;
  if v_post.updated_at is distinct from p_expected_updated_at then
    raise exception 'Post changed after it was opened; reload before saving' using errcode = '40001';
  end if;

  select coalesce(pg_catalog.array_agg(post_tag.tag_id order by post_tag.tag_id), '{}'::uuid[])
    into v_old_ids from private.post_tags as post_tag where post_tag.post_id = p_post_id;
  select coalesce(pg_catalog.array_agg(selected.tag_id order by selected.tag_id), '{}'::uuid[])
    into v_ids
  from (
    select requested.tag_id
    from pg_catalog.unnest(coalesce(p_tag_ids, '{}'::uuid[])) as requested(tag_id)
    union
    select post_tag.tag_id
    from private.post_tags as post_tag
    join private.tags as tag_row on tag_row.id = post_tag.tag_id
    where post_tag.post_id = p_post_id and not tag_row.is_active
  ) as selected;
  if pg_catalog.cardinality(v_ids) > 30 or exists (
    select 1 from pg_catalog.unnest(v_ids) as requested(tag_id)
    where not exists (
      select 1 from private.tags as tag_row
      where tag_row.id = requested.tag_id
        and (tag_row.is_active or requested.tag_id = any(v_old_ids))
    )
  ) then
    raise exception 'One or more tags are unavailable' using errcode = '22023';
  end if;
  v_before := pg_catalog.jsonb_build_object(
    'approved_title', v_post.approved_title,
    'public_excerpt', v_post.public_excerpt,
    'full_body', v_post.full_body,
    'tag_ids', v_old_ids,
    'tag_labels', coalesce((select pg_catalog.jsonb_agg(tag_row.display_name order by tag_row.display_name, tag_row.id)
      from private.post_tags as post_tag join private.tags as tag_row on tag_row.id = post_tag.tag_id
      where post_tag.post_id = p_post_id), '[]'::jsonb)
  );
  v_after := pg_catalog.jsonb_build_object(
    'approved_title', pg_catalog.btrim(p_approved_title),
    'public_excerpt', pg_catalog.btrim(p_public_excerpt),
    'full_body', p_full_body,
    'tag_ids', v_ids,
    'tag_labels', coalesce((select pg_catalog.jsonb_agg(tag_row.display_name order by tag_row.display_name, tag_row.id)
      from private.tags as tag_row where tag_row.id = any(v_ids)), '[]'::jsonb)
  );
  if v_before = v_after then
    raise exception 'No changes to save' using errcode = '22023';
  end if;

  update private.posts as post_row
  set approved_title = pg_catalog.btrim(p_approved_title),
      public_excerpt = pg_catalog.btrim(p_public_excerpt),
      full_body = p_full_body,
      updated_at = pg_catalog.clock_timestamp()
  where post_row.id = p_post_id;
  delete from private.post_tags as post_tag where post_tag.post_id = p_post_id;
  insert into private.post_tags (post_id, tag_id)
  select p_post_id, selected.tag_id from pg_catalog.unnest(v_ids) as selected(tag_id);
  perform private.sync_public_post_projection(p_post_id);

  insert into private.post_revision_events (post_id, actor_user_id, reason, before_value, after_value)
  values (p_post_id, v_actor, pg_catalog.btrim(p_reason), v_before, v_after)
  returning id into v_event_id;
  return v_event_id;
end;
$function$;
revoke all on function private.staff_save_post_revision(uuid, timestamptz, text, text, text, uuid[], text)
  from public, anon, authenticated, service_role;
grant execute on function private.staff_save_post_revision(uuid, timestamptz, text, text, text, uuid[], text) to authenticated;
create function public.staff_save_post_revision(
  p_post_id uuid, p_expected_updated_at timestamptz, p_approved_title text, p_public_excerpt text,
  p_full_body text, p_tag_ids uuid[], p_reason text
)
returns bigint language sql security invoker set search_path = ''
as $function$
  select private.staff_save_post_revision(
    p_post_id, p_expected_updated_at, p_approved_title, p_public_excerpt, p_full_body, p_tag_ids, p_reason
  );
$function$;
revoke all on function public.staff_save_post_revision(uuid, timestamptz, text, text, text, uuid[], text)
  from public, anon, service_role;
grant execute on function public.staff_save_post_revision(uuid, timestamptz, text, text, text, uuid[], text) to authenticated;
