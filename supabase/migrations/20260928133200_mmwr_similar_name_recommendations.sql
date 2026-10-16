-- Fuzzy name lookup is an independent suggestion lane. The RPC returns only
-- public preview fields; approved aliases remain private match keys.
create extension if not exists pg_trgm with schema extensions;

create index if not exists published_previews_primary_name_trgm_idx
  on public.published_previews using gin (pg_catalog.lower(primary_name) extensions.gin_trgm_ops);

create index if not exists aliases_approved_text_trgm_idx
  on private.aliases using gin (pg_catalog.lower(alias_text) extensions.gin_trgm_ops)
  where state = 'approved';

create or replace function public.recommend_similar_published_previews(
  p_query text,
  p_exclude_ids uuid[] default array[]::uuid[],
  p_limit integer default 5
)
returns table (
  post_id uuid,
  approved_title text,
  primary_name text,
  public_area_name text
)
language sql stable security definer set search_path = ''
set pg_trgm.word_similarity_threshold = '0.38'
as $function$
  with parameters as (
    select nullif(pg_catalog.lower(pg_catalog.btrim(pg_catalog.left(coalesce(p_query, ''), 120))), '') as query_text,
           coalesce(p_exclude_ids, array[]::uuid[]) as exclude_ids,
           least(greatest(coalesce(p_limit, 5), 1), 5) as result_limit
  ),
  candidates as (
    select preview.post_id, preview.approved_title, preview.primary_name,
           preview.public_area_name,
           greatest(
             extensions.word_similarity(parameters.query_text, pg_catalog.lower(preview.primary_name)),
             coalesce(alias_matches.alias_score, 0::real)
           ) as match_score
    from public.published_previews as preview
    cross join parameters
    cross join lateral (
      select pg_catalog.max(extensions.word_similarity(
        parameters.query_text, pg_catalog.lower(alias.alias_text)
      )) as alias_score
      from private.aliases as alias
      where alias.post_id = preview.post_id
        and alias.state = 'approved'
        and parameters.query_text OPERATOR(extensions.<%) pg_catalog.lower(alias.alias_text)
    ) as alias_matches
    where pg_catalog.char_length(parameters.query_text) >= 4
      and not (preview.post_id = any(parameters.exclude_ids))
      and (
        parameters.query_text OPERATOR(extensions.<%) pg_catalog.lower(preview.primary_name)
        or exists (
          select 1 from private.aliases as fuzzy_alias
          where fuzzy_alias.post_id = preview.post_id
            and fuzzy_alias.state = 'approved'
            and parameters.query_text OPERATOR(extensions.<%) pg_catalog.lower(fuzzy_alias.alias_text)
        )
      )
      and pg_catalog.strpos(pg_catalog.lower(preview.primary_name), parameters.query_text) = 0
      and not exists (
        select 1 from private.aliases as matching_alias
        where matching_alias.post_id = preview.post_id
          and matching_alias.state = 'approved'
          and pg_catalog.strpos(pg_catalog.lower(matching_alias.alias_text), parameters.query_text) > 0
      )
  )
  select candidates.post_id, candidates.approved_title, candidates.primary_name,
         candidates.public_area_name
  from candidates
  order by candidates.match_score desc, candidates.post_id
  limit (select parameters.result_limit from parameters)
$function$;

revoke all on function public.recommend_similar_published_previews(text, uuid[], integer)
  from public, anon, authenticated, service_role;
grant execute on function public.recommend_similar_published_previews(text, uuid[], integer)
  to service_role;
