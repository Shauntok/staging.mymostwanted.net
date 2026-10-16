-- Expose only active City names beneath an active State or independent area.
-- The private catalogue stays unexposed; this SECURITY DEFINER function is a
-- narrow public projection with a pinned empty search_path and explicit grants.
create or replace function public.public_child_areas(p_parent_area_name text)
returns table (area_id uuid, area_name text)
language sql
stable
security definer
set search_path = ''
as $function$
  select child.id, child.area_name
  from private.areas as parent
  join private.areas as child on child.parent_area_id = parent.id
  where parent.is_active
    and parent.area_type in ('state', 'independent_admin_area')
    and parent.area_name = pg_catalog.left(pg_catalog.btrim(coalesce(p_parent_area_name, '')), 80)
    and child.is_active
    and child.area_type = 'city'
  order by child.area_name
$function$;

revoke all on function public.public_child_areas(text) from public, anon, authenticated, service_role;
grant execute on function public.public_child_areas(text) to anon, authenticated;

-- Use the City ID plus its parent name when narrowing results. City names can
-- repeat in different States, so selecting by name alone could mix areas.
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
    select city.id
    from private.areas as city
    join private.areas as parent on parent.id = city.parent_area_id
    where city.id = p_city_id
      and city.is_active
      and city.area_type = 'city'
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

-- Rollback: drop public.public_posts_for_city(uuid, text, integer, integer)
-- and public.public_child_areas(text).
