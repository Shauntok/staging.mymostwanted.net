-- Distinguish an Auth transport outcome that may have committed from a
-- returned provider error. The Worker still never retries either outcome.
create or replace function public.mark_account_deletion_review_required(
  p_user_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_reason text;
begin
  if (select auth.jwt() ->> 'role') is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if p_reason is null or p_reason not in (
    'evidence_owned', 'auth_cleanup_failed', 'auth_cleanup_uncertain'
  ) then
    return false;
  end if;
  v_reason := p_reason;

  update public.profiles as profile
  set account_state = 'deletion_review_required',
      deletion_claimed_at = null,
      deletion_auth_attempted_at = null,
      deletion_review_reason = v_reason,
      updated_at = pg_catalog.clock_timestamp()
  where profile.id = p_user_id
    and profile.account_state = 'deletion_processing';

  if not found then
    return false;
  end if;

  insert into private.account_deletion_review_events (subject_user_id, reason)
  values (p_user_id, v_reason);
  return true;
end;
$function$;

revoke all on function public.mark_account_deletion_review_required(uuid, text)
  from public, anon, authenticated;
grant execute on function public.mark_account_deletion_review_required(uuid, text)
  to service_role;
