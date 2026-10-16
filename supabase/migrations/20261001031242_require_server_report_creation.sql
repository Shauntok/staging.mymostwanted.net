-- Enforce Turnstile at the application boundary by removing authenticated
-- callers' direct access to the report write RPC. Only the server's Supabase
-- secret-key client may call the replacement function after Siteverify.

revoke all on function public.create_my_user_report(text, uuid, text, text)
  from public, anon, authenticated, service_role;

create or replace function public.create_my_user_report(
  p_submitter_id uuid,
  p_kind text,
  p_post_id uuid,
  p_reason text,
  p_message text
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  v_locked_user_id uuid;
  v_account_state text;
  v_recent_count integer;
  v_message text := pg_catalog.btrim(coalesce(p_message, ''));
  v_report_id uuid;
  v_now timestamptz;
begin
  if (select auth.role()) is distinct from 'service_role'
    or p_submitter_id is null
    or p_kind is null or p_reason is null
    or p_kind not in ('report', 'feedback')
    or pg_catalog.char_length(v_message) not between 1 and 2000
    or (p_kind = 'report' and p_reason not in ('inaccurate_information', 'privacy', 'safety', 'spam', 'other'))
    or (p_kind = 'feedback' and p_reason not in ('suggestion', 'accessibility', 'technical_issue', 'other'))
    or (p_kind = 'report' and p_post_id is null)
    or (p_kind = 'feedback' and p_post_id is not null) then
    return null;
  end if;

  -- Serialize account submissions so parallel requests cannot skip the cap.
  select auth_user.id into v_locked_user_id
  from auth.users as auth_user where auth_user.id = p_submitter_id for update;
  if not found then return null; end if;

  select profile.account_state into v_account_state
  from public.profiles as profile where profile.id = p_submitter_id;
  if v_account_state is distinct from 'active' then return null; end if;

  if p_kind = 'report' and not exists (
    select 1 from private.posts as post_row
    join private.areas as area on area.id = post_row.area_id and area.is_active
    join public.published_previews as preview on preview.post_id = post_row.id
    where post_row.id = p_post_id and post_row.status = 'published'
  ) then
    return null;
  end if;

  v_now := pg_catalog.clock_timestamp();
  select pg_catalog.count(*)::integer into v_recent_count
  from private.user_reports as report
  where report.submitted_by = p_submitter_id
    and report.submitted_at > v_now - interval '1 hour';
  if v_recent_count >= 5 then
    raise exception using errcode = 'P0001', message = 'report_rate_limited';
  end if;

  insert into private.user_reports (
    submitted_by, report_kind, post_id, reason, message, submitted_at
  ) values (
    p_submitter_id, p_kind, p_post_id, p_reason, v_message, v_now
  ) returning id into v_report_id;
  return v_report_id;
end
$function$;

revoke all on function public.create_my_user_report(uuid, text, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_my_user_report(uuid, text, uuid, text, text)
  to service_role;
