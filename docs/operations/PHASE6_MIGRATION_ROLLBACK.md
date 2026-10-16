# Phase 6 migration rollback and recovery notes

This is a local recovery plan, not an executable down migration. Never change a hosted project from this local checkout. Prefer a reviewed forward migration when correcting metadata/index projections.

## `20261005160001_mmwr_restrict_ip_hook_function_grants.sql`

This migration removes direct client/service execution of the legacy IP-block checker, removes the unnecessary `authenticator` grant on the PostgREST pre-request wrapper, and removes `authenticator` access to the private schema. The wrapper remains executable by `anon`, `authenticated`, and `service_role`; its `SECURITY DEFINER` body can call the legacy checker. The local IP-block gates remain disabled.

If a reviewed isolated target requires rollback, first verify its PostgREST `db-pre-request` execution semantics. Then restore only the former grants: `GRANT USAGE ON SCHEMA private TO authenticator`, `GRANT EXECUTE ON FUNCTION private.enforce_owner_ip_block_data_api() TO anon, authenticated, service_role, authenticator`, and `GRANT EXECUTE ON FUNCTION private.enforce_owner_ip_block_data_api_single_header() TO authenticator`. Do not run this rollback on a hosted environment from this checkout.

## `20261005160000_mmwr_sitemap_public_tag_ids.sql`

This additive migration creates `public.public_sitemap_tag_ids()`, a stable `SECURITY INVOKER` set-returning function that emits one UUID per tag currently present in `public.published_previews`. Execution is granted to `anon` and `authenticated`; direct table permissions and existing tag-directory behavior are unchanged. The route uses it only for the sitemap, with exact count metadata and bounded 500-row ordered ranges for both posts and tags.

If a correction is needed, first disable indexing at the application gate or deploy the corrected sitemap reader, then apply a forward `CREATE OR REPLACE FUNCTION` migration with the same public-only boundary and role grants. If the helper is intentionally retired, remove callers first and revoke its grants; dropping the function is unnecessary and should be avoided while any sitemap implementation may reference it. Do not broaden the function to private tag tables or include tag rows absent from the public projection.

Local verification passed on 2026-10-05: `npm run test:local`, including 26 pgTAP files / 637 assertions and DB lint with no schema errors; SEO Node tests, TypeScript, ESLint, and `git diff --check` passed. This records only local validation; a browser crawler, Staging/Production indexing, and Search Console remain subject to separate review and explicit authorization.
