-- Authenticated readers may fetch only the body of content that is currently
-- published. Public metadata continues to come from published_previews.
-- Retire the older reader RPC, which checked authentication but did not check
-- account state. All site reading must pass the stricter rule below.
revoke all on function public.read_post_full_body(uuid) from public, anon, authenticated, service_role;
revoke all on function private.read_post_full_body(uuid) from public, anon, authenticated, service_role;

create or replace function public.read_published_post_body(p_post_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select post.full_body
  from private.posts as post
  join private.areas as area on area.id = post.area_id and area.is_active
  join public.published_previews as preview on preview.post_id = post.id
  join public.profiles as profile on profile.id = (select auth.uid())
  where post.id = p_post_id
    and post.status = 'published'
    and profile.account_state in ('active', 'suspended')
  limit 1
$function$;

revoke all on function public.read_published_post_body(uuid) from public, anon, authenticated, service_role;
grant execute on function public.read_published_post_body(uuid) to authenticated;
