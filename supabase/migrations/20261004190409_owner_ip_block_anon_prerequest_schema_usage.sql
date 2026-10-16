-- PostgREST runs the configured pre-request hook in the JWT-selected role.
-- The anon role needs schema USAGE to resolve the private hook; its existing
-- function grants and the API's exposed-schema list still limit what it can
-- execute or access. Do not expose `private` through PostgREST.
grant usage on schema private to anon;

-- Rollback: revoke schema USAGE from anon only after the private pre-request
-- hook has been removed or moved behind an invoker-accessible public wrapper.
