-- Aggregate only tags already present in the safe public post projection.
create or replace function public.public_tag_directory()
returns table (tag_id uuid, tag_label text, public_post_count bigint)
language sql stable security invoker set search_path = ''
as $function$
  select tag_ids.tag_id, tag_labels.tag_label, pg_catalog.count(distinct preview.post_id)::bigint
  from public.published_previews as preview
  cross join lateral pg_catalog.unnest(preview.public_tag_ids) with ordinality as tag_ids(tag_id, position)
  join lateral pg_catalog.unnest(preview.public_tag_labels) with ordinality as tag_labels(tag_label, position)
    on tag_labels.position = tag_ids.position
  where tag_labels.tag_label <> ''
  group by tag_ids.tag_id, tag_labels.tag_label
  order by pg_catalog.lower(tag_labels.tag_label), tag_ids.tag_id
$function$;

revoke all on function public.public_tag_directory() from public, anon, authenticated, service_role;
grant execute on function public.public_tag_directory() to anon, authenticated;
