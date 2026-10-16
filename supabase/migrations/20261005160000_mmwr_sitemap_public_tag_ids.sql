-- Expose a unique, public-only tag ID list for indexable sitemap pages.
create or replace function public.public_sitemap_tag_ids()
returns table(tag_id uuid)
language sql
stable
security invoker
set search_path = ''
as $function$
  select distinct tag.tag_id
  from public.published_previews as preview
  cross join lateral pg_catalog.unnest(preview.public_tag_ids) as tag(tag_id)
  where tag.tag_id is not null
  order by tag.tag_id
$function$;

revoke all on function public.public_sitemap_tag_ids() from public, anon, authenticated, service_role;
grant execute on function public.public_sitemap_tag_ids() to anon, authenticated;
