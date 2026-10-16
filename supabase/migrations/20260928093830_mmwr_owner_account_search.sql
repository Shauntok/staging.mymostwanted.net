-- A narrowly scoped Owner lookup for role administration. Never returns email,
-- display names, account metadata, submissions, or evidence.
create function public.has_staff_role(p_role text)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $function$
  select private.has_staff_role(p_role);
$function$;

revoke all on function public.has_staff_role(text) from public, anon, service_role;
grant execute on function public.has_staff_role(text) to authenticated;

create function private.owner_search_accounts(p_username_query text)
returns table (
  user_id uuid,
  username text,
  roles text[]
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_query text := pg_catalog.lower(pg_catalog.btrim(p_username_query));
begin
  if (select auth.uid()) is null
    or not private.has_staff_role('owner')
    or v_query is null
    or pg_catalog.char_length(v_query) < 3
    or pg_catalog.char_length(v_query) > 24 then
    return;
  end if;

  return query
  select profile.id, profile.username,
    coalesce(
      pg_catalog.array_agg(user_role.role order by user_role.role)
        filter (where user_role.role is not null),
      array[]::text[]
    ) as roles
  from public.profiles as profile
  left join private.user_roles as user_role on user_role.user_id = profile.id
  where profile.account_state = 'active'
    and pg_catalog.strpos(pg_catalog.lower(profile.username), v_query) > 0
  group by profile.id, profile.username
  order by profile.username
  limit 25;
end;
$function$;

revoke all on function private.owner_search_accounts(text) from public, anon, service_role;
grant execute on function private.owner_search_accounts(text) to authenticated;

create function public.owner_search_accounts(p_username_query text)
returns table (
  user_id uuid,
  username text,
  roles text[]
)
language sql
volatile
security invoker
set search_path = ''
as $function$
  select * from private.owner_search_accounts(p_username_query);
$function$;

revoke all on function public.owner_search_accounts(text) from public, anon, service_role;
grant execute on function public.owner_search_accounts(text) to authenticated;
