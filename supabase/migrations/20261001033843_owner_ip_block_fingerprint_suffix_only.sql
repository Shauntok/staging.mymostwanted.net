-- The Owner UI displays only the last eight fingerprint characters. Do not
-- send the full keyed digest through PostgREST to the browser.

-- Replace dependent wrappers in dependency order because PostgreSQL does not
-- allow CREATE OR REPLACE to rename a TABLE output column.
drop function public.owner_list_ip_blocks();
drop function private.owner_list_ip_blocks();

create function private.owner_list_ip_blocks()
returns table (
  block_id uuid,
  fingerprint_suffix text,
  reason text,
  actor_username text,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql volatile security definer set search_path = ''
as $function$
begin
  if not private.has_staff_role('owner') or not private.has_recent_totp() then
    raise exception 'Owner access and recent TOTP required' using errcode = '42501';
  end if;

  return query
  select
    block.id,
    pg_catalog.right(block.fingerprint, 8),
    block.reason,
    profile.username,
    block.created_at,
    block.expires_at
  from private.owner_ip_blocks as block
  left join public.profiles as profile on profile.id = block.actor_user_id
  where block.expires_at > pg_catalog.clock_timestamp()
  order by block.created_at desc, block.id desc
  limit 100;
end;
$function$;

revoke all on function private.owner_list_ip_blocks() from public, anon, service_role;
grant execute on function private.owner_list_ip_blocks() to authenticated;

create function public.owner_list_ip_blocks()
returns table (
  block_id uuid,
  fingerprint_suffix text,
  reason text,
  actor_username text,
  created_at timestamptz,
  expires_at timestamptz
)
language sql volatile security invoker set search_path = ''
as $function$
  select * from private.owner_list_ip_blocks();
$function$;

revoke all on function public.owner_list_ip_blocks() from public, anon, service_role;
grant execute on function public.owner_list_ip_blocks() to authenticated;
