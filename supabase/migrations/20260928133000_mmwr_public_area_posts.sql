-- Let the map browse a selected state and its active child areas without
-- exposing the private area catalogue or any non-public content fields.
create index if not exists areas_active_parent_idx
  on private.areas (parent_area_id, id)
  where is_active;

create index if not exists areas_active_type_name_idx
  on private.areas (area_type, area_name)
  where is_active;

create or replace function public.public_posts_for_area(
  p_area_name text,
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
  with recursive requested_area as (
    select area.id
    from private.areas as area
    where area.is_active
      and area.area_name = pg_catalog.left(pg_catalog.btrim(coalesce(p_area_name, '')), 80)
      and area.area_type in ('state', 'independent_admin_area')
  ),
  area_scope(area_id, depth) as (
    select requested_area.id, 0 from requested_area
    union all
    select child.id, parent.depth + 1
    from private.areas as child
    join area_scope as parent on parent.area_id = child.parent_area_id
    where child.is_active and parent.depth < 4
  ),
  parameters as (
    select least(greatest(coalesce(p_limit, 13), 1), 24) as result_limit,
           least(greatest(coalesce(p_offset, 0), 0), 1000000) as result_offset
  )
  select preview.post_id, preview.approved_title, preview.primary_name,
         preview.public_excerpt, preview.last_listed_at,
         preview.public_tag_labels, preview.public_area_name
  from public.published_previews as preview
  join area_scope on area_scope.area_id = preview.public_area_id
  cross join parameters
  order by preview.last_listed_at desc, preview.post_id
  limit (select parameters.result_limit from parameters)
  offset (select parameters.result_offset from parameters)
$function$;

revoke all on function public.public_posts_for_area(text, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.public_posts_for_area(text, integer, integer) to anon, authenticated;
