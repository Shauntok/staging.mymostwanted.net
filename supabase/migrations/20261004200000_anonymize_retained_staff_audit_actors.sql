-- Account deletion preserves staff audit/Clarification history while unlinking
-- the deleted Auth identity, consistent with the Phase 3 account-deletion rule.

alter table private.analytics_valid_read_settings_audit
  alter column actor_user_id drop not null;
alter table private.analytics_valid_read_settings_audit
  drop constraint analytics_valid_read_settings_audit_actor_user_id_fkey,
  add constraint analytics_valid_read_settings_audit_actor_user_id_fkey
    foreign key (actor_user_id) references auth.users(id) on delete set null;

alter table private.post_reaction_icon_audit
  alter column actor_user_id drop not null;
alter table private.post_reaction_icon_audit
  drop constraint post_reaction_icon_audit_actor_user_id_fkey,
  add constraint post_reaction_icon_audit_actor_user_id_fkey
    foreign key (actor_user_id) references auth.users(id) on delete set null;

alter table private.post_relationships
  alter column created_by drop not null;
alter table private.post_relationships
  drop constraint post_relationships_created_by_fkey,
  add constraint post_relationships_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table private.clarification_removal_proposals
  alter column proposed_by drop not null;
alter table private.clarification_removal_proposals
  drop constraint clarification_removal_proposals_proposed_by_fkey,
  add constraint clarification_removal_proposals_proposed_by_fkey
    foreign key (proposed_by) references auth.users(id) on delete set null;
alter table private.clarification_removal_proposals
  drop constraint clarification_removal_proposals_decided_by_fkey,
  add constraint clarification_removal_proposals_decided_by_fkey
    foreign key (decided_by) references auth.users(id) on delete set null;

-- A finalized proposal keeps its decision, reason and time after the deciding
-- account is deleted; only the actor reference may then be null.
alter table private.clarification_removal_proposals
  drop constraint clarification_removal_decision_consistent,
  add constraint clarification_removal_decision_consistent check (
    (decision is null and decided_by is null and decision_reason is null and decided_at is null)
    or (decision is not null
      and pg_catalog.char_length(pg_catalog.btrim(coalesce(decision_reason,''))) between 1 and 500
      and decided_at is not null)
  );

-- The relationship row has immutable-field triggers. Permit only the narrow
-- FK-driven nullification while preserving every relationship field.
create or replace function private.guard_post_relationship()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if tg_op='UPDATE'
    and old.created_by is not null
    and new.created_by is null
    and (pg_catalog.to_jsonb(old) - 'created_by') = (pg_catalog.to_jsonb(new) - 'created_by') then
    return new;
  end if;
  if new.relationship_type <> 'clarifies'
    or not exists(select 1 from private.posts p where p.id=new.clarification_post_id and p.post_type='clarification')
    or not exists(select 1 from private.posts p where p.id=new.referenced_post_id and p.post_type='story') then
    raise exception 'invalid clarification relationship' using errcode='23514';
  end if;
  if tg_op='UPDATE' and current_setting('mmwr.clarification_rebind',true) is distinct from 'on'
    and (old.clarification_post_id is distinct from new.clarification_post_id
      or old.referenced_post_id is distinct from new.referenced_post_id
      or old.relationship_type is distinct from new.relationship_type
      or old.created_by is distinct from new.created_by
      or old.created_at is distinct from new.created_at) then
    raise exception 'relationship changes require the Owner RPC' using errcode='42501';
  end if;
  return new;
end;
$function$;
revoke all on function private.guard_post_relationship() from public, anon, authenticated, service_role;

create or replace function private.allow_clarification_rebind()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if old.created_by is not null
    and new.created_by is null
    and (pg_catalog.to_jsonb(old) - 'created_by') = (pg_catalog.to_jsonb(new) - 'created_by') then
    return new;
  end if;
  if current_setting('mmwr.clarification_rebind',true) is distinct from 'on'
    and (old.clarification_post_id is distinct from new.clarification_post_id
      or old.referenced_post_id is distinct from new.referenced_post_id
      or old.relationship_type is distinct from new.relationship_type
      or old.created_by is distinct from new.created_by
      or old.created_at is distinct from new.created_at) then
    raise exception 'relationship changes require the Owner RPC' using errcode='42501';
  end if;
  return new;
end;
$function$;
revoke all on function private.allow_clarification_rebind() from public, anon, authenticated, service_role;
