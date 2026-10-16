-- Home-page tag spotlight, derived only from the public reviewed projection.
create or replace function public.public_home_tag_spotlight(p_limit integer default 12)
returns table (tag_id uuid, tag_label text, public_post_count bigint)
language sql
stable
security invoker
set search_path = ''
as $function$
  with tag_metrics as (
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
  popular_ranked as (
    select metrics.*, pg_catalog.row_number() over (
      order by metrics.public_post_count desc, metrics.last_active_at desc, pg_catalog.lower(metrics.tag_label), metrics.tag_id
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
      order by metrics.last_active_at desc, metrics.public_post_count asc, pg_catalog.lower(metrics.tag_label), metrics.tag_id
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
      order by metrics.public_post_count asc, metrics.last_active_at desc, pg_catalog.lower(metrics.tag_label), metrics.tag_id
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
  selected as (
    select tag_id, tag_label, public_post_count, segment, segment_rank from popular
    union all
    select tag_id, tag_label, public_post_count, segment, segment_rank from recent
    union all
    select tag_id, tag_label, public_post_count, segment, segment_rank from low_exposure
  ),
  filled as (
    select selected.tag_id, selected.tag_label, selected.public_post_count, selected.segment, selected.segment_rank
    from selected
    union all
    select ranked.tag_id, ranked.tag_label, ranked.public_post_count, 4 as segment, ranked.segment_rank
    from popular_ranked as ranked
    where not exists (select 1 from selected where selected.tag_id = ranked.tag_id)
  )
  select filled.tag_id, filled.tag_label, filled.public_post_count
  from filled
  order by filled.segment, filled.segment_rank, filled.tag_id
  limit least(greatest(coalesce(p_limit, 12), 1), 12)
$function$;

revoke all on function public.public_home_tag_spotlight(integer) from public, anon, authenticated, service_role;
grant execute on function public.public_home_tag_spotlight(integer) to anon, authenticated;
