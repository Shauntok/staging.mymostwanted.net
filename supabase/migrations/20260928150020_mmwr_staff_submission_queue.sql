-- MFA-gated submission triage. The legacy RPCs exposed review data and mutations
-- without checking for a recent TOTP proof, so revoke them in favor of this API.

revoke all on function public.review_submission(uuid) from public, anon, authenticated, service_role;
revoke all on function private.review_submission(uuid) from public, anon, authenticated, service_role;
revoke all on function public.record_submission_review(uuid, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function private.record_submission_review(uuid, text, text, text, text) from public, anon, authenticated, service_role;

alter table private.submission_reviews
  drop constraint submission_reviews_risk_valid;
alter table private.submission_reviews
  add constraint submission_reviews_risk_valid check (risk_level in ('unassessed', 'ordinary', 'high'));

create table private.submission_staff_audit (
  id bigint generated always as identity primary key,
  submission_id uuid not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  status_before text,
  status_after text,
  reason text,
  internal_notes text,
  safe_response text,
  occurred_at timestamptz not null default pg_catalog.now(),
  constraint submission_staff_audit_action_valid
    check (action in ('queue_opened', 'submission_opened', 'review_history_opened', 'status_changed')),
  constraint submission_staff_audit_reason_size
    check (reason is null or pg_catalog.char_length(reason) <= 1000),
  constraint submission_staff_audit_notes_size
    check (internal_notes is null or pg_catalog.char_length(internal_notes) <= 1000),
  constraint submission_staff_audit_response_size
    check (safe_response is null or pg_catalog.char_length(safe_response) <= 2000)
);

create index submission_staff_audit_submission_time_idx
  on private.submission_staff_audit (submission_id, occurred_at desc);

alter table private.submission_staff_audit enable row level security;
revoke all on table private.submission_staff_audit from public, anon, authenticated, service_role;

create function public.list_staff_submissions(p_limit integer default 50)
returns table (
  id uuid,
  submitted_title text,
  status text,
  risk_level text,
  created_at timestamptz
)
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null
    or not (private.has_staff_role('admin') or private.has_staff_role('owner'))
    or not private.has_recent_totp() then
    raise exception 'staff submission access denied' using errcode = '42501';
  end if;

  return query
  with picked as materialized (
    select submission.id, submission.created_at
    from private.submissions as submission
    where submission.status in ('received', 'reviewing', 'needs_more_information')
      and (private.has_staff_role('owner') or submission.risk_level <> 'high')
    order by submission.created_at desc, submission.id desc
    limit greatest(1, least(coalesce(p_limit, 50), 50))
  ), logged as (
    insert into private.submission_staff_audit (submission_id, actor_user_id, action)
    select picked.id, v_user_id, 'queue_opened'
    from picked
    returning submission_id
  )
  select submission.id, submission.submitted_title, submission.status,
    submission.risk_level, submission.created_at
  from private.submissions as submission
  join logged on logged.submission_id = submission.id
  order by submission.created_at desc, submission.id desc;
end
$function$;

revoke all on function public.list_staff_submissions(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_staff_submissions(integer) to authenticated;

create function public.get_staff_submission(p_submission_id uuid)
returns table (
  id uuid,
  submitted_title text,
  original_source text,
  status text,
  risk_level text,
  internal_reviewer_notes text,
  safe_reviewer_response text,
  created_at timestamptz
)
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null
    or p_submission_id is null
    or not (private.has_staff_role('admin') or private.has_staff_role('owner'))
    or not private.has_recent_totp() then
    raise exception 'staff submission access denied' using errcode = '42501';
  end if;

  if not exists (
    select 1 from private.submissions as submission
    where submission.id = p_submission_id
      and submission.status in ('received', 'reviewing', 'needs_more_information')
      and (submission.risk_level <> 'high' or private.has_staff_role('owner'))
  ) then
    return;
  end if;

  insert into private.submission_staff_audit (submission_id, actor_user_id, action)
  values (p_submission_id, v_user_id, 'submission_opened');

  return query
  select submission.id, submission.submitted_title, submission.original_source,
    submission.status, submission.risk_level, submission.internal_reviewer_notes,
    submission.safe_reviewer_response, submission.created_at
  from private.submissions as submission
  where submission.id = p_submission_id
    and submission.status in ('received', 'reviewing', 'needs_more_information')
    and (submission.risk_level <> 'high' or private.has_staff_role('owner'));
end
$function$;

revoke all on function public.get_staff_submission(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_staff_submission(uuid) to authenticated;

create function public.get_staff_submission_review_history(p_submission_id uuid)
returns table (
  decision text,
  risk_level text,
  internal_notes text,
  safe_response text,
  created_at timestamptz
)
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null
    or p_submission_id is null
    or not (private.has_staff_role('admin') or private.has_staff_role('owner'))
    or not private.has_recent_totp() then
    raise exception 'staff submission access denied' using errcode = '42501';
  end if;

  if not exists (
    select 1 from private.submissions as submission
    where submission.id = p_submission_id
      and (submission.risk_level <> 'high' or private.has_staff_role('owner'))
  ) then
    return;
  end if;

  insert into private.submission_staff_audit (submission_id, actor_user_id, action)
  values (p_submission_id, v_user_id, 'review_history_opened');

  return query
  select review.decision, review.risk_level, review.internal_notes,
    review.safe_response, review.created_at
  from private.submission_reviews as review
  where review.submission_id = p_submission_id
  order by review.created_at desc, review.id desc
  limit 50;
end
$function$;

revoke all on function public.get_staff_submission_review_history(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_staff_submission_review_history(uuid) to authenticated;

create function public.update_staff_submission_triage(
  p_submission_id uuid,
  p_next_status text,
  p_internal_notes text,
  p_safe_response text default null
)
returns boolean
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_is_owner boolean := private.has_staff_role('owner');
  v_submission private.submissions%rowtype;
  v_notes text := pg_catalog.btrim(coalesce(p_internal_notes, ''));
  v_response text := nullif(pg_catalog.btrim(coalesce(p_safe_response, '')), '');
  v_decision text;
begin
  if v_user_id is null
    or p_submission_id is null
    or p_next_status is null
    or p_next_status not in ('reviewing', 'needs_more_information', 'rejected', 'closed')
    or pg_catalog.char_length(v_notes) not between 1 and 1000
    or (v_response is not null and pg_catalog.char_length(v_response) > 2000)
    or (not v_is_owner and not private.has_staff_role('admin'))
    or not private.has_recent_totp() then
    return false;
  end if;

  select submission.* into v_submission
  from private.submissions as submission
  where submission.id = p_submission_id
  for update;
  if not found
    or v_submission.status not in ('received', 'reviewing', 'needs_more_information')
    or (v_submission.risk_level = 'high' and not v_is_owner) then
    return false;
  end if;

  -- Recheck identity, role, risk and fresh MFA after acquiring the row lock.
  v_is_owner := private.has_staff_role('owner');
  if not private.has_recent_totp()
    or (not v_is_owner and (not private.has_staff_role('admin') or v_submission.risk_level = 'high')) then
    return false;
  end if;

  update private.submissions as submission
  set status = p_next_status,
      internal_reviewer_notes = v_notes,
      safe_reviewer_response = v_response,
      updated_at = pg_catalog.now()
  where submission.id = p_submission_id;

  v_decision := case p_next_status
    when 'rejected' then 'reject'
    when 'closed' then 'close'
    else p_next_status
  end;

  insert into private.submission_reviews (
    submission_id, reviewer_id, decision, risk_level, internal_notes, safe_response
  ) values (
    p_submission_id, v_user_id, v_decision, v_submission.risk_level, v_notes, v_response
  );

  insert into private.submission_staff_audit (
    submission_id, actor_user_id, action, status_before, status_after,
    reason, internal_notes, safe_response
  ) values (
    p_submission_id, v_user_id, 'status_changed', v_submission.status, p_next_status,
    v_notes, v_notes, v_response
  );

  return true;
end
$function$;

revoke all on function public.update_staff_submission_triage(uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.update_staff_submission_triage(uuid, text, text, text)
  to authenticated;
