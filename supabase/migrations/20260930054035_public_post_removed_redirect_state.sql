-- Public links to permanently removed records should return to the localized
-- homepage. Keep the lookup to one caller-supplied UUID and expose only a
-- boolean; hidden records and unknown UUIDs are deliberately indistinguishable.
create function private.post_is_permanently_removed(p_post_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_jwt_role text := (select auth.jwt() ->> 'role');
begin
  if p_post_id is null
    or v_jwt_role is null
    or v_jwt_role not in ('anon', 'authenticated')
    or (v_jwt_role = 'anon' and v_user_id is not null)
    or (v_jwt_role = 'authenticated' and v_user_id is null) then
    return false;
  end if;

  return exists (
    select 1
    from private.posts as post_row
    where post_row.id = p_post_id
      and post_row.status = 'permanently_removed'
  );
end;
$function$;

revoke all on function private.post_is_permanently_removed(uuid) from public, anon, authenticated, service_role;
grant execute on function private.post_is_permanently_removed(uuid) to anon, authenticated;

-- PostgREST exposes only the narrow public wrapper. It executes with the
-- caller's privileges; the private helper alone owns the minimal lookup.
create function public.post_is_permanently_removed(p_post_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select private.post_is_permanently_removed(p_post_id);
$function$;

revoke all on function public.post_is_permanently_removed(uuid) from public, anon, authenticated, service_role;
grant execute on function public.post_is_permanently_removed(uuid) to anon, authenticated;
