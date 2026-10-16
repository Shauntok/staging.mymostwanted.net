-- Staff evidence preview is a two-switch opt-in (deployment env + database flag).
-- Uploads stay disabled; only clean, internal-only submission evidence can be read.

create extension if not exists pgcrypto with schema extensions;

alter table private.runtime_flags drop constraint runtime_flags_name_valid;
alter table private.runtime_flags add constraint runtime_flags_name_valid
  check (flag in ('account_deletion', 'submission_risk_scanning', 'critical_security_email', 'staff_evidence_preview'));

insert into private.runtime_flags (flag, enabled)
values ('staff_evidence_preview', false)
on conflict (flag) do nothing;

create table private.staff_evidence_access_audit (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid not null,
  submission_id uuid not null,
  actor_user_id uuid not null,
  action text not null default 'signed_url_authorized',
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint staff_evidence_access_action_valid check (action = 'signed_url_authorized')
);

create index staff_evidence_access_actor_time_idx
  on private.staff_evidence_access_audit (actor_user_id, occurred_at desc);
create index staff_evidence_access_submission_time_idx
  on private.staff_evidence_access_audit (submission_id, occurred_at desc);

alter table private.staff_evidence_access_audit enable row level security;
revoke all on table private.staff_evidence_access_audit from public, anon, authenticated, service_role;

create function private.reject_staff_evidence_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'staff evidence access audit is append-only' using errcode = '55000';
end;
$function$;

create trigger staff_evidence_access_audit_no_mutation
before update or delete or truncate on private.staff_evidence_access_audit
for each statement execute function private.reject_staff_evidence_audit_mutation();

revoke all on function private.reject_staff_evidence_audit_mutation() from public, anon, authenticated, service_role;

create table private.staff_evidence_access_grants (
  token_hash bytea primary key,
  audit_id uuid not null references private.staff_evidence_access_audit (id) on delete cascade,
  actor_user_id uuid not null,
  evidence_id uuid not null,
  expires_at timestamptz not null,
  consumed_at timestamptz
);

alter table private.staff_evidence_access_grants enable row level security;
revoke all on table private.staff_evidence_access_grants from public, anon, authenticated, service_role;

create function public.list_staff_submission_evidence(p_submission_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_enabled boolean := false;
  v_items jsonb := '[]'::jsonb;
begin
  if v_user_id is null
    or p_submission_id is null
    or not (private.has_staff_role('admin') or private.has_staff_role('owner'))
    or not private.has_recent_totp() then
    raise exception 'staff evidence access denied' using errcode = '42501';
  end if;

  select runtime_flag.enabled into v_enabled
  from private.runtime_flags as runtime_flag
  where runtime_flag.flag = 'staff_evidence_preview';

  if not coalesce(v_enabled, false) then
    return pg_catalog.jsonb_build_object('enabled', false, 'items', '[]'::jsonb);
  end if;

  if not exists (
    select 1
    from private.submissions as submission
    where submission.id = p_submission_id
      and submission.status in ('received', 'reviewing', 'needs_more_information')
      and (submission.risk_level <> 'high' or private.has_staff_role('owner'))
  ) then
    return pg_catalog.jsonb_build_object('enabled', true, 'items', '[]'::jsonb);
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', evidence.id,
        'mime_type', evidence.mime_type,
        'created_at', evidence.created_at
      ) order by evidence.created_at, evidence.id
    ),
    '[]'::jsonb
  ) into v_items
  from private.evidence_metadata as evidence
  where evidence.submission_id = p_submission_id
    and evidence.scan_state = 'clean'
    and evidence.visibility = 'internal_only';

  return pg_catalog.jsonb_build_object('enabled', true, 'items', v_items);
end;
$function$;

revoke all on function public.list_staff_submission_evidence(uuid) from public, anon, authenticated, service_role;
grant execute on function public.list_staff_submission_evidence(uuid) to authenticated;

create function public.issue_staff_evidence_access_grant(p_evidence_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_submission_id uuid;
  v_enabled boolean := false;
  v_token text;
  v_audit_id uuid;
begin
  if v_user_id is null
    or p_evidence_id is null
    or not (private.has_staff_role('admin') or private.has_staff_role('owner'))
    or not private.has_recent_totp() then
    raise exception 'staff evidence access denied' using errcode = '42501';
  end if;

  select runtime_flag.enabled into v_enabled
  from private.runtime_flags as runtime_flag
  where runtime_flag.flag = 'staff_evidence_preview';
  if not coalesce(v_enabled, false) then return null; end if;

  select evidence.submission_id
    into v_submission_id
  from private.evidence_metadata as evidence
  join private.submissions as submission on submission.id = evidence.submission_id
  where evidence.id = p_evidence_id
    and evidence.scan_state = 'clean'
    and evidence.visibility = 'internal_only'
    and submission.status in ('received', 'reviewing', 'needs_more_information')
    and (submission.risk_level <> 'high' or private.has_staff_role('owner'));
  if not found then return null; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  -- Authorization and eligibility can change while this request waits for the
  -- per-user rate-limit lock. Recheck both using wall-clock TOTP freshness.
  if not (private.has_staff_role('admin') or private.has_staff_role('owner'))
    or not private.has_recent_totp()
    or private.account_has_active_sanction(v_user_id, 'account_suspension') then
    raise exception 'staff evidence access denied' using errcode = '42501';
  end if;

  select evidence.submission_id
    into v_submission_id
  from private.evidence_metadata as evidence
  join private.submissions as submission on submission.id = evidence.submission_id
  where evidence.id = p_evidence_id
    and evidence.scan_state = 'clean'
    and evidence.visibility = 'internal_only'
    and submission.status in ('received', 'reviewing', 'needs_more_information')
    and (submission.risk_level <> 'high' or private.has_staff_role('owner'));
  if not found then return null; end if;

  select runtime_flag.enabled into v_enabled
  from private.runtime_flags as runtime_flag
  where runtime_flag.flag = 'staff_evidence_preview';
  if not coalesce(v_enabled, false) then return null; end if;

  if (
    select pg_catalog.count(*)
    from private.staff_evidence_access_audit as access_audit
    where access_audit.actor_user_id = v_user_id
      and access_audit.occurred_at > pg_catalog.clock_timestamp() - interval '1 minute'
  ) >= 30 then
    raise exception 'staff evidence access rate limit exceeded' using errcode = 'P0001';
  end if;

  insert into private.staff_evidence_access_audit (evidence_id, submission_id, actor_user_id)
  values (p_evidence_id, v_submission_id, v_user_id)
  returning id into v_audit_id;

  v_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.staff_evidence_access_grants (
    token_hash, audit_id, actor_user_id, evidence_id, expires_at
  ) values (
    extensions.digest(pg_catalog.convert_to(v_token, 'UTF8'), 'sha256'),
    v_audit_id, v_user_id, p_evidence_id, pg_catalog.clock_timestamp() + interval '30 seconds'
  );

  return v_token;
end;
$function$;

revoke all on function public.issue_staff_evidence_access_grant(uuid) from public, anon, authenticated, service_role;
grant execute on function public.issue_staff_evidence_access_grant(uuid) to authenticated;

create function public.consume_staff_evidence_access_grant(p_token text)
returns table (object_path text, mime_type text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_token_hash bytea;
  v_actor_user_id uuid;
  v_evidence_id uuid;
  v_audit_id uuid;
begin
  if (select auth.role()) is distinct from 'service_role'
    or p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid evidence grant' using errcode = '42501';
  end if;

  v_token_hash := extensions.digest(pg_catalog.convert_to(p_token, 'UTF8'), 'sha256');
  update private.staff_evidence_access_grants as access_grant
  set consumed_at = pg_catalog.clock_timestamp()
  where access_grant.token_hash = v_token_hash
    and access_grant.consumed_at is null
    and access_grant.expires_at > pg_catalog.clock_timestamp()
  returning access_grant.actor_user_id, access_grant.evidence_id, access_grant.audit_id
    into v_actor_user_id, v_evidence_id, v_audit_id;
  if not found then return; end if;

  return query
  select evidence.object_path, evidence.mime_type
  from private.evidence_metadata as evidence
  join private.submissions as submission on submission.id = evidence.submission_id
  where evidence.id = v_evidence_id
    and evidence.scan_state = 'clean'
    and evidence.visibility = 'internal_only'
    and submission.status in ('received', 'reviewing', 'needs_more_information')
    and (submission.risk_level <> 'high' or exists (
      select 1 from private.user_roles as user_role
      where user_role.user_id = v_actor_user_id and user_role.role = 'owner'
    ))
    and exists (
      select 1 from private.user_roles as user_role
      where user_role.user_id = v_actor_user_id and user_role.role in ('admin', 'owner')
    )
    and exists (
      select 1 from public.profiles as profile
      where profile.id = v_actor_user_id and profile.account_state = 'active'
    )
    and not private.account_has_active_sanction(v_actor_user_id, 'account_suspension')
    and exists (
      select 1 from private.runtime_flags as runtime_flag
      where runtime_flag.flag = 'staff_evidence_preview' and runtime_flag.enabled
    )
    and exists (
      select 1 from private.staff_evidence_access_audit as access_audit
      where access_audit.id = v_audit_id
        and access_audit.actor_user_id = v_actor_user_id
        and access_audit.evidence_id = evidence.id
        and access_audit.submission_id = submission.id
    );
end;
$function$;

revoke all on function public.consume_staff_evidence_access_grant(text) from public, anon, authenticated, service_role;
grant execute on function public.consume_staff_evidence_access_grant(text) to service_role;

select cron.schedule(
  'mmwr-purge-staff-evidence-access-grants',
  '15 * * * *',
  $$delete from private.staff_evidence_access_grants where expires_at < pg_catalog.clock_timestamp() - interval '1 day'$$
);
