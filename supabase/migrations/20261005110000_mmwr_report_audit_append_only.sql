-- Keep staff report access and status history append-only while retaining
-- audit rows when an Auth actor is deleted.
create function private.guard_user_report_audit_immutable()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE'
    and old.actor_user_id is not null
    and new.actor_user_id is null
    and (pg_catalog.to_jsonb(old) - 'actor_user_id') = (pg_catalog.to_jsonb(new) - 'actor_user_id') then
    return new;
  end if;
  raise exception 'User report audit is append-only' using errcode = '42501';
end;
$function$;

revoke all on function private.guard_user_report_audit_immutable()
  from public, anon, authenticated, service_role;

create trigger user_report_audit_append_only
  before update or delete on private.user_report_audit
  for each row execute function private.guard_user_report_audit_immutable();

create trigger user_report_audit_no_truncate
  before truncate on private.user_report_audit
  for each statement execute function private.guard_user_report_audit_immutable();
