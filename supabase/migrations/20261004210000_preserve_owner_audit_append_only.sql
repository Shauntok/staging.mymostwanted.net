-- Preserve Owner settings audit rows while permitting only Auth-driven actor
-- anonymization. The account-deletion migration made these actor columns
-- nullable and changed their Auth FKs to ON DELETE SET NULL.

create function private.guard_owner_settings_audit_immutable()
returns trigger language plpgsql set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' then
    if old.actor_user_id is not null
      and new.actor_user_id is null
      and (pg_catalog.to_jsonb(old) - 'actor_user_id') = (pg_catalog.to_jsonb(new) - 'actor_user_id') then
      return new;
    end if;
  end if;
  raise exception 'Owner settings audit is append-only' using errcode='42501';
end;
$function$;
revoke all on function private.guard_owner_settings_audit_immutable() from public, anon, authenticated, service_role;

create trigger analytics_valid_read_settings_audit_append_only
  before update or delete on private.analytics_valid_read_settings_audit
  for each row execute function private.guard_owner_settings_audit_immutable();
create trigger analytics_valid_read_settings_audit_no_truncate
  before truncate on private.analytics_valid_read_settings_audit
  for each statement execute function private.guard_owner_settings_audit_immutable();

create trigger post_reaction_icon_audit_append_only
  before update or delete on private.post_reaction_icon_audit
  for each row execute function private.guard_owner_settings_audit_immutable();
create trigger post_reaction_icon_audit_no_truncate
  before truncate on private.post_reaction_icon_audit
  for each statement execute function private.guard_owner_settings_audit_immutable();
