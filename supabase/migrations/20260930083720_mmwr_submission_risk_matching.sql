-- Literal lexicon matching is an advisory signal only and is OFF by default.
alter table private.runtime_flags drop constraint runtime_flags_name_valid;
alter table private.runtime_flags add constraint runtime_flags_name_valid
  check (flag in ('account_deletion', 'submission_risk_scanning', 'critical_security_email', 'staff_evidence_preview'));

insert into private.runtime_flags (flag, enabled)
values ('submission_risk_scanning', false)
on conflict (flag) do nothing;

create table private.submission_risk_scanner_settings_audit (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users (id) on delete set null,
  enabled_before boolean not null,
  enabled_after boolean not null,
  reason text not null,
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint submission_risk_scanner_audit_reason_size check (pg_catalog.char_length(pg_catalog.btrim(reason)) between 1 and 500)
);
alter table private.submission_risk_scanner_settings_audit enable row level security;
revoke all on table private.submission_risk_scanner_settings_audit from public, anon, authenticated, service_role;

create function private.reject_submission_risk_scanner_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' and old.actor_user_id is not null and new.actor_user_id is null
    and (pg_catalog.to_jsonb(old) - 'actor_user_id') = (pg_catalog.to_jsonb(new) - 'actor_user_id') then
    return new;
  end if;
  raise exception 'submission risk scanner audit is append-only' using errcode = '42501';
end;
$function$;
revoke all on function private.reject_submission_risk_scanner_audit_mutation() from public, anon, authenticated, service_role;
create trigger submission_risk_scanner_audit_append_only
  before update or delete on private.submission_risk_scanner_settings_audit
  for each row execute function private.reject_submission_risk_scanner_audit_mutation();
create trigger submission_risk_scanner_audit_no_truncate
  before truncate on private.submission_risk_scanner_settings_audit
  for each statement execute function private.reject_submission_risk_scanner_audit_mutation();

create function private.submission_risk_hint(p_text text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_high_matches bigint;
  v_ordinary_matches bigint;
begin
  if p_text is null or not exists (
    select 1 from private.runtime_flags as runtime_flag
    where runtime_flag.flag = 'submission_risk_scanning' and runtime_flag.enabled
  ) then
    return 'unassessed';
  end if;

  select
    pg_catalog.count(*) filter (where rule.risk_level = 'high'),
    pg_catalog.count(*) filter (where rule.risk_level = 'ordinary')
  into v_high_matches, v_ordinary_matches
  from private.submission_risk_lexicon as rule
  where rule.active
    and pg_catalog.strpos(pg_catalog.lower(p_text), pg_catalog.lower(rule.term)) > 0;

  if v_high_matches > 0 then return 'high'; end if;
  if v_ordinary_matches > 0 then return 'ordinary'; end if;
  return 'unassessed';
end;
$function$;
revoke all on function private.submission_risk_hint(text) from public, anon, authenticated, service_role;

create or replace function private.create_submission(p_title text, p_original_source text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_submission_id uuid;
  v_risk_level text;
begin
  if v_user_id is null
    or p_title is null or pg_catalog.btrim(p_title) = ''
    or p_original_source is null or pg_catalog.btrim(p_original_source) = ''
    or private.account_has_active_sanction(v_user_id, 'submission_suspension')
    or private.account_has_active_sanction(v_user_id, 'account_suspension')
    or not exists (
      select 1 from public.profiles as profile
      join auth.users as auth_user on auth_user.id = profile.id
      where profile.id = v_user_id and profile.account_state = 'active'
        and auth_user.email_confirmed_at is not null
    ) then
    return null;
  end if;

  v_risk_level := private.submission_risk_hint(p_title);
  insert into private.submissions (submitter_id, submitted_title, original_source, risk_level)
  values (v_user_id, pg_catalog.btrim(p_title), p_original_source, v_risk_level)
  returning id into v_submission_id;
  return v_submission_id;
end;
$function$;

create or replace function private.append_submission_information(p_submission_id uuid, p_information text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_status text;
  v_risk_level text;
  v_current_risk text;
begin
  if v_user_id is null or p_information is null or pg_catalog.btrim(p_information) = ''
    or private.account_has_active_sanction(v_user_id, 'submission_suspension')
    or private.account_has_active_sanction(v_user_id, 'account_suspension')
    or not exists (select 1 from public.profiles as profile where profile.id = v_user_id and profile.account_state = 'active') then
    return false;
  end if;

  select submission.status, submission.risk_level into v_status, v_current_risk
  from private.submissions as submission
  where submission.id = p_submission_id and submission.submitter_id = v_user_id
  for update;
  if v_status is distinct from 'needs_more_information' then return false; end if;

  insert into private.submission_addenda (submission_id, submitter_id, additional_information)
  values (p_submission_id, v_user_id, pg_catalog.btrim(p_information));
  v_risk_level := private.submission_risk_hint(p_information);
  if v_risk_level = 'high' and v_current_risk <> 'high' then
    update private.submissions set risk_level = 'high' where id = p_submission_id;
    perform private.enqueue_staff_notification(
      'submission_high_risk', p_submission_id, 'critical',
      'High-risk submission requires Owner review',
      'A submission was marked high risk. Open the private review queue.', true
    );
  elsif v_risk_level = 'ordinary' and v_current_risk = 'unassessed' then
    update private.submissions set risk_level = 'ordinary' where id = p_submission_id;
  end if;
  return true;
end;
$function$;

create function private.owner_set_submission_risk_scanning(p_enabled boolean, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_before boolean;
begin
  if v_actor is null or not private.has_staff_role('owner') or not private.has_recent_totp() then
    raise exception 'Owner access and recent TOTP required' using errcode = '42501';
  end if;
  if p_enabled is null or p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) not between 1 and 500 then
    raise exception 'Invalid scanner setting or reason' using errcode = '22023';
  end if;

  select runtime_flag.enabled into v_before from private.runtime_flags as runtime_flag
  where runtime_flag.flag = 'submission_risk_scanning' for update;
  if not found then raise exception 'Scanner setting is unavailable' using errcode = '55000'; end if;
  if not private.has_staff_role('owner') or not private.has_recent_totp() then
    raise exception 'Owner access and recent TOTP required' using errcode = '42501';
  end if;

  update private.runtime_flags set enabled = p_enabled, updated_at = pg_catalog.clock_timestamp()
  where flag = 'submission_risk_scanning';
  insert into private.submission_risk_scanner_settings_audit (actor_user_id, enabled_before, enabled_after, reason)
  values (v_actor, v_before, p_enabled, pg_catalog.btrim(p_reason));
  return true;
end;
$function$;
revoke all on function private.owner_set_submission_risk_scanning(boolean, text) from public, anon, service_role;
grant execute on function private.owner_set_submission_risk_scanning(boolean, text) to authenticated;

create function public.owner_set_submission_risk_scanning(p_enabled boolean, p_reason text)
returns boolean
language sql
security invoker
set search_path = ''
as $function$ select private.owner_set_submission_risk_scanning(p_enabled, p_reason) $function$;
revoke all on function public.owner_set_submission_risk_scanning(boolean, text) from public, anon, service_role;
grant execute on function public.owner_set_submission_risk_scanning(boolean, text) to authenticated;

create function private.owner_get_submission_risk_scanning_status()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if not private.has_staff_role('owner') or not private.has_recent_totp() then
    raise exception 'Owner access and recent TOTP required' using errcode = '42501';
  end if;
  return coalesce((select runtime_flag.enabled from private.runtime_flags as runtime_flag
    where runtime_flag.flag = 'submission_risk_scanning'), false);
end;
$function$;
revoke all on function private.owner_get_submission_risk_scanning_status() from public, anon, service_role;
grant execute on function private.owner_get_submission_risk_scanning_status() to authenticated;

create function public.owner_get_submission_risk_scanning_status()
returns boolean
language sql
security invoker
set search_path = ''
as $function$ select private.owner_get_submission_risk_scanning_status() $function$;
revoke all on function public.owner_get_submission_risk_scanning_status() from public, anon, service_role;
grant execute on function public.owner_get_submission_risk_scanning_status() to authenticated;

create function private.owner_list_submission_risk_scanner_audit(p_limit integer default 20)
returns table (
  id bigint,
  actor_user_id uuid,
  enabled_before boolean,
  enabled_after boolean,
  reason text,
  occurred_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if not private.has_staff_role('owner') or not private.has_recent_totp() then
    raise exception 'Owner access and recent TOTP required' using errcode = '42501';
  end if;
  return query
  select audit.id, audit.actor_user_id, audit.enabled_before, audit.enabled_after, audit.reason, audit.occurred_at
  from private.submission_risk_scanner_settings_audit as audit
  order by audit.occurred_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
end;
$function$;
revoke all on function private.owner_list_submission_risk_scanner_audit(integer) from public, anon, service_role;
grant execute on function private.owner_list_submission_risk_scanner_audit(integer) to authenticated;

create function public.owner_list_submission_risk_scanner_audit(p_limit integer default 20)
returns table (
  id bigint,
  actor_user_id uuid,
  enabled_before boolean,
  enabled_after boolean,
  reason text,
  occurred_at timestamptz
)
language sql
security invoker
set search_path = ''
as $function$ select * from private.owner_list_submission_risk_scanner_audit(p_limit) $function$;
revoke all on function public.owner_list_submission_risk_scanner_audit(integer) from public, anon, service_role;
grant execute on function public.owner_list_submission_risk_scanner_audit(integer) to authenticated;
