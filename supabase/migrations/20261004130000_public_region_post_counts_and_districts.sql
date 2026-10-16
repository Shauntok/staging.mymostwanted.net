-- Public region and child-area counts are aggregated from the reviewed public
-- projection only. This adds District as a browseable child-area type without
-- importing or inventing geographic boundaries or catalogue rows.
alter table private.areas drop constraint areas_type_valid;
alter table private.areas
  add constraint areas_type_valid check (area_type in ('state', 'city', 'district', 'independent_admin_area'));

create or replace function public.public_region_post_counts()
returns table (area_name text, public_post_count bigint)
language sql
stable
security definer
set search_path = ''
as $function$
  with recursive regions as (
    select area.id, area.area_name
    from private.areas as area
    where area.is_active
      and area.area_type in ('state', 'independent_admin_area')
  ), region_areas as (
    select region.id as region_id, region.id as area_id
    from regions as region
    union
    select region_areas.region_id, child.id
    from region_areas
    join private.areas as child on child.parent_area_id = region_areas.area_id
    where child.is_active
  )
  select region.area_name, count(preview.post_id)::bigint
  from regions as region
  join region_areas on region_areas.region_id = region.id
  left join public.published_previews as preview on preview.public_area_id = region_areas.area_id
  group by region.id, region.area_name
  order by region.area_name
$function$;

revoke all on function public.public_region_post_counts() from public, anon, authenticated, service_role;
grant execute on function public.public_region_post_counts() to anon, authenticated;

create or replace function public.public_child_area_post_counts(p_parent_area_name text)
returns table (area_id uuid, area_name text, public_post_count bigint)
language sql
stable
security definer
set search_path = ''
as $function$
  select child.id, child.area_name, count(preview.post_id)::bigint
  from private.areas as parent
  join private.areas as child on child.parent_area_id = parent.id
  left join public.published_previews as preview on preview.public_area_id = child.id
  where parent.is_active
    and parent.area_type in ('state', 'independent_admin_area')
    and parent.area_name = pg_catalog.left(pg_catalog.btrim(coalesce(p_parent_area_name, '')), 80)
    and child.is_active
    and child.area_type = 'district'
  group by child.id, child.area_name
  order by child.area_name, child.id
$function$;

revoke all on function public.public_child_area_post_counts(text) from public, anon, authenticated, service_role;
grant execute on function public.public_child_area_post_counts(text) to anon, authenticated;

-- Keep the established City RPC route working while allowing future, approved
-- District catalogue rows to use the same parent-ID checked public query.
create or replace function public.public_posts_for_city(
  p_city_id uuid,
  p_parent_area_name text,
  p_limit integer default 13,
  p_offset integer default 0
)
returns table (
  post_id uuid,
  approved_title text,
  primary_name text,
  public_excerpt text,
  last_listed_at timestamptz,
  public_tag_labels text[],
  public_area_name text
)
language sql
stable
security definer
set search_path = ''
as $function$
  with requested_area as (
    select child.id
    from private.areas as child
    join private.areas as parent on parent.id = child.parent_area_id
    where child.id = p_city_id
      and child.is_active
      and child.area_type in ('city', 'district')
      and parent.is_active
      and parent.area_type in ('state', 'independent_admin_area')
      and parent.area_name = pg_catalog.left(pg_catalog.btrim(coalesce(p_parent_area_name, '')), 80)
  ),
  parameters as (
    select least(greatest(coalesce(p_limit, 13), 1), 24) as result_limit,
           least(greatest(coalesce(p_offset, 0), 0), 1000000) as result_offset
  )
  select preview.post_id, preview.approved_title, preview.primary_name,
         preview.public_excerpt, preview.last_listed_at,
         preview.public_tag_labels, preview.public_area_name
  from public.published_previews as preview
  join requested_area on requested_area.id = preview.public_area_id
  cross join parameters
  order by preview.last_listed_at desc, preview.post_id
  limit (select parameters.result_limit from parameters)
  offset (select parameters.result_offset from parameters)
$function$;

revoke all on function public.public_posts_for_city(uuid, text, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.public_posts_for_city(uuid, text, integer, integer) to anon, authenticated;

-- Rollback: drop public.public_region_post_counts() and
-- public.public_child_area_post_counts(text), restore the previous
-- public.public_posts_for_city body, and restore areas_type_valid to its prior
-- state/city/independent_admin_area values after removing any District rows.
