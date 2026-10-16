-- Reports remain private. Public clients may submit only through the
-- authenticated, rate-limited RPC and cannot read or enumerate report records.
create table private.user_reports (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid references auth.users (id) on delete set null,
  report_kind text not null,
  post_id uuid references private.posts (id) on delete set null,
  reason text not null,
  message text not null,
  status text not null default 'received',
  submitted_at timestamptz not null default pg_catalog.now(),
  constraint user_reports_kind_valid check (report_kind in ('report', 'feedback')),
  constraint user_reports_reason_valid check (reason in ('inaccurate_information', 'privacy', 'safety', 'spam', 'suggestion', 'accessibility', 'technical_issue', 'other')),
  constraint user_reports_status_valid check (status in ('received', 'reviewing', 'resolved', 'dismissed')),
  constraint user_reports_message_size check (pg_catalog.char_length(message) between 1 and 2000),
  constraint user_reports_kind_post_pair check (
    (report_kind = 'report' and post_id is not null)
    or (report_kind = 'feedback' and post_id is null)
  )
);

alter table private.user_reports enable row level security;
revoke all on table private.user_reports from public, anon, authenticated, service_role;
create index user_reports_submitted_by_time_idx on private.user_reports (submitted_by, submitted_at desc);
create index user_reports_status_time_idx on private.user_reports (status, submitted_at desc);

create function public.create_my_user_report(
  p_kind text,
  p_post_id uuid,
  p_reason text,
  p_message text
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_locked_user_id uuid;
  v_account_state text;
  v_recent_count integer;
  v_message text := pg_catalog.btrim(coalesce(p_message, ''));
  v_report_id uuid;
begin
  if v_user_id is null
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
  from auth.users as auth_user where auth_user.id = v_user_id for update;
  if not found then return null; end if;

  select profile.account_state into v_account_state
  from public.profiles as profile where profile.id = v_user_id;
  if v_account_state is distinct from 'active' then return null; end if;

  if p_kind = 'report' and not exists (
    select 1 from private.posts as post_row
    join private.areas as area on area.id = post_row.area_id and area.is_active
    join public.published_previews as preview on preview.post_id = post_row.id
    where post_row.id = p_post_id and post_row.status = 'published'
  ) then
    return null;
  end if;

  select pg_catalog.count(*)::integer into v_recent_count
  from private.user_reports as report
  where report.submitted_by = v_user_id
    and report.submitted_at > pg_catalog.now() - interval '1 hour';
  if v_recent_count >= 5 then return null; end if;

  insert into private.user_reports (submitted_by, report_kind, post_id, reason, message)
  values (v_user_id, p_kind, p_post_id, p_reason, v_message)
  returning id into v_report_id;
  return v_report_id;
end
$function$;

revoke all on function public.create_my_user_report(text, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_my_user_report(text, uuid, text, text)
  to authenticated;
