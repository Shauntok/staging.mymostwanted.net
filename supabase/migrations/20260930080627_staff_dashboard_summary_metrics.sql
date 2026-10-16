-- Minimal staff homepage metrics. High-risk volume is never disclosed to Admin.

create function private.staff_dashboard_summary()
returns table (
  pending_submission_count bigint,
  high_risk_submission_count bigint,
  published_today_count bigint
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_is_owner boolean := private.has_staff_role('owner');
  v_today_malaysia timestamptz :=
    (((pg_catalog.clock_timestamp() at time zone 'Asia/Kuala_Lumpur')::date)::timestamp at time zone 'Asia/Kuala_Lumpur');
begin
  if (select auth.uid()) is null
    or (not v_is_owner and not private.has_staff_role('admin'))
    or not private.has_recent_totp() then
    raise exception 'Staff access and recent TOTP required' using errcode = '42501';
  end if;
  return query
  select
    (select pg_catalog.count(*) from private.submissions as submission
      where submission.status in ('received', 'reviewing', 'needs_more_information')
        and (v_is_owner or submission.risk_level <> 'high')),
    case when v_is_owner then
      (select pg_catalog.count(*) from private.submissions as submission
        where submission.status in ('received', 'reviewing', 'needs_more_information')
          and submission.risk_level = 'high')
      else null::bigint end,
    (select pg_catalog.count(*) from private.posts as post_row
      where post_row.status = 'published'
        and post_row.last_published_at >= v_today_malaysia
        and post_row.last_published_at < v_today_malaysia + interval '1 day');
end;
$function$;
revoke all on function private.staff_dashboard_summary() from public, anon, service_role;
grant execute on function private.staff_dashboard_summary() to authenticated;
create function public.staff_dashboard_summary()
returns table (
  pending_submission_count bigint,
  high_risk_submission_count bigint,
  published_today_count bigint
)
language sql volatile security invoker set search_path = ''
as $function$ select * from private.staff_dashboard_summary(); $function$;
revoke all on function public.staff_dashboard_summary() from public, anon, service_role;
grant execute on function public.staff_dashboard_summary() to authenticated;

-- Analysis remains inaccessible without a recent TOTP proof, even if the
-- staff dashboard session itself still has AAL2 claims.
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

  if (not private.has_staff_role('admin') and not private.has_staff_role('owner'))
    or not private.has_recent_totp() then
    raise exception 'Staff access and recent TOTP required' using errcode = '42501';
  end if;

  return query
  select daily.view_date, daily.route_key, daily.page_views
  from private.analytics_page_views_daily as daily
  where daily.view_date >= (pg_catalog.timezone('UTC', pg_catalog.clock_timestamp())::date - (p_days - 1))
    and daily.view_date <= pg_catalog.timezone('UTC', pg_catalog.clock_timestamp())::date
  order by daily.view_date desc, daily.route_key asc;
end;
$function$;
revoke all on function public.staff_analytics_daily_page_views(integer) from public, anon, service_role;
grant execute on function public.staff_analytics_daily_page_views(integer) to authenticated;
