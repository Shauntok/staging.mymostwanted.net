-- Preserve the legacy ordinary-post publication RPC while bringing it under
-- the recent-TOTP and post-lock authorization boundary used by staff writes.
-- New submission publication remains separately feature-gated.

create or replace function private.publish_post(p_post_id uuid, p_reason text)
returns boolean
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  v_post private.posts%rowtype;
  v_actor uuid := (select auth.uid());
  v_now timestamptz;
begin
  if v_actor is null
    or p_post_id is null
    or p_reason is null
    or pg_catalog.btrim(p_reason) = ''
    or pg_catalog.char_length(p_reason) > 500
    or not (private.has_staff_role('admin') or private.has_staff_role('owner'))
    or not private.has_recent_totp() then
    return false;
  end if;

  select post_row.* into v_post
  from private.posts as post_row
  where post_row.id = p_post_id
  for update;

  if not found
    or not (private.has_staff_role('admin') or private.has_staff_role('owner'))
    or not private.has_recent_totp()
    or v_post.status not in ('pending_review', 'approved') then
    return false;
  end if;

  if not exists (
    select 1 from private.areas as area
    where area.id = v_post.area_id and area.is_active
  ) then
    return false;
  end if;

  if v_post.risk_level = 'high' and not private.has_staff_role('owner') then
    return false;
  end if;

  v_now := pg_catalog.clock_timestamp();

  update private.posts as post_row
  set status = 'published',
      published_at = coalesce(post_row.published_at, v_now),
      last_published_at = v_now,
      updated_at = v_now
  where post_row.id = p_post_id;

  insert into private.moderation_events (
    actor_user_id, post_id, action, reason, prior_state, next_state, risk_level, occurred_at
  ) values (
    v_actor, p_post_id, 'publish', pg_catalog.btrim(p_reason), v_post.status, 'published', v_post.risk_level, v_now
  );

  return true;
end;
$function$;

revoke all on function private.publish_post(uuid, text) from public, anon, service_role;
grant execute on function private.publish_post(uuid, text) to authenticated;

revoke all on function public.publish_post(uuid, text) from public, anon, service_role;
grant execute on function public.publish_post(uuid, text) to authenticated;
