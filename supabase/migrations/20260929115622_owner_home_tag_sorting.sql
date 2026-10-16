-- Owner-controlled ordering for the twelve public homepage Tag slots.
-- Only the non-sensitive display preference is exposed to anonymous readers.

create table public.home_tag_settings (
  singleton smallint primary key default 1,
  sort_mode text not null default 'smart_mix',
  manual_tag_ids uuid[] not null default '{}'::uuid[],
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint home_tag_settings_singleton check (singleton = 1),
  constraint home_tag_settings_sort_mode check (sort_mode in ('manual', 'most_posts', 'smart_mix')),
  constraint home_tag_settings_manual_limit check (pg_catalog.cardinality(manual_tag_ids) <= 12)
);

insert into public.home_tag_settings (singleton, sort_mode, manual_tag_ids)
values (1, 'smart_mix', '{}'::uuid[])
on conflict (singleton) do nothing;

alter table public.home_tag_settings enable row level security;
revoke all on table public.home_tag_settings from public, anon, authenticated, service_role;
grant select on table public.home_tag_settings to anon, authenticated;

create policy home_tag_settings_public_read
  on public.home_tag_settings for select to anon, authenticated
  using (true);

comment on table public.home_tag_settings is
  'Non-sensitive homepage Tag order preference. Writes are restricted to the Owner TOTP RPC; public reads expose no private tag or user data.';

create table private.home_tag_settings_audit (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users (id) on delete set null,
  old_sort_mode text not null,
  new_sort_mode text not null,
  old_manual_tag_ids uuid[] not null,
  new_manual_tag_ids uuid[] not null,
  reason text not null,
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint home_tag_settings_audit_old_mode check (old_sort_mode in ('manual', 'most_posts', 'smart_mix')),
  constraint home_tag_settings_audit_new_mode check (new_sort_mode in ('manual', 'most_posts', 'smart_mix')),
  constraint home_tag_settings_audit_reason check (pg_catalog.btrim(reason) <> '' and pg_catalog.char_length(reason) <= 500)
);

create index home_tag_settings_audit_occurred_idx
  on private.home_tag_settings_audit (occurred_at desc);

alter table private.home_tag_settings_audit enable row level security;
revoke all on table private.home_tag_settings_audit from public, anon, authenticated, service_role;
grant select on table private.home_tag_settings_audit to authenticated;

create policy home_tag_settings_audit_owner_read
  on private.home_tag_settings_audit for select to authenticated
  using (private.has_staff_role('owner'));

create function private.owner_get_home_tag_settings()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if (select auth.uid()) is null
    or (select auth.jwt() ->> 'aal') is distinct from 'aal2'
    or not private.has_staff_role('owner') then
    raise exception 'Owner access required' using errcode = '42501';
  end if;

  select pg_catalog.jsonb_build_object(
    'sort_mode', settings.sort_mode,
    'manual_tag_ids', settings.manual_tag_ids,
    'tags', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'tag_id', metrics.tag_id,
          'tag_label', metrics.tag_label,
          'public_post_count', metrics.public_post_count
        ) order by pg_catalog.lower(metrics.tag_label), metrics.tag_id
      )
      from (
        select tag_ids.tag_id, tag_labels.tag_label,
          pg_catalog.count(distinct preview.post_id)::bigint as public_post_count
        from public.published_previews as preview
        cross join lateral pg_catalog.unnest(preview.public_tag_ids) with ordinality as tag_ids(tag_id, position)
        join lateral pg_catalog.unnest(preview.public_tag_labels) with ordinality as tag_labels(tag_label, position)
          on tag_labels.position = tag_ids.position
        where tag_labels.tag_label <> ''
        group by tag_ids.tag_id, tag_labels.tag_label
      ) as metrics
    ), '[]'::jsonb)
  ) into v_result
  from public.home_tag_settings as settings
  where settings.singleton = 1;

  return v_result;
end;
$function$;

revoke all on function private.owner_get_home_tag_settings() from public, anon, service_role;
grant execute on function private.owner_get_home_tag_settings() to authenticated;

create function public.owner_get_home_tag_settings()
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $function$
  select private.owner_get_home_tag_settings();
$function$;

revoke all on function public.owner_get_home_tag_settings() from public, anon, service_role;
grant execute on function public.owner_get_home_tag_settings() to authenticated;

create function private.owner_update_home_tag_settings(
  p_sort_mode text,
  p_manual_tag_ids uuid[],
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_old_mode text;
  v_old_manual_ids uuid[];
  v_manual_ids uuid[] := coalesce(p_manual_tag_ids, '{}'::uuid[]);
begin
  if v_actor_user_id is null
    or p_sort_mode is null
    or p_sort_mode not in ('manual', 'most_posts', 'smart_mix')
    or pg_catalog.cardinality(v_manual_ids) > 12
    or p_reason is null
    or pg_catalog.btrim(p_reason) = ''
    or pg_catalog.char_length(p_reason) > 500
    or not private.has_staff_role('owner')
    or not private.has_recent_totp() then
    return false;
  end if;

  if pg_catalog.cardinality(v_manual_ids) <> (
    select pg_catalog.count(distinct selected.tag_id)::integer
    from pg_catalog.unnest(v_manual_ids) as selected(tag_id)
  ) then
    return false;
  end if;

  -- A manual selection may contain only tags that currently occur in reviewed,
  -- published previews. Hidden, removed and private-only tags are rejected.
  if exists (
    select 1
    from pg_catalog.unnest(v_manual_ids) as selected(tag_id)
    where not exists (
      select 1
      from public.published_previews as preview
      cross join lateral pg_catalog.unnest(preview.public_tag_ids) as visible(tag_id)
      where visible.tag_id = selected.tag_id
    )
  ) then
    return false;
  end if;

  select settings.sort_mode, settings.manual_tag_ids
    into v_old_mode, v_old_manual_ids
  from public.home_tag_settings as settings
  where settings.singleton = 1
  for update;

  if not found then
    return false;
  end if;

  if v_old_mode is distinct from p_sort_mode or v_old_manual_ids is distinct from v_manual_ids then
    update public.home_tag_settings
    set sort_mode = p_sort_mode,
        manual_tag_ids = v_manual_ids,
        updated_at = pg_catalog.clock_timestamp()
    where singleton = 1;

    insert into private.home_tag_settings_audit (
      actor_user_id, old_sort_mode, new_sort_mode,
      old_manual_tag_ids, new_manual_tag_ids, reason
    ) values (
      v_actor_user_id, v_old_mode, p_sort_mode,
      v_old_manual_ids, v_manual_ids, pg_catalog.btrim(p_reason)
    );
  end if;

  return true;
end;
$function$;

revoke all on function private.owner_update_home_tag_settings(text, uuid[], text) from public, anon, service_role;
grant execute on function private.owner_update_home_tag_settings(text, uuid[], text) to authenticated;

create function public.owner_update_home_tag_settings(
  p_sort_mode text,
  p_manual_tag_ids uuid[],
  p_reason text
)
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  select private.owner_update_home_tag_settings(p_sort_mode, p_manual_tag_ids, p_reason);
$function$;

revoke all on function public.owner_update_home_tag_settings(text, uuid[], text) from public, anon, service_role;
grant execute on function public.owner_update_home_tag_settings(text, uuid[], text) to authenticated;

create or replace function public.public_home_tag_spotlight(p_limit integer default 12)
returns table (tag_id uuid, tag_label text, public_post_count bigint)
language sql
stable
security invoker
set search_path = ''
as $function$
  with settings as (
    select sort_mode, manual_tag_ids
    from public.home_tag_settings
    where singleton = 1
  ),
  tag_metrics as (
    select tag_ids.tag_id, tag_labels.tag_label,
      pg_catalog.count(distinct preview.post_id)::bigint as public_post_count,
      pg_catalog.max(preview.last_listed_at) as last_active_at
    from public.published_previews as preview
    cross join lateral pg_catalog.unnest(preview.public_tag_ids) with ordinality as tag_ids(tag_id, position)
    join lateral pg_catalog.unnest(preview.public_tag_labels) with ordinality as tag_labels(tag_label, position)
      on tag_labels.position = tag_ids.position
    where tag_labels.tag_label <> ''
    group by tag_ids.tag_id, tag_labels.tag_label
  ),
  most_posts_ranked as (
    select metrics.*, pg_catalog.row_number() over (
      order by metrics.public_post_count desc, metrics.last_active_at desc,
        pg_catalog.lower(metrics.tag_label), metrics.tag_id
    ) as selection_rank
    from tag_metrics as metrics
  ),
  popular_ranked as (
    select metrics.*, pg_catalog.row_number() over (
      order by metrics.public_post_count desc, metrics.last_active_at desc,
        pg_catalog.lower(metrics.tag_label), metrics.tag_id
    ) as segment_rank
    from tag_metrics as metrics
  ),
  popular as (
    select ranked.*, 1 as segment
    from popular_ranked as ranked
    where ranked.segment_rank <= 4
  ),
  recent_ranked as (
    select metrics.*, pg_catalog.row_number() over (
      order by metrics.last_active_at desc, metrics.public_post_count asc,
        pg_catalog.lower(metrics.tag_label), metrics.tag_id
    ) as segment_rank
    from tag_metrics as metrics
    where not exists (select 1 from popular where popular.tag_id = metrics.tag_id)
  ),
  recent as (
    select ranked.*, 2 as segment
    from recent_ranked as ranked
    where ranked.segment_rank <= 4
  ),
  low_exposure_ranked as (
    select metrics.*, pg_catalog.row_number() over (
      order by metrics.public_post_count asc, metrics.last_active_at desc,
        pg_catalog.lower(metrics.tag_label), metrics.tag_id
    ) as segment_rank
    from tag_metrics as metrics
    where not exists (select 1 from popular where popular.tag_id = metrics.tag_id)
      and not exists (select 1 from recent where recent.tag_id = metrics.tag_id)
  ),
  low_exposure as (
    select ranked.*, 3 as segment
    from low_exposure_ranked as ranked
    where ranked.segment_rank <= 4
  ),
  smart_selected as (
    select tag_id, tag_label, public_post_count, segment, segment_rank from popular
    union all
    select tag_id, tag_label, public_post_count, segment, segment_rank from recent
    union all
    select tag_id, tag_label, public_post_count, segment, segment_rank from low_exposure
  ),
  smart_filled as (
    select selected.tag_id, selected.tag_label, selected.public_post_count, selected.segment, selected.segment_rank
    from smart_selected as selected
    union all
    select ranked.tag_id, ranked.tag_label, ranked.public_post_count, 4 as segment, ranked.segment_rank
    from popular_ranked as ranked
    where not exists (select 1 from smart_selected as selected where selected.tag_id = ranked.tag_id)
  ),
  manual_selected as (
    select metrics.tag_id, metrics.tag_label, metrics.public_post_count,
      0 as segment, selected.position::bigint as selection_rank
    from settings
    cross join lateral pg_catalog.unnest(settings.manual_tag_ids) with ordinality as selected(tag_id, position)
    join tag_metrics as metrics on metrics.tag_id = selected.tag_id
    where settings.sort_mode = 'manual'
  ),
  manual_filled as (
    select selected.tag_id, selected.tag_label, selected.public_post_count, selected.segment, selected.selection_rank
    from manual_selected as selected
    union all
    select ranked.tag_id, ranked.tag_label, ranked.public_post_count, 1 as segment, ranked.selection_rank
    from most_posts_ranked as ranked
    where not exists (select 1 from manual_selected as selected where selected.tag_id = ranked.tag_id)
  ),
  mode_selected as (
    select filled.tag_id, filled.tag_label, filled.public_post_count,
      filled.segment::bigint as sort_group, filled.segment_rank as sort_rank
    from smart_filled as filled
    cross join settings
    where settings.sort_mode = 'smart_mix'
    union all
    select ranked.tag_id, ranked.tag_label, ranked.public_post_count,
      0::bigint as sort_group, ranked.selection_rank as sort_rank
    from most_posts_ranked as ranked
    cross join settings
    where settings.sort_mode = 'most_posts'
    union all
    select filled.tag_id, filled.tag_label, filled.public_post_count,
      filled.segment::bigint as sort_group, filled.selection_rank as sort_rank
    from manual_filled as filled
    cross join settings
    where settings.sort_mode = 'manual'
  )
  select selected.tag_id, selected.tag_label, selected.public_post_count
  from mode_selected as selected
  order by selected.sort_group, selected.sort_rank, selected.tag_id
  limit least(greatest(coalesce(p_limit, 12), 1), 12)
$function$;

revoke all on function public.public_home_tag_spotlight(integer) from public, anon, authenticated, service_role;
grant execute on function public.public_home_tag_spotlight(integer) to anon, authenticated;
