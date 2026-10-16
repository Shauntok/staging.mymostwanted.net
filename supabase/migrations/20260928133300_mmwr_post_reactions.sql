-- Keep one reaction per account and post while allowing an explicit choice.
alter table private.reactions
  add column reaction_type text not null default 'helpful',
  add constraint reactions_type_valid check (reaction_type in ('helpful', 'thanks', 'support'));

create index reactions_post_type_idx on private.reactions (post_id, reaction_type);

create function public.toggle_my_post_reaction(p_post_id uuid, p_reaction_type text)
returns table (accepted boolean, selected_reaction text)
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_account_state text;
  v_locked_user_id uuid;
  v_post_status text;
  v_area_active boolean;
  v_existing_type text;
begin
  if v_user_id is null or p_reaction_type not in ('helpful', 'thanks', 'support') then
    return query select false, null::text;
    return;
  end if;

  select auth_user.id into v_locked_user_id
  from auth.users as auth_user where auth_user.id = v_user_id for key share;
  if not found then
    return query select false, null::text;
    return;
  end if;

  select post_row.status, area.is_active
    into v_post_status, v_area_active
  from private.posts as post_row
  left join private.areas as area on area.id = post_row.area_id
  where post_row.id = p_post_id
  for update of post_row;
  if not found or v_post_status <> 'published' or v_area_active is distinct from true
    or not exists (select 1 from public.published_previews as preview where preview.post_id = p_post_id) then
    return query select false, null::text;
    return;
  end if;

  select profile.account_state into v_account_state
  from public.profiles as profile where profile.id = v_user_id;
  if v_account_state is distinct from 'active' then
    return query select false, null::text;
    return;
  end if;

  select reaction.reaction_type into v_existing_type
  from private.reactions as reaction
  where reaction.user_id = v_user_id and reaction.post_id = p_post_id
  for update;

  if found and v_existing_type = p_reaction_type then
    delete from private.reactions as reaction
    where reaction.user_id = v_user_id and reaction.post_id = p_post_id;
    return query select true, null::text;
  elsif found then
    update private.reactions as reaction
    set reaction_type = p_reaction_type
    where reaction.user_id = v_user_id and reaction.post_id = p_post_id;
    return query select true, p_reaction_type;
  else
    insert into private.reactions (user_id, post_id, reaction_type)
    values (v_user_id, p_post_id, p_reaction_type);
    return query select true, p_reaction_type;
  end if;
end
$function$;

revoke all on function public.toggle_my_post_reaction(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.toggle_my_post_reaction(uuid, text) to authenticated;

-- Only aggregate counts and the caller's own selected state are exposed.
create function public.public_reaction_breakdown(p_post_id uuid)
returns table (reaction_type text, reaction_count bigint, selected_by_viewer boolean)
language sql stable security definer set search_path = ''
as $function$
  with reaction_kinds(reaction_type) as (
    values ('helpful'::text), ('thanks'::text), ('support'::text)
  )
  select kinds.reaction_type,
         (select pg_catalog.count(*)::bigint
          from private.reactions as total
          where total.post_id = p_post_id and total.reaction_type = kinds.reaction_type),
         exists (
          select 1 from private.reactions as mine
          where mine.post_id = p_post_id
            and mine.user_id = (select auth.uid())
            and mine.reaction_type = kinds.reaction_type
         )
  from reaction_kinds as kinds
  where exists (select 1 from public.published_previews as preview where preview.post_id = p_post_id)
  order by kinds.reaction_type
$function$;

revoke all on function public.public_reaction_breakdown(uuid) from public, anon, authenticated, service_role;
grant execute on function public.public_reaction_breakdown(uuid) to anon, authenticated;

-- The typed toggle is the only public mutation path; legacy one-way wrappers
-- would not implement replacement and cancellation semantics.
revoke all on function public.set_own_reaction(uuid) from public, anon, authenticated, service_role;
revoke all on function public.remove_own_reaction(uuid) from public, anon, authenticated, service_role;
revoke all on function private.set_own_reaction(uuid) from public, anon, authenticated, service_role;
revoke all on function private.remove_own_reaction(uuid) from public, anon, authenticated, service_role;
