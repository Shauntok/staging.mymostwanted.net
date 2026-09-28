# MMWR Phase 0 — Architecture, Trust Boundaries and Data Inventory

**Review date:** 2026-09-28  
**Workspace:** C:\Users\PC\Desktop\mmwr  
**Authority:** HANDOFF.md and the approved requirements in this conversation  
**State:** Local development foundation only. No database, authentication, mail, analytics, backup, or deployment provider is configured.

## Repository and runtime snapshot

- Independent Next.js App Router project using TypeScript, React, and Tailwind CSS. The current package pins Next.js 16.3.6 and React 19.2.8; TypeScript 5, Tailwind CSS 4, and ESLint 9 are declared. The available runtime is Node.js 24.11.1 and npm 11.6.2.
- The project was bootstrapped as an independent Git repository. Current development branch is codex/mmwr-plan.
- app/layout.tsx contains site metadata and defaults search indexing to false unless an explicit environment value allows it.
- components/shell/PreferencesProvider.tsx owns browser language, theme, age-gate and consent preferences; it is not authentication or a server authorization boundary.
- components/home/HomePage.tsx contains only a labelled illustrative map preview and empty section shells: Latest 6, Hot Ranked 6, Tags 12.
- Supabase CLI 2.118.0 is pinned as a development dependency. The local config disables automatic exposure of new tables and seed data and enables native Auth MFA recovery codes. Identity, content/submission, and app-owned email verification migrations with explicit RLS/grants are authored; 105 pgTAP assertions are written across four suites but not executed because Docker is unavailable. Email/Password Auth pages, a Next.js SSR client/proxy, PKCE callback, and server-only verification email sender are authored. The Phase 2 schema is not applied/verified against PostgreSQL, no provider is linked, and `.env.example` contains placeholders only; no credentials have been added.
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
| Registered user | Visitor access plus full authorized reading and one Reaction per post. Submission requires verified email. Can see own submission workflow and append requested supporting information, but cannot revise submitted core facts. |
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
| Turnstile | TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY | Reserved; bot protection not integrated. Secret remains server-only. |
| SMTP | SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM | Server-only app verification email sender is authored; no mail provider configured and no SMTP credentials present. Password reset email remains delivered by Supabase Auth through its SMTP configuration. |
| R2 backups | R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET | Reserved; backup pipeline not implemented. Credentials remain server-only. |

Current Dev, Staging and Production values are unconfigured. GA4/Search Console settings have not been added to the template because the tracking and provider workflows have not been implemented or selected.

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
