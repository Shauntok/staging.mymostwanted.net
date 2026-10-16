-- Storage's managed metadata tables remain read-only and unchanged.

create function private.staff_get_storage_usage_summary()
returns table (
  evidence_object_count bigint,
  evidence_total_bytes numeric,
  thumbnail_object_count bigint,
  thumbnail_total_bytes numeric
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
    or not (private.has_staff_role('admin') or private.has_staff_role('owner'))
    or not private.has_recent_totp() then
    raise exception 'Staff access and recent TOTP required' using errcode = '42501';
  end if;

  return query
  select
    pg_catalog.count(*) filter (where object_row.bucket_id = 'mmwr-evidence-quarantine')::bigint,
    coalesce(pg_catalog.sum(
      case
        when object_row.metadata->>'size' ~ '^[0-9]{1,18}$'
          then (object_row.metadata->>'size')::numeric
        else 0::numeric
      end
    ) filter (where object_row.bucket_id = 'mmwr-evidence-quarantine'), 0::numeric),
    pg_catalog.count(*) filter (where object_row.bucket_id = 'mmwr-public-thumbnail-derivatives')::bigint,
    coalesce(pg_catalog.sum(
      case
        when object_row.metadata->>'size' ~ '^[0-9]{1,18}$'
          then (object_row.metadata->>'size')::numeric
        else 0::numeric
      end
    ) filter (where object_row.bucket_id = 'mmwr-public-thumbnail-derivatives'), 0::numeric)
  from storage.objects as object_row
  where object_row.bucket_id in ('mmwr-evidence-quarantine', 'mmwr-public-thumbnail-derivatives');
end;
$function$;

revoke all on function private.staff_get_storage_usage_summary() from public, anon, service_role;
grant execute on function private.staff_get_storage_usage_summary() to authenticated;

create function public.staff_get_storage_usage_summary()
returns table (
  evidence_object_count bigint,
  evidence_total_bytes numeric,
  thumbnail_object_count bigint,
  thumbnail_total_bytes numeric
)
language sql
volatile
security invoker
set search_path = ''
as $function$
  select * from private.staff_get_storage_usage_summary();
$function$;

revoke all on function public.staff_get_storage_usage_summary() from public, anon, service_role;
grant execute on function public.staff_get_storage_usage_summary() to authenticated;
