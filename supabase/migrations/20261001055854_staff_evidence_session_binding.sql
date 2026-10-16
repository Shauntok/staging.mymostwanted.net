-- Bind one-use internal-evidence grants to the exact staff Auth session.
-- There is no safe way to infer a session for existing grants: invalidate those
-- transient grants while retaining their immutable access-audit history.
alter table private.staff_evidence_access_grants
  add column session_id uuid references auth.sessions(id) on delete cascade;

delete from private.staff_evidence_access_grants where session_id is null;

alter table private.staff_evidence_access_grants
  alter column session_id set not null;

create index staff_evidence_access_grants_session_idx
  on private.staff_evidence_access_grants (session_id);

comment on column private.staff_evidence_access_grants.session_id is
  'Issuing Auth session; service consumption checks its lease without extending it.';

create or replace function public.issue_staff_evidence_access_grant(p_evidence_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_claims jsonb := (select auth.jwt());
  v_session_id uuid;
  v_submission_id uuid;
  v_enabled boolean := false;
  v_token text;
  v_audit_id uuid;
begin
  if v_user_id is null
    or p_evidence_id is null
    or v_claims ->> 'aal' is distinct from 'aal2'
    or not (
      coalesce(v_claims -> 'amr', '[]'::jsonb) @> '[{"method":"totp"}]'::jsonb
      or coalesce(v_claims -> 'amr', '[]'::jsonb) @> '[{"method":"mfa/totp"}]'::jsonb
    )
    or coalesce(v_claims ->> 'session_id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    or not (private.has_staff_role('admin') or private.has_staff_role('owner'))
    or not private.has_recent_totp() then
    raise exception 'staff evidence access denied' using errcode = '42501';
  end if;
  v_session_id := (v_claims ->> 'session_id')::uuid;

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
  -- per-user rate-limit lock. Recheck the exact session lease through the
  -- lease-aware role helper and use wall-clock TOTP freshness.
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
    token_hash, audit_id, actor_user_id, evidence_id, session_id, expires_at
  ) values (
    extensions.digest(pg_catalog.convert_to(v_token, 'UTF8'), 'sha256'),
    v_audit_id, v_user_id, p_evidence_id, v_session_id,
    pg_catalog.clock_timestamp() + interval '30 seconds'
  );

  return v_token;
end;
$function$;

revoke all on function public.issue_staff_evidence_access_grant(uuid) from public, anon, authenticated, service_role;
grant execute on function public.issue_staff_evidence_access_grant(uuid) to authenticated;

create or replace function public.consume_staff_evidence_access_grant(p_token text)
returns table (object_path text, mime_type text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_token_hash bytea;
  v_actor_user_id uuid;
  v_session_id uuid;
  v_evidence_id uuid;
  v_audit_id uuid;
  v_now timestamptz;
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
  returning access_grant.actor_user_id, access_grant.evidence_id,
    access_grant.audit_id, access_grant.session_id
    into v_actor_user_id, v_evidence_id, v_audit_id, v_session_id;
  if not found then return; end if;

  -- Consume first, then recheck eligibility. A failed check cannot leave a
  -- reusable grant. Service access must never initialize or renew a lease.
  if v_session_id is null then return; end if;
  v_now := pg_catalog.clock_timestamp();

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
      select 1
      from auth.sessions as auth_session
      join private.staff_session_activity as activity
        on activity.session_id = auth_session.id
      where auth_session.id = v_session_id
        and auth_session.user_id = v_actor_user_id
        and activity.started_at > v_now - interval '8 hours'
        and activity.last_activity_at > v_now - interval '15 minutes'
    )
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

