-- Ensure consented route analytics rate-limit digests are purged even when a
-- visitor does not return and no later Page View request triggers cleanup.
-- This replaces the existing daily cleanup function without changing its job.
create or replace function private.purge_expired_valid_read_data()
returns bigint language plpgsql volatile security definer set search_path = ''
as $function$
declare v_deleted bigint := 0; v_rows bigint;
begin
  delete from private.analytics_valid_read_dedup
  where expires_at <= pg_catalog.clock_timestamp();
  get diagnostics v_rows = row_count; v_deleted := v_deleted + v_rows;

  delete from private.analytics_valid_read_hourly
  where read_hour < pg_catalog.date_trunc('hour',pg_catalog.clock_timestamp())-interval '30 days';
  get diagnostics v_rows = row_count; v_deleted := v_deleted + v_rows;

  delete from private.analytics_valid_read_rate_limits
  where last_seen_at < pg_catalog.clock_timestamp()-interval '48 hours';
  get diagnostics v_rows = row_count; v_deleted := v_deleted + v_rows;

  delete from private.analytics_page_view_rate_limits
  where last_seen_at < pg_catalog.clock_timestamp()-interval '48 hours';
  get diagnostics v_rows = row_count; v_deleted := v_deleted + v_rows;

  delete from private.analytics_page_views_daily
  where view_date < (pg_catalog.timezone('UTC',pg_catalog.clock_timestamp())-interval '13 months')::date;
  get diagnostics v_rows = row_count; v_deleted := v_deleted + v_rows;

  return v_deleted;
end
$function$;

revoke all on function private.purge_expired_valid_read_data() from public, anon, authenticated, service_role;
