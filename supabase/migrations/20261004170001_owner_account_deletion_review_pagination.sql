-- Provide stable keyset pagination for the Owner-only deletion review queue.
-- Preserve the old first-page RPC so older application builds remain compatible.
create index profiles_deletion_review_page_idx
  on public.profiles (deletion_requested_at, (pg_catalog.lower(pg_catalog.btrim(username))))
  where account_state = 'deletion_review_required';

create function private.owner_list_account_deletion_reviews_page(
  p_after_requested_at timestamptz default null,
  p_after_username text default null,
  p_limit integer default 51
)
returns table (
  username text,
  requested_at timestamptz,
  review_reason text
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
    or not private.has_staff_role('owner')
    or not private.has_recent_totp() then
    raise exception 'Owner access and recent TOTP required' using errcode = '42501';
  end if;

  if (p_after_requested_at is null) <> (p_after_username is null)
    or (p_after_username is not null
      and pg_catalog.length(p_after_username) not between 1 and 80) then
    raise exception 'Invalid deletion review cursor' using errcode = '22023';
  end if;

  return query
  select profile.username, profile.deletion_requested_at, profile.deletion_review_reason
  from public.profiles as profile
  where profile.account_state = 'deletion_review_required'
    and (
      p_after_requested_at is null
      or (profile.deletion_requested_at,
          pg_catalog.lower(pg_catalog.btrim(profile.username)))
        > (p_after_requested_at,
          pg_catalog.lower(pg_catalog.btrim(p_after_username)))
    )
  order by profile.deletion_requested_at,
           pg_catalog.lower(pg_catalog.btrim(profile.username))
  limit greatest(1, least(coalesce(p_limit, 51), 101));
end
$function$;
revoke all on function private.owner_list_account_deletion_reviews_page(timestamptz, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function private.owner_list_account_deletion_reviews_page(timestamptz, text, integer)
  to authenticated;

create function public.owner_list_account_deletion_reviews_page(
  p_after_requested_at timestamptz default null,
  p_after_username text default null,
  p_limit integer default 51
)
returns table (
  username text,
  requested_at timestamptz,
  review_reason text
)
language sql
volatile
security invoker
set search_path = ''
as $function$
  select * from private.owner_list_account_deletion_reviews_page(
    p_after_requested_at, p_after_username, p_limit
  );
$function$;
revoke all on function public.owner_list_account_deletion_reviews_page(timestamptz, text, integer)
  from public, anon, service_role;
grant execute on function public.owner_list_account_deletion_reviews_page(timestamptz, text, integer)
  to authenticated;

-- Make stale authorization fail visibly instead of looking like an empty queue.
create or replace function private.owner_list_account_deletion_reviews()
returns table (
  username text,
  requested_at timestamptz,
  review_reason text
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  return query
  select * from private.owner_list_account_deletion_reviews_page(null, null, 100);
end;
$function$;
