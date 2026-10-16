-- Staff-only read access to daily public-route aggregates. The underlying
-- tables remain private; callers never receive event-level or visitor data.
create or replace function public.staff_analytics_daily_page_views(p_days integer default 30)
returns table (
  view_date date,
  route_key text,
  page_views bigint
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if p_days is null or p_days not in (7, 30, 90) then
    raise exception 'unsupported date range';
  end if;

  if not private.has_staff_role('admin') and not private.has_staff_role('owner') then
    raise exception 'staff access required' using errcode = '42501';
  end if;

  return query
  select daily.view_date, daily.route_key, daily.page_views
  from private.analytics_page_views_daily as daily
  where daily.view_date >= (pg_catalog.timezone('UTC', pg_catalog.clock_timestamp())::date - (p_days - 1))
    and daily.view_date <= pg_catalog.timezone('UTC', pg_catalog.clock_timestamp())::date
  order by daily.view_date desc, daily.route_key asc;
end
$function$;

revoke all on function public.staff_analytics_daily_page_views(integer) from public, anon, service_role;
grant execute on function public.staff_analytics_daily_page_views(integer) to authenticated;
