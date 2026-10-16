# Phase 4 — Owner Reaction Icon Review

Status: both migrations are applied to the local Supabase database, and the isolated pgTAP coverage passes. Owner browser/UI review and Staging validation remain open. This checklist is not evidence that those acceptance gates passed.

## Owner UI review

- Open `/admin` as an Owner with the existing staff MFA gate satisfied.
- Confirm Admin accounts do not receive the Owner-only icon widget.
- Confirm the three controls remain Helpful / Thanks / Support in all three UI locales.
- Preview each built-in SVG choice; check both Light and Dark themes and a narrow viewport.
- Confirm the form requires a reason and six-digit Authenticator challenge before save.
- Confirm uploads, arbitrary SVG markup, reaction type edits and count controls are absent.

## Later isolated database and Staging checks

- The local database has `20261004150000_owner_reaction_icons.sql` and Phase 3 hook fix `20261004190409_owner_ip_block_anon_prerequest_schema_usage.sql` applied. The latter grants anon only `USAGE` on the private schema so it can resolve the registered pre-request hook; private remains absent from PostgREST's exposed schema list, and private table ACLs remain denied. The public icon RPC remains `SECURITY INVOKER` and returns only the fixed icon identifiers.
- `supabase/tests/owner_reaction_icons.test.sql` passes 19/19 assertions for private-table isolation, public reads, RPC grants, Admin/member denial, Owner access, recent TOTP, allowed icon values, required reason, audit contents, and Owner/Admin dashboard widget boundaries. The actual local anonymous PostgREST call returns HTTP 200 with the three allowlisted values while the pre-request hook is enabled. The full local pgTAP suite passes 25 files / 595 assertions.
- Still verify in the Owner browser session that the three controls remain Helpful / Thanks / Support, all built-in SVG choices render correctly in Light/Dark and narrow layouts, and the form requires a reason plus six-digit Authenticator challenge. Confirm uploads, arbitrary SVG markup, reaction type edits and count controls remain absent.
- Later isolated Staging validation must reconcile both migration IDs, test the public icon RPC through PostgREST for anon/authenticated callers with the pre-request hook enabled, test Owner/Admin session claims and TOTP, and confirm detail reaction meanings/counts are unchanged. Do not apply to Production as part of this review.

## Rollback boundary

The two migrations are applied only locally. Prefer a forward correction if the public RPC needs to change. In a disposable Staging environment, rollback must be reviewed and preserve icon-setting and audit history; do not simply drop the settings table or delete production audit data. If restoring the old invoker wrapper, verify first that the public RPC is no longer exposed to anon and update client behavior so public pages do not depend on a failing endpoint.
