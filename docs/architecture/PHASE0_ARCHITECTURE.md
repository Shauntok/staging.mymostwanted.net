# MMWR Phase 0 — Architecture, Trust Boundaries and Data Inventory

**Review date:** 2026-10-05
**Workspace:** C:\Users\PC\Desktop\mmwr  
**Authority:** HANDOFF.md and the approved requirements in this conversation
**State:** The local application and local Supabase development stack are configured and have passed the current local test suite. This is not a hosted-environment or launch readiness statement: no managed Supabase, Staging, Production, SMTP, Cloudflare R2, GA4 or search-console configuration is verified here.

## Repository and runtime snapshot

- Independent Next.js App Router project using TypeScript, React, and Tailwind CSS. The current package pins Next.js 16.3.6 and React 19.2.8; TypeScript 5, Tailwind CSS 4, and ESLint 9 are declared. The available runtime is Node.js 24.11.1 and npm 11.6.2.
- The project was bootstrapped as an independent Git repository. Current development branch is codex/mmwr-plan.
- app/layout.tsx contains site metadata and defaults search indexing to false unless an explicit environment value allows it.
- components/shell/PreferencesProvider.tsx owns browser language, theme, age-gate and consent preferences; it is not authentication or a server authorization boundary.
- The initial Phase 0 scaffold used empty homepage section shells. The current approved homepage count is Latest 8, Hot Ranked 8, and Tags 12; see `MASTER_PLAN.md` for implementation status.
- Supabase CLI 2.118.0 is pinned as a development dependency. The local config disables automatic exposure of new tables and seed data and enables native Auth MFA recovery codes. The current 103-file migration chain is applied to the local Supabase database; the latest local test run passes 26 pgTAP files / 637 assertions and `supabase db lint --local` reports no schema errors. Email/password flows, app-owned email verification, Turnstile Siteverify helpers, staff MFA/session controls, submissions/moderation and evidence workflows have local implementations and regression coverage, but hosted Auth, real email/CAPTCHA delivery, UI acceptance and Staging role/permission verification remain open. `.env.example` contains variable names and safe defaults, not service credentials. Local Supabase CLI-generated credentials are not checked into the repository.
- ourlittleage is a separate source repository. This review does not change it or import its application code/data.

## Trust and data-flow boundaries

Visitor browser → MMWR Next.js app/server → public approved data only
Signed-in browser → MMWR server → authenticated, session-bound reads/writes
Admin/Owner browser → MMWR server → session + mandatory TOTP → role-checked data access
MMWR server → Supabase Postgres with RLS → approved public queries / scoped private data
MMWR server → private Supabase Storage → short-lived authorized URLs for allowed evidence
MMWR server → SMTP → account mail and Owner critical-security alerts only
Supabase database and Storage → encrypted scheduled backup → separate Cloudflare R2
MMWR server → first-party analytics; GA4 receives events only after Analytics consent

The browser age gate and Cookie Consent are presentation and preference controls. They do not replace authentication, RLS, server-side role checks, private Storage policies, or rate limits. No privileged key may enter a browser bundle. Public queries must select currently published records only; draft, pending, rejected, hidden, internal, account, audit, and commercial data stay behind server authorization. GA4 is optional and must not load before affirmative Analytics consent. Advertising is OFF.

### Role and capability outline

| Actor | Intended access |
|---|---|
| Visitor | Approved public page data and the approved excerpt/thumbnail experience; no pending content, private evidence, account identity, internal risk flags, audit data or commercial data. |
| Registered user | Visitor access plus full authorized reading and one Reaction per post. Submissions are currently closed; future submission access will require verified email. Once the workflow is enabled, users can see their own submissions and append requested supporting information, but cannot revise submitted core facts. |
| Suspended user | Can log in and read, but cannot submit or React while restrictions apply. |
| Admin | Moderate ordinary submissions, edit presentation and neutral wording without changing core facts/evidence meaning, view internal evidence with audit, process routine abuse actions and operational analytics. Cannot approve required high-risk cases, permanently delete public content, permanently ban/IP-block, change evidence visibility, or view customer quotes/budgets/revenue. |
| Owner | Admin capabilities plus high-risk approval, internal/public evidence visibility decisions, Emergency Hide and final deletion decisions, permanent bans/IP blocks, commercial data, security configuration, and Admin layout reset. |

Owner and Admin must pass TOTP 2FA before entering the production management area. These permissions must be enforced on server/data boundaries, not by hidden UI controls.

## Data classification and lifecycle

| Class | Examples | Visibility / control | Retention basis currently approved |
|---|---|---|---|
| Public approved content | Published post title, approved body, public attachments, tags and region | Public pages/search may expose approved fields only; removal must also update caches and indexing. | Content policy and removal lifecycle in HANDOFF.md. |
| Submission / moderation | Original submission, status, corrections, reviewer notes, risk signals, revision diffs | Author sees only permitted status/reason; Admin/Owner review; risk signals and review material never public. | Original text, evidence, IP and review records have a one-year retention requirement after permanent removal, subject to unresolved legal review. |
| Evidence files | Images, audio, PDFs and allowed documents | Private Storage. Public-facing file delivery is separate; internal evidence is Admin/Owner-only, read-audited, and visibility changes are Owner-only. No video in V1. | One-year retention basis for removed records; exact backup and active-record lifecycle still needs operational policy. |
| Account identity | Email, auth state, username history, deletion request | Private to the account and authorized service/admin flows; no public user directory or public post attribution. | Account deletion has a seven-day cancellation window; account/content unlinking rules are in HANDOFF.md. |
| Security and audit | Login events, 2FA failures, moderation actions, internal evidence access, emergency actions | Restricted operational records; Admin cannot tamper with general audit records; Owner can perform approved high-risk actions. | Notification history is 90 days; Audit Log retention is independently configurable and not yet specified. |
| Raw analytics / IP | Page events, abuse signals, coarse region, source/device | Restricted service-side analytics; never shown as a personal IP to ordinary Admin or in public output. Optional third-party analytics requires consent. | Analytics raw-event duration and exact IP retention need a decision; do not infer the content/evidence one-year period applies to analytics. |
| Campaign / commercial | Advertiser/customer, quote, budget, rate model, campaign amount | Owner-only at server/API/RLS level. Admin may receive aggregate operational metrics only. | Not yet specified. |
| Backup | Database dump, Storage inventory and encrypted file copies | Separate Cloudflare R2 account/bucket with server-only credentials, encryption and integrity manifests. | 7 daily + 4 weekly + 6 monthly restore points. RPO/RTO and immutable-delete protection need confirmation. |

## Environment-variable names

The same names may be used in isolated Development, Staging and Production environments; their values must be independently provisioned in each provider's environment manager. Never copy values between environments or add them to this document.

| Group | Names present in .env.example | Current use/status |
|---|---|---|
| Site and indexing | NEXT_PUBLIC_SITE_URL, ALLOW_SEARCH_INDEXING | Local site metadata; indexing remains disabled by default and should only be enabled after Production review. |
| Supabase | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY | Server-side SSR client, session refresh Proxy, Auth actions and local migrations are authored. Supabase URL/key are placeholders only. The secret key is not used by the Auth pages and remains server-only if later needed. |
| Turnstile | TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY | Local Siteverify integration covers authentication and feedback/report flows; final submission remains closed. No provider keys or hosted hostname/action verification are configured. Secret remains server-only. |
| SMTP | SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM | Server-only app verification sender and error-minimized critical-security mail pipeline are implemented locally. No mail provider is configured and no email has been sent in this review. Password-reset mail remains Supabase Auth SMTP-managed. |
| R2 backups | R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, MMWR_BACKUP_ENABLED, MMWR_BACKUP_ENCRYPTION_KEY | Local encrypted backup/export, R2 adapter, one-shot orchestration, manifest and Storage-only isolated restore components exist. No R2 credentials or schedule are configured; no combined DB+Storage recovery has passed, and backup gates remain OFF. |
| Analytics | FIRST_PARTY_ANALYTICS_ENABLED, NEXT_PUBLIC_FIRST_PARTY_ANALYTICS_ENABLED, NEXT_PUBLIC_GA4_ENABLED, NEXT_PUBLIC_GA_MEASUREMENT_ID | Consent-gated route-level Page View code is implemented locally and remains disabled by default. GA4 has not been configured; Valid Read/Hot and other non-approved event categories remain off. |

Local Development uses the local Supabase stack. `.env.example` contains placeholders only. No managed Dev project, Staging, Production, Vercel deployment, SMTP, R2, GA4, Search Console or Bing Webmaster account is configured or verified. Do not infer hosted readiness from local migrations, tests or implementation.

## Decisions still open

These are recorded in HANDOFF.md; Phase 0 does not choose them:

- Licensed Malaysia State/City boundary dataset and attribution requirements.
- SMTP provider and sending domain; production domain/DNS.
- Telegram support/report destination.
- Upload size/count limits per file type and malware scanning/quarantine provider.
- Exact raw analytics and IP retention periods; RPO/RTO; immutable backup controls.
- Legal text, review/appeal/removal policy and privacy handling reviewed by Malaysia counsel.
- GA4 consent configuration, event definitions and Search Console/Bing ownership setup.
- Source-project migration choices after evidence review.

## Verification boundary

This document describes the checked-in local structure and approved target architecture. It does not certify RLS, 2FA, SMTP, backups, consent-gated GA4, WAF, SEO indexing, Staging or Production. Those integrations and security validations remain future work.
