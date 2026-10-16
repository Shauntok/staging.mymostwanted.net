-- Keep Owner lifecycle actions protected at the database boundary, even when
-- a caller bypasses the UI and invokes the public RPC directly.
create or replace function private.owner_post_action(p_post_id uuid, p_action text, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_post private.posts%rowtype;
  v_actor uuid := (select auth.uid());
  v_next_state text;
  v_now timestamptz;
begin
  if v_actor is null
    or p_post_id is null
    or p_reason is null
    or pg_catalog.btrim(p_reason) = ''
    or pg_catalog.char_length(p_reason) > 500
    or p_action not in ('hide', 'restore', 'remove')
    or not private.has_staff_role('owner')
    or not private.has_recent_totp() then
    return false;
  end if;

  select post_row.* into v_post
  from private.posts as post_row
  where post_row.id = p_post_id
  for update;
  if not found
    or not private.has_staff_role('owner')
    or not private.has_recent_totp() then
    return false;
  end if;
  v_now := pg_catalog.clock_timestamp();

  if p_action = 'hide' and v_post.status = 'published' then
    v_next_state := 'temporarily_hidden';
  elsif p_action = 'restore' and v_post.status = 'temporarily_hidden' then
    if not exists (
      select 1 from private.areas as area
      where area.id = v_post.area_id and area.is_active
    ) then
      return false;
    end if;
    v_next_state := 'published';
  elsif p_action = 'remove' and v_post.status in ('published', 'temporarily_hidden') then
    v_next_state := 'permanently_removed';
  else
    return false;
  end if;

  update private.posts as post_row
  set status = v_next_state,
      last_published_at = case when p_action = 'restore' then v_now else post_row.last_published_at end,
      updated_at = v_now
  where post_row.id = p_post_id;

  insert into private.moderation_events (
    actor_user_id, post_id, action, reason, prior_state, next_state, risk_level, occurred_at
  ) values (
    v_actor, p_post_id, p_action, pg_catalog.btrim(p_reason), v_post.status, v_next_state, v_post.risk_level, v_now
  );
  return true;
end;
$function$;

revoke all on function private.owner_post_action(uuid, text, text) from public, anon, service_role;
grant execute on function private.owner_post_action(uuid, text, text) to authenticated;

create function private.owner_list_post_lifecycle(p_search text default null)
returns table (
  post_id uuid,
  approved_title text,
  primary_name text,
  area_name text,
  status text,
  last_published_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_search text := nullif(pg_catalog.btrim(coalesce(p_search, '')), '');
begin
  if (select auth.uid()) is null
    or not private.has_staff_role('owner')
    or (v_search is not null and pg_catalog.char_length(v_search) not between 3 and 120) then
    return;
  end if;

  return query
  select post_row.id,
         post_row.approved_title,
         post_row.primary_name,
         area.area_name,
         post_row.status,
         post_row.last_published_at
  from private.posts as post_row
  join private.areas as area on area.id = post_row.area_id
  where post_row.status in ('published', 'temporarily_hidden')
    and (
      v_search is null
      or pg_catalog.strpos(pg_catalog.lower(post_row.approved_title), pg_catalog.lower(v_search)) > 0
      or pg_catalog.strpos(pg_catalog.lower(post_row.primary_name), pg_catalog.lower(v_search)) > 0
      or pg_catalog.strpos(pg_catalog.lower(area.area_name), pg_catalog.lower(v_search)) > 0
    )
  order by post_row.updated_at desc, post_row.id
  limit 100;
end;
$function$;

revoke all on function private.owner_list_post_lifecycle(text) from public, anon, authenticated, service_role;
grant execute on function private.owner_list_post_lifecycle(text) to authenticated;

create function public.owner_list_post_lifecycle(p_search text default null)
returns table (
  post_id uuid,
  approved_title text,
  primary_name text,
  area_name text,
  status text,
  last_published_at timestamptz
)
language sql
volatile
security invoker
set search_path = ''
as $function$
  select * from private.owner_list_post_lifecycle(p_search);
$function$;

revoke all on function public.owner_list_post_lifecycle(text) from public, anon, service_role;
grant execute on function public.owner_list_post_lifecycle(text) to authenticated;
