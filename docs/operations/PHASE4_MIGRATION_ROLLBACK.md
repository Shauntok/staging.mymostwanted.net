# Phase 4 migration rollback and recovery notes

This is a local recovery plan, not executable down SQL and not authorization to modify any database. Prefer a reviewed forward migration; never remove private evidence or derivative objects as a rollback shortcut.

## `20261005150000_mmwr_public_thumbnail_derivatives.sql`

This migration adds the default-off `public_thumbnails` runtime flag, a derivative object path and integrity constraint on `private.evidence_metadata`, the sanitized-thumbnail count on `public.published_previews`, a trigger to keep that count behind the flag, and service-role-only scanner registration/resolution RPCs. It creates or updates the dedicated `mmwr-public-thumbnail-derivatives` Storage bucket as **private**, limited to 512 KiB WebP files. It also replaces `begin_account_deletion_auth_attempt` so Auth deletion stops when the user owns any object in either evidence bucket or has evidence metadata.

The application thumbnail gate, database flag, submission, and scanner must remain OFF during recovery. To retire or correct the feature, first stop derivative creation and route callers with a reviewed application change, then use a forward migration. Preserve the strengthened account-deletion object-ownership check, including the derivative bucket, even if thumbnail display is retired. Do not drop the private bucket, remove objects, expose object paths, or remove the ownership check until an approved retention/backup plan accounts for every object and all backup/restore callers. If the feature is permanently removed, prove the bucket is empty and no Worker, delivery route, backup, or restore path depends on it before any separately reviewed cleanup. Keep scanner RPC execution service-role-only and leave both thumbnail gates OFF.

Local verification on 2026-10-05: the migration is applied only to the local Supabase instance. pgTAP covers runtime-flag behavior, public count projection, immediate hide/visibility revocation, service-role boundaries, and account-deletion evidence ownership. Full local tests and DB lint passed. No hosted bucket, Staging, Production, Worker, submission, or feature gate was changed or enabled. This does not establish full Storage lifecycle or isolated restore acceptance.

## `20261006100000_mmwr_public_thumbnail_rate_limit.sql`

Adds a private, RLS-protected table containing only keyed client hashes and minute/hour counters, plus a server-role-only rate-check RPC (180 requests/minute and 3,000/hour; stale hashes older than 48 hours are removed on checks). The public delivery route must continue to fail closed when trusted proxy address configuration or the database limiter is unavailable. To revise this policy, deploy a reviewed forward migration and preserve the no-direct-table-access boundary; do not weaken rate limiting by falling back to process-local counters. The HMAC key and trusted-header selection reuse the search rate-limit configuration and must only be set after verifying the hosting proxy overwrites the selected header.

This migration has not been applied or executed locally because the Docker Desktop database is unavailable. Keep thumbnail gates OFF until pgTAP, database lint, trusted-proxy behavior, and Staging request-rate checks pass. No hosted environment was changed.

## `20261006114809_staff_storage_usage_breakdown.sql`

Adds an Admin/Owner + recent-TOTP summary RPC that reads aggregate counts and recorded byte sizes for only the private evidence quarantine and private thumbnail derivative buckets. It does not expose object names, paths, or individual metadata and does not alter Supabase-managed Storage schema or contents. The Admin dashboard reads this RPC instead of the older evidence-only summary.

This is an additive read-only forward migration. If the change must be retired, first return the dashboard caller to the existing evidence-only RPC, then use a separately reviewed forward migration to revoke/drop only the new summary functions. Never delete or modify Storage objects as rollback. The migration and pgTAP test have not been applied or run because Docker Desktop is unavailable; the explicit storage budget, orphan cleanup/retention, and billing limits remain undecided. No hosted environment was changed.
