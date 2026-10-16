begin;

-- Replace the one-argument overload so one-argument callers still use the
-- default offset while page callers can request the next ranked slice.
drop function if exists public.public_hot_ranked_posts(integer);

create function public.public_hot_ranked_posts(
  p_limit integer default 8,
  p_offset integer default 0
)
returns table(post_id uuid,valid_reads_24h bigint,hot_score numeric)
language plpgsql volatile security definer set search_path = '' as $function$
declare v_now timestamptz:=pg_catalog.clock_timestamp(); v_minimum integer;
begin
  if p_limit is null or p_limit not between 1 and 13 then raise exception 'unsupported result limit'; end if;
  if p_offset is null or p_offset not between 0 and 999996 then raise exception 'unsupported result offset'; end if;
  select s.minimum_reads_24h into v_minimum from private.analytics_valid_read_settings s where s.singleton and s.hot_enabled and s.collection_enabled;
  if not found then return; end if;
  return query with reads as (
    select h.post_id,
      pg_catalog.sum(h.valid_reads) filter(where h.read_hour>=v_now-interval '1 hour')::bigint reads_1h,
      pg_catalog.sum(h.valid_reads) filter(where h.read_hour>=v_now-interval '6 hours')::bigint reads_6h,
      pg_catalog.sum(h.valid_reads)::bigint reads_24h
    from private.analytics_valid_read_hourly h
    join private.posts p on p.id=h.post_id and p.status='published' and p.post_type='story'
    join private.areas a on a.id=p.area_id and a.is_active
    join public.published_previews pp on pp.post_id=p.id and pp.content_type='story'
    where h.read_hour>v_now-interval '24 hours' and h.read_hour<=v_now
    group by h.post_id
    having pg_catalog.sum(h.valid_reads)>=v_minimum
  )
  select r.post_id,r.reads_24h,(3*coalesce(r.reads_1h,0)+2*coalesce(r.reads_6h,0)+r.reads_24h)::numeric
  from reads r
  join private.posts p on p.id=r.post_id and p.status='published' and p.post_type='story'
  order by 3 desc,p.last_published_at desc nulls last,r.post_id
  limit p_limit offset p_offset;
end;
$function$;

revoke all on function public.public_hot_ranked_posts(integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.public_hot_ranked_posts(integer,integer) to anon,authenticated;

commit;
