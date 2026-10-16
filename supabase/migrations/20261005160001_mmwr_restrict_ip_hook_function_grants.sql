-- PostgREST runs db-pre-request after switching to the JWT request role, so
-- authenticator does not need private-schema access or EXECUTE on the hook.
-- The hook remains callable by the request roles it must guard. Its definer
-- body can still invoke the legacy checker without exposing that helper.

revoke execute on function private.enforce_owner_ip_block_data_api()
  from public, anon, authenticated, service_role, authenticator;

revoke execute on function private.enforce_owner_ip_block_data_api_single_header()
  from authenticator;

revoke usage on schema private from authenticator;

-- Rollback (isolated reviewed environment only): restore the previous grants
-- only after confirming the PostgREST execution role semantics for that target:
-- grant usage on schema private to authenticator;
-- grant execute on function private.enforce_owner_ip_block_data_api()
--   to anon, authenticated, service_role, authenticator;
-- grant execute on function private.enforce_owner_ip_block_data_api_single_header()
--   to authenticator;
