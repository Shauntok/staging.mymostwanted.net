# MMWR Phase 0: Repository and Migration Audit

> Derived from Phase 0 of `MASTER_PLAN.md`. `HANDOFF.md` is the decision authority. This plan creates evidence-based project notes before deeper feature development.

## Goal

Record the current MMWR repository state, selective migration opportunities from Our Little Age, trust boundaries, data classes, role scope, environment variable names, and unresolved decisions without copying old application source or exposing credentials.

## Constraints

- Work in `C:\Users\PC\Desktop\mmwr`; do not modify `C:\Users\PC\Desktop\ourlittleage`.
- Never open or report `.env*`, credentials, production content, backups, or user data from either project.
- Keep advertising, translation API, comments, VIP, video, drafts and provider integrations off.
- Preserve the approved homepage Hot Ranked count of 6.
- No provider account configuration, network publishing, or Production deployment.
- Do not add or run tests for this documentation and audit phase.

## Task 1: Inspect Our Little Age selectively

**Files:** Create `docs/OUR_LITTLE_AGE_MIGRATION_MATRIX.md`.

- Read only its agent guidance, project documentation, package manifest, application source, tests as documentation, and schema/migration source.
- Never read its `.env.local`, any backup, real post data, user data, private evidence, or logs.
- Map search, moderation/risk vocabulary, feedback, campaign/ad controls, permissions, share, tags, dashboards/widgets, reactions, comments, and draft behavior.
- For each, record paths as evidence, dependencies and risk, and choose `reuse pattern`, `adapt`, `rewrite`, `defer`, or `do not use`.
- Keep technical similarities separate from MMWR product approval.

## Task 2: Record current architecture and trust boundaries

**Files:** Create `docs/architecture/PHASE0_ARCHITECTURE.md`.

- Record current framework/dependency state and the unintegrated service boundaries.
- Map public visitor, registered user, Admin, Owner, browser, Next.js server, Supabase, SMTP, Cloudflare/R2 and analytics trust/data flows.
- Classify public post, submission, evidence, identity, security/audit, analytics, campaign, and backup data with intended visibility and retention basis from `HANDOFF.md`.
- Record exact environment-variable names from `.env.example`, grouped by Dev/Staging/Production; include no values or credentials.
- Record open decisions already marked unresolved in `HANDOFF.md`; do not invent answers.

## Task 3: Reconcile Phase 0 evidence with the roadmap

**Files:** Update `MASTER_PLAN.md`, `HANDOFF.md`, and `docs/superpowers/plans/2026-09-28-mmwr-foundation.md` only where audit evidence warrants.

- Mark Phase 0 items complete only when the corresponding evidence exists.
- Record blockers, evidence paths and explicit non-production status.
- Keep Phase 1/feature implementation moving where Phase 0 leaves no blocking decision.

## Completion criteria

- The migration matrix has concrete source evidence and honest decisions.
- Architecture/trust/data/environment notes contain no secret values.
- Roadmap status reflects actual completed work and the next implementation phase.
- Existing worktree changes are preserved.
