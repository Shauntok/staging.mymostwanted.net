-- Search safe public fields and use approved aliases only as hidden lookup keys.
-- Alias text/source, review material and source submissions are never returned.
create or replace function public.search_published_previews(
  p_query text,
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
language sql stable security definer set search_path = ''
as $function$
  with parameters as (
    select case when pg_catalog.char_length(normalized.query_text) >= 2 then normalized.query_text end as query_text,
           least(greatest(coalesce(p_limit, 13), 1), 24) as result_limit,
           greatest(coalesce(p_offset, 0), 0) as result_offset
    from (
      select nullif(pg_catalog.lower(pg_catalog.btrim(pg_catalog.left(coalesce(p_query, ''), 120))), '') as query_text
    ) as normalized
  ),
  matched as (
    select preview.post_id, preview.approved_title, preview.primary_name,
           preview.public_excerpt, preview.last_listed_at, preview.public_tag_labels,
           preview.public_area_name,
           case
             when pg_catalog.lower(preview.primary_name) = parameters.query_text then 1
             when exists (
               select 1 from private.aliases as alias
               where alias.post_id = preview.post_id and alias.state = 'approved'
                 and pg_catalog.lower(alias.alias_text) = parameters.query_text
             ) then 2
             when pg_catalog.lower(preview.approved_title) = parameters.query_text then 3
             when pg_catalog.lower(preview.public_area_name) = parameters.query_text then 4
             when exists (
               select 1 from pg_catalog.unnest(preview.public_tag_labels) as tag(label)
               where pg_catalog.lower(tag.label) = parameters.query_text
             ) then 5
             when pg_catalog.strpos(pg_catalog.lower(preview.primary_name), parameters.query_text) > 0 then 6
             when exists (
               select 1 from private.aliases as alias
               where alias.post_id = preview.post_id and alias.state = 'approved'
                 and pg_catalog.strpos(pg_catalog.lower(alias.alias_text), parameters.query_text) > 0
             ) then 7
             when pg_catalog.strpos(pg_catalog.lower(preview.approved_title), parameters.query_text) > 0 then 8
             when pg_catalog.strpos(pg_catalog.lower(preview.public_area_name), parameters.query_text) > 0 then 9
             when exists (
               select 1 from pg_catalog.unnest(preview.public_tag_labels) as tag(label)
               where pg_catalog.strpos(pg_catalog.lower(tag.label), parameters.query_text) > 0
             ) then 10
             else 11
           end as match_tier
    from public.published_previews as preview
    cross join parameters
    where parameters.query_text is not null and (
      pg_catalog.strpos(pg_catalog.lower(preview.primary_name), parameters.query_text) > 0
      or exists (
        select 1 from private.aliases as alias
        where alias.post_id = preview.post_id and alias.state = 'approved'
          and pg_catalog.strpos(pg_catalog.lower(alias.alias_text), parameters.query_text) > 0
      )
      or pg_catalog.strpos(pg_catalog.lower(preview.approved_title), parameters.query_text) > 0
      or pg_catalog.strpos(pg_catalog.lower(preview.public_excerpt), parameters.query_text) > 0
      or pg_catalog.strpos(pg_catalog.lower(preview.public_area_name), parameters.query_text) > 0
      or exists (
        select 1 from pg_catalog.unnest(preview.public_tag_labels) as tag(label)
        where pg_catalog.strpos(pg_catalog.lower(tag.label), parameters.query_text) > 0
      )
    )
  )
  select matched.post_id, matched.approved_title, matched.primary_name,
         matched.public_excerpt, matched.last_listed_at, matched.public_tag_labels,
         matched.public_area_name
  from matched cross join parameters
  order by matched.match_tier, matched.last_listed_at desc, matched.post_id
  limit (select parameters.result_limit from parameters)
  offset (select parameters.result_offset from parameters)
$function$;

revoke all on function public.search_published_previews(text, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.search_published_previews(text, integer, integer) to anon, authenticated;
