# MMWR Phase 2A: Core Data Model and RLS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` to implement this plan task-by-task. Each task ends with a security review and an explicit local verification result.

**Goal:** Establish a reproducible local Supabase schema for MMWR's identity, reviewed public content, submissions and access-control foundation, with explicit grants and RLS.

**Architecture:** Keep reviewed public preview data in exposed `public` tables, and keep account-role mappings, submissions, full text, evidence metadata, moderation material and audit data in a non-exposed `private` schema. User-facing access is limited by explicit Postgres grants plus RLS; sensitive Owner/Admin work also requires AAL2. No production or hosted Supabase project is linked by this plan.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase CLI 2.118.0, PostgreSQL, Supabase Auth JWT claims, SQL migration and pgTAP policy checks.

**Spec:** `MASTER_PLAN.md` Phase 2; `HANDOFF.md` role/data-classification requirements; `docs/architecture/PHASE0_ARCHITECTURE.md`.

## Global Constraints

- Treat all external inputs and roles as untrusted; enable RLS on every app-owned table, including tables in `private`.
- Set grants and RLS policies together; use explicit `GRANT` only for required API operations.
- Do not use editable `user_metadata` for authorization; role membership is stored in `private.user_roles`.
- Keep the Supabase service-role key server-only; do not add real credentials or link a hosted project.
- Do not expose submissions, full body text, evidence paths, user identity, moderation signals, audit data or campaign data to anonymous users.
- Anonymous public read access is limited to approved, sanitized post preview fields. Signed-in full-body access and staff-only access are distinct policies.
- Owner/Admin access to staff data requires a current `aal2` claim; role checks also read the database role table.
- No user, post, evidence or analytics seed data. No public boundary data is imported in this phase.
- Keep unresolved retention values as explicit configuration gaps; do not silently apply the one-year content policy to analytics or campaign records.
- Run the local policy verification suite before calling RLS complete. Never apply migrations to Staging or Production in this phase.

---

## Planned File Responsibilities

- `docs/architecture/PHASE2_DATA_MODEL.md`: entity map, data classifications, allowed transitions, role capabilities, and decisions intentionally deferred.
- `package.json` / lockfile: exact pinned local Supabase CLI dependency only.
- `supabase/config.toml`: local-only Supabase services and redirect defaults; no remote reference or secrets.
- `supabase/migrations/*.sql`: schema, constraints, grants, RLS, narrow helper functions, and safe views.
- `supabase/tests/*.test.sql`: allow/deny checks for `anon` and `authenticated`, including owner isolation and AAL2 requirements.
- `lib/supabase/database.types.ts`: generated local schema types after the local schema is available.
- `docs/architecture/PHASE0_ARCHITECTURE.md`, `HANDOFF.md`, and `MASTER_PLAN.md`: implementation state and verification evidence only.

## Task 1: Freeze the core model and permission matrix

**Files:** Create `docs/architecture/PHASE2_DATA_MODEL.md`.

- [x] Define identity rows (`profiles`, `user_roles`) keyed to `auth.users`; email remains in Auth and is never public.
- [x] Define separate record families: sanitized published previews; private full post content; submissions; evidence metadata; aliases/tags/locations; reactions; reports; revisions; audit events; notifications.
- [x] For every family, record owner, status transitions, visibility, mutation authority, and retention decision or explicit unresolved status.
- [x] Include role matrix for visitor, verified/unverified user, suspended user, Admin and Owner. Mark Owner/Admin-only actions and the AAL2 requirement.
- [x] Include the current project constraint that no real records, region boundaries or account records exist.

## Task 2: Add reproducible local Supabase scaffolding

**Files:** Modify `package.json` and lockfile; create `supabase/config.toml`; create first migration using the CLI.

- [x] Pin `supabase@2.118.0` as a development dependency and commit the generated lockfile change.
- [x] Run `npx supabase init`; keep its project id `mmwr` and local-only defaults. Do not run `supabase login`, `supabase link`, or any remote command.
- [x] Confirm the CLI command syntax with `npx supabase migration --help`; create the migration with `npx supabase migration new mmwr_core_identity_and_content` (never invent its timestamped filename).
- [x] Confirm local container readiness with `docker --version`. No Docker-compatible runtime is currently available; SQL may be prepared, but local database execution and pgTAP verification are unverified until a local runtime is available. No system software was installed and no remote project was connected.

## Task 3: Create the identity and role foundation

**Files:** The generated initial migration; `supabase/tests/identity_roles.test.sql`.

- [x] Create the unexposed `private` schema and keep it out of the Data API exposed-schema list.
- [x] Create `public.profiles(id, username, display_name, account_state, deletion_requested_at, created_at, updated_at)` with a foreign key to `auth.users`; enforce a normalized unique username and allowed account states.
- [x] Create `private.user_roles(user_id, role, granted_at, granted_by)` with role values `admin` or `owner`, unique `(user_id, role)`, and no public read/write grant.
- [x] Do not create profiles from email, `user_metadata`, or user-supplied role claims. Trusted profile creation is deliberately deferred to the signup/auth task; the migration does not auto-create partial profiles.
- [x] Allow an authenticated user to select their own profile and update only user-editable display fields; prevent users from changing username ownership, account state, deletion state or role.
- [x] Add a private `SECURITY DEFINER` role-check helper. Set `search_path = ''`, schema-qualify references, check `(select auth.uid())`, grant execute only to `authenticated`, and revoke execute from `PUBLIC`, `anon` and `service_role`.
- [x] Require `auth.jwt()->>'aal' = 'aal2'` in staff-data authorization checks; do not treat a role-table row alone as sufficient for privileged operations.
- [x] Keep one-time recovery-code hashes and security events in private server-owned records. Recovery requires a database-assigned staff role, works at AAL1, atomically consumes a matching hash, and limits failures to five per anchored 15-minute window; replay and concurrent redemption cannot consume the same hash twice.
- [ ] Execute the prepared 30-assertion pgTAP suite to prove profile isolation, role grants, AAL2 checks, recovery replay/rate-limit behavior and private-table access. Static review passed; database behavior remains unverified because Docker is unavailable.

**Task 3 status (2026-09-28):** The migration and 30 pgTAP assertions are authored. Two independent static reviews approved the identity, role, recovery and database-side attempt-limit boundaries. The SQL and assertions have not run against PostgreSQL; Docker is unavailable. Signup/profile provisioning, first Owner provisioning, role mutation, broader security-event writes and account deletion remain deferred to trusted server/auth workflows. Do not claim Task 3's RLS verification complete until the local database suite runs.

## Task 4: Create reviewed content and submission boundaries

**Files:** New CLI-generated migration; `supabase/tests/content_access.test.sql`.

- [ ] Create a public-safe relation containing only published record id, approved title, public excerpt, published timestamp, tag ids and public area id; no full body, submitter identity, evidence object path, risk flag, internal notes or raw-source fields.
- [ ] Store full public body separately and allow it only for authenticated readers and AAL2 staff; anonymous preview must remain bounded to the approved excerpt.
- [ ] Store submissions and unreviewed source text in `private`; the submitter may read their own permitted status and safe reviewer response, while AAL2 Admin/Owner may review. No public API grant to `anon`.
- [ ] Store attachment metadata/object paths in `private`; no Storage bucket or signed URL is created in this phase.
- [ ] Add check constraints and foreign keys for content states, and prevent direct user transitions into published/hidden/deleted states.
- [ ] Add one-public-reaction-per-user-per-post uniqueness and allow only a user's own reaction row. Leave the Reaction icon catalogue for the later feature phase.
- [ ] Create RLS policies and explicit grants per table. Any view exposed via Data API must use `security_invoker = true`; do not create `SECURITY DEFINER` public views or functions.
- [ ] Test anonymous preview limits, full-body authorization, submission owner isolation, staff AAL2 restriction, hidden/draft non-disclosure, and reaction ownership/uniqueness.

## Task 5: Verify, type and document the local schema

**Files:** `lib/supabase/database.types.ts`; architecture/handoff/plan status.

- [ ] On an available local Supabase stack, run `npx supabase db reset` to prove migrations reproduce cleanly.
- [ ] Run `npx supabase test db`; fix all policy failures before recording RLS complete.
- [ ] Run `npx supabase db advisors` and review any security findings. Confirm RLS is enabled on every app table, grants are explicit, and private schemas are not exposed.
- [ ] Generate TypeScript definitions with `npx supabase gen types typescript --local` and save to `lib/supabase/database.types.ts`.
- [ ] Update HANDOFF and MASTER_PLAN with exact migration/test/advisor status. If Docker is unavailable, record schema as authored but unverified and leave the RLS acceptance unchecked.
- [ ] Commit the completed plan task and schema evidence without linking or deploying any remote project.

## Scope boundary

This plan does not implement login UI, email provider setup, TOTP enrollment/recovery UI, Storage buckets/upload scanning, a remote project, real users/content, or any Staging/Production migration. Those remain later Phase 2 plans and user-guided launch tasks.

## Self-review

- The model covers the Phase 2 identity, content, alias/tag/location, evidence metadata, reports, revisions, reactions, notifications and audit foundations; analytics/campaign/backup schemas remain owned by their later phases because their data definitions are not yet ready.
- Authorization separates grants from RLS, public previews from private full text, user roles from user-editable Auth metadata, and role membership from AAL2 assurance.
- Local Docker is absent in the current environment. SQL may be prepared locally, but verification is not complete until a local Supabase runtime is available; remote credentials are not a substitute in this plan.
