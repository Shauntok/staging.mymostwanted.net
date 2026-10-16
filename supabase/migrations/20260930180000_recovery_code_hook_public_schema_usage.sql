-- Supabase Auth invokes the MFA verification hook as supabase_auth_admin.
-- That role needs schema USAGE to resolve the public hook function; execute
-- remains granted only on the one hook function by its original migration.
grant usage on schema public to supabase_auth_admin;

-- Rollback: revoke this only after confirming no other Auth hook depends on
-- supabase_auth_admin resolving objects in public.
