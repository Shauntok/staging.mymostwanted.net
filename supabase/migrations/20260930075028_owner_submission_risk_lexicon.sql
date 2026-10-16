-- Owner-maintained private vocabulary for future submission risk hints.
-- This migration stores rules only: no submission matching, enforcement, or notifications run here.

create table private.submission_risk_lexicon (
  id uuid primary key default gen_random_uuid(),
  term text not null,
  language text not null default 'any',
  risk_level text not null,
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint submission_risk_lexicon_term_size check (
    pg_catalog.char_length(pg_catalog.btrim(term)) between 2 and 120
  ),
  constraint submission_risk_lexicon_language_valid check (language in ('any', 'en', 'zh-CN', 'ms')),
  constraint submission_risk_lexicon_level_valid check (risk_level in ('ordinary', 'high'))
);

create unique index submission_risk_lexicon_term_language_unique
  on private.submission_risk_lexicon (pg_catalog.lower(pg_catalog.btrim(term)), language);

alter table private.submission_risk_lexicon enable row level security;
revoke all on table private.submission_risk_lexicon from public, anon, authenticated, service_role;

create table private.submission_risk_lexicon_audit (
  id bigint generated always as identity primary key,
  rule_id uuid not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  reason text not null,
  before_value jsonb,
  after_value jsonb not null,
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint submission_risk_lexicon_audit_action_valid check (action in ('created', 'updated')),
  constraint submission_risk_lexicon_audit_reason_size check (
    pg_catalog.char_length(pg_catalog.btrim(reason)) between 1 and 500
  )
);

create index submission_risk_lexicon_audit_rule_time_idx
  on private.submission_risk_lexicon_audit (rule_id, occurred_at desc);
alter table private.submission_risk_lexicon_audit enable row level security;
revoke all on table private.submission_risk_lexicon_audit from public, anon, authenticated, service_role;

create function private.reject_submission_risk_lexicon_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE'
    and old.actor_user_id is not null
    and new.actor_user_id is null
    and (to_jsonb(old) - 'actor_user_id') = (to_jsonb(new) - 'actor_user_id') then
    return new;
  end if;
  raise exception 'risk lexicon audit is append-only' using errcode = '42501';
end;
$function$;

revoke all on function private.reject_submission_risk_lexicon_audit_mutation() from public, anon, authenticated, service_role;
create trigger submission_risk_lexicon_audit_append_only
  before update or delete on private.submission_risk_lexicon_audit
  for each row execute function private.reject_submission_risk_lexicon_audit_mutation();
create trigger submission_risk_lexicon_audit_no_truncate
  before truncate on private.submission_risk_lexicon_audit
  for each statement execute function private.reject_submission_risk_lexicon_audit_mutation();

create function private.owner_list_submission_risk_lexicon()
returns table (id uuid, term text, language text, risk_level text, active boolean, updated_at timestamptz)
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
  return query
  select rule.id, rule.term, rule.language, rule.risk_level, rule.active, rule.updated_at
  from private.submission_risk_lexicon as rule
  order by rule.active desc, rule.risk_level desc, pg_catalog.lower(rule.term), rule.id;
end;
$function$;

revoke all on function private.owner_list_submission_risk_lexicon() from public, anon, service_role;
grant execute on function private.owner_list_submission_risk_lexicon() to authenticated;
create function public.owner_list_submission_risk_lexicon()
returns table (id uuid, term text, language text, risk_level text, active boolean, updated_at timestamptz)
language sql volatile security invoker set search_path = ''
as $function$ select * from private.owner_list_submission_risk_lexicon(); $function$;
revoke all on function public.owner_list_submission_risk_lexicon() from public, anon, service_role;
grant execute on function public.owner_list_submission_risk_lexicon() to authenticated;

create function private.owner_save_submission_risk_rule(
  p_rule_id uuid,
  p_term text,
  p_language text,
  p_risk_level text,
  p_active boolean,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_rule private.submission_risk_lexicon%rowtype;
  v_before jsonb;
  v_after jsonb;
begin
  if v_actor is null
    or not private.has_staff_role('owner')
    or not private.has_recent_totp() then
    raise exception 'Owner access and recent TOTP required' using errcode = '42501';
  end if;
  if p_term is null or pg_catalog.char_length(pg_catalog.btrim(p_term)) not between 2 and 120
    or p_language is null or p_language not in ('any', 'en', 'zh-CN', 'ms')
    or p_risk_level is null or p_risk_level not in ('ordinary', 'high')
    or p_active is null
    or p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) not between 1 and 500 then
    raise exception 'Invalid rule or reason' using errcode = '22023';
  end if;

  if p_rule_id is null then
    insert into private.submission_risk_lexicon (
      term, language, risk_level, active, created_by, updated_by
    ) values (
      pg_catalog.btrim(p_term), p_language, p_risk_level, p_active, v_actor, v_actor
    ) returning * into v_rule;
    v_after := pg_catalog.to_jsonb(v_rule);
    insert into private.submission_risk_lexicon_audit (
      rule_id, actor_user_id, action, reason, before_value, after_value
    ) values (
      v_rule.id, v_actor, 'created', pg_catalog.btrim(p_reason), null, v_after
    );
  else
    select * into v_rule
    from private.submission_risk_lexicon as rule
    where rule.id = p_rule_id
    for update;
    if not found then
      raise exception 'Risk rule not found' using errcode = 'P0002';
    end if;
    if not private.has_staff_role('owner') or not private.has_recent_totp() then
      raise exception 'Owner access and recent TOTP required' using errcode = '42501';
    end if;
    v_before := pg_catalog.to_jsonb(v_rule);
    update private.submission_risk_lexicon as rule
    set term = pg_catalog.btrim(p_term),
        language = p_language,
        risk_level = p_risk_level,
        active = p_active,
        updated_by = v_actor,
        updated_at = pg_catalog.clock_timestamp()
    where rule.id = p_rule_id
    returning * into v_rule;
    v_after := pg_catalog.to_jsonb(v_rule);
    insert into private.submission_risk_lexicon_audit (
      rule_id, actor_user_id, action, reason, before_value, after_value
    ) values (
      v_rule.id, v_actor, 'updated', pg_catalog.btrim(p_reason), v_before, v_after
    );
  end if;
  return v_rule.id;
end;
$function$;

revoke all on function private.owner_save_submission_risk_rule(uuid, text, text, text, boolean, text)
  from public, anon, service_role;
grant execute on function private.owner_save_submission_risk_rule(uuid, text, text, text, boolean, text)
  to authenticated;
create function public.owner_save_submission_risk_rule(
  p_rule_id uuid, p_term text, p_language text, p_risk_level text, p_active boolean, p_reason text
)
returns uuid
language sql security invoker set search_path = ''
as $function$
  select private.owner_save_submission_risk_rule(p_rule_id, p_term, p_language, p_risk_level, p_active, p_reason);
$function$;
revoke all on function public.owner_save_submission_risk_rule(uuid, text, text, text, boolean, text)
  from public, anon, service_role;
grant execute on function public.owner_save_submission_risk_rule(uuid, text, text, text, boolean, text)
  to authenticated;

create function private.owner_list_submission_risk_lexicon_audit(p_limit integer default 30)
returns table (
  id bigint,
  rule_id uuid,
  actor_user_id uuid,
  action text,
  reason text,
  before_value jsonb,
  after_value jsonb,
  occurred_at timestamptz
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
  return query
  select audit.id, audit.rule_id, audit.actor_user_id, audit.action, audit.reason,
    audit.before_value, audit.after_value, audit.occurred_at
  from private.submission_risk_lexicon_audit as audit
  order by audit.occurred_at desc, audit.id desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
end;
$function$;
revoke all on function private.owner_list_submission_risk_lexicon_audit(integer) from public, anon, service_role;
grant execute on function private.owner_list_submission_risk_lexicon_audit(integer) to authenticated;
create function public.owner_list_submission_risk_lexicon_audit(p_limit integer default 30)
returns table (
  id bigint, rule_id uuid, actor_user_id uuid, action text, reason text,
  before_value jsonb, after_value jsonb, occurred_at timestamptz
)
language sql volatile security invoker set search_path = ''
as $function$ select * from private.owner_list_submission_risk_lexicon_audit(p_limit); $function$;
revoke all on function public.owner_list_submission_risk_lexicon_audit(integer) from public, anon, service_role;
grant execute on function public.owner_list_submission_risk_lexicon_audit(integer) to authenticated;
