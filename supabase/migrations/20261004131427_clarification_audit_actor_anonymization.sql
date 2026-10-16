-- Retained Clarification history keeps its row when an Auth identity is deleted.
-- Match the narrow anonymization exception used by sibling audit tables.
create or replace function private.reject_clarification_audit_mutation()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if tg_op = 'UPDATE'
    and old.actor_user_id is not null
    and new.actor_user_id is null
    and (pg_catalog.to_jsonb(old) - 'actor_user_id') = (pg_catalog.to_jsonb(new) - 'actor_user_id') then
    return new;
  end if;
  raise exception 'clarification audit data is append-only' using errcode = '42501';
end;
$function$;

revoke all on function private.reject_clarification_audit_mutation() from public, anon, authenticated, service_role;
