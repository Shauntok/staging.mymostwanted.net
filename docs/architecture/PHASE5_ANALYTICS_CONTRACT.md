# MMWR Phase 5 — Analytics and Campaign Metric Contract

**Status:** Working contract. Confirmed product requirements are separated from definitions that still need Owner approval. Nothing in this document enables analytics, advertising, or billing.

## Purpose and evidence

This document prepares the metrics needed for public Hot ranking, operations reporting, share attribution, and optional advertising. Product requirements come from `MASTER_PLAN.md`, `HANDOFF.md`, the current analytics implementation, and the user's confirmed consent/security requirements. Where the product decision is missing, the item stays explicitly unresolved.

Current approved collection scope is daily public-route page-view totals only. First-party collection requires both `FIRST_PARTY_ANALYTICS_ENABLED=true` and `NEXT_PUBLIC_FIRST_PARTY_ANALYTICS_ENABLED=true`; the browser sends only after the visitor opted into Analytics. GA4 is separately gated by `NEXT_PUBLIC_GA4_ENABLED=true`, a valid measurement ID, and Analytics consent; it remains false by default because GA4 also models visitors and sessions. Account, admin, auth callback, submission status, and report routes are excluded. Advertising and ad tracking remain OFF. The migration chain is applied to the isolated local Supabase database and database boundaries have local pgTAP coverage; no hosted Supabase project has been connected or changed.

The `submit` route category is intentionally excluded from both browser and server collection. A follow-up migration also removes it from the analytics RPC allowlist and staff aggregate response while leaving any pre-existing daily aggregate rows untouched. This change is local and has not been applied or database-verified.

## Confirmed rules

- Every public pathname navigation or full-page refresh counts as one Page View; do not deduplicate refreshes. Query-only changes within the same pathname are not separately counted by the current implementation; any future search-event metric must be separate and must not send the query text.
- Analytics is optional and may not run before Analytics consent. Revoking consent stops later collection and updates GA consent to denied.
- Advertising, ad placements, campaign tracking, and Featured/Boost are OFF unless explicitly enabled by Owner.
- Raw client IP, account ID, evidence, submitted content, and sensitive query values must not be included in event payloads, persisted in Analytics, or appear in Campaign exports. IP-derived material may be used transiently on the server for rate limiting, but raw IP must not be shown to non-authorized staff.
- Hot ranking is based on filtered natural valid reads and remains separate from paid or manually Featured/Boost placement.
- Admin can view operational aggregates but cannot view customer, quote, budget, or revenue details. Those are Owner-only at server and database permission layers.

## Metric definitions

| Metric | Working definition | Current state / guardrail |
|---|---|---|
| Page View | One successful client-side view of an allowlisted public route category. A hard refresh counts again. Query strings, fragments, entity IDs, titles, and search text are omitted; only a route category is sent. | Implemented locally as daily route-category aggregates, with consent and two environment flags. HMAC address material is only used for abuse rate limiting and expires within 48 hours; it is not a visitor ID. |
| Valid Read | A candidate Hot-ranking event for a currently published post, separate from Page View. It requires Analytics consent, at least 10 seconds with the tab visible, and scrolling through at least 50% of the post body; at most one event per ephemeral browser token, post, and UTC day. The server rechecks current publication state and requires an HttpOnly, SameSite Strict, HMAC-signed consent attestation. | Conservative local default authorized by Owner on 2026-10-01. Local pgTAP confirms the database rejects writes and ranking while the feature gates are off. The full browser/attestation flow remains untested and is blocked from acceptance because the browser can forge the claimed dwell time, scroll position, and dedup token. Page Views are not a substitute. |
| Unique Visitor | A distinct privacy-preserving analytics identifier within a named reporting period, only if Analytics consent is active. | Do not collect or report in V1. The short-lived per-post deduplication token for Valid Reads is not a Unique Visitor metric and must not be reused across unrelated events. |
| Session | A group of consented public interactions bounded by an inactivity timeout and a maximum lifetime. | Do not collect or report in V1. Do not claim session or bounce metrics from route totals. |
| Share Intent | A user action that opens a supported share destination or invokes the device Share Sheet. Copy-link, QR download, and image download are separate actions. | Do not collect in V1. An intent/click does not prove a share was completed. |
| Referral Visit | A public site arrival attributed to a campaign/share token that contains no user identity and is validated server-side. | Do not collect in V1. Never store raw referring URLs or query text. |
| Ad Impression | A placement delivery event emitted only when an explicitly enabled, approved campaign creative is eligible and actually rendered in an enabled slot. | Advertising and impression collection remain OFF. No billable event is defined. |
| Viewable Impression | An impression that satisfies the future approved visibility and duration rule. | Advertising and viewability collection remain OFF; no billing or CPM count. |
| Ad Click | A user click on an enabled disclosed campaign creative, excluding invalid/bot events under the future policy. | Advertising and click collection remain OFF; no CPC billing. Natural Hot score never includes paid clicks. |

## Owner-authorized conservative defaults (2026-10-01)

Owner authorized conservative defaults for metric definitions. The latest scope decision is that route-category Page Views are the only generally available analytics metric in this stage. Valid Read/Hot remains a separately implemented, dormant capability and must stay disabled, along with Unique Visitor, Session, share/referral, and advertising collection. These defaults guide local development only; all analytics collection and advertising switches remain OFF until the interface review, tests, migration review, and environment acceptance are complete.

- The Page View dashboard defaults to the most recent 30 days; its existing selector may offer 7, 30, or 90 days. Route aggregates become eligible for deletion after 13 months and rate-limit HMACs after 48 hours. The existing daily cleanup removes eligible rows on its next run (up to roughly one day later). These are local conservative defaults selected by the Owner on 2026-10-01; hosted cleanup must not be applied or enabled until privacy review and Staging acceptance.
- General Page View collection requires both First-party environment flags and Analytics consent. Both flags remain false by default. It accepts only fixed public route categories, sends one route category per page navigation/refresh, and stores daily route totals only. No query string, entity ID, visitor/session token, source, device, or raw IP is part of the metric.
- GA4 remains off even if a measurement ID is present; it requires the additional explicit `NEXT_PUBLIC_GA4_ENABLED=true` flag and Analytics consent. Because GA4's standard reporting includes visitor/session constructs outside the approved route-total metric, do not enable this flag until a separate scope decision.
- Valid Read collection and public Hot require their separate server, browser, and database gates. They remain false/disabled; the algorithm settings below are dormant local design values and do not authorize recording reads or displaying rankings.

- Hot score uses natural Valid Reads only: `3 × last 1 hour + 2 × last 6 hours + 1 × last 24 hours`. A post must have at least 100 Valid Reads in the last 24 hours to qualify. Ties use latest publication time, then stable post ID. Featured/Boost and paid events are excluded and remain OFF.
- The Valid Read event requires 10 seconds in the foreground and 50% post-body scroll. One event per random, per-post token per UTC day. The token is created only after Analytics consent, rotated daily, stored only as a server-keyed HMAC, and never joined across posts or reported as a person.
- Unique Visitor, Session, Share Intent, Referral Visit, and all Advertising events remain uncollected in V1. This is an explicit conservative omission, not an unresolved identity design.
- If Valid Read/Hot is authorized in a later phase, the proposed dormant local design uses per-post deduplication material expiring within 48 hours and hourly aggregates retained for 30 days. The current public-route aggregate retention remains 13 months. The local migration schedules cleanup, but it must not be applied to a hosted environment until legal/privacy review. Raw IP is never stored or reported; existing IP-derived rate-limit material remains separate and expires within 48 hours.
- Bot handling starts with duplicate-token rejection, publication-state recheck, strict request bounds, and existing server-side rate limits. It does not claim perfect bot detection; any discovered inflation blocks opening Hot until corrected.

## Privacy, access, and retention boundaries

- Existing daily route totals are aggregate-only and may be used for operations dashboards. They do not support Unique Visitor, Session, Top Posts, geographic attribution, referral source, or campaign billing.
- The current per-address HMAC is an abuse limiter only, keyed with a server secret, never reversible by design, and purged after 48 hours. It is not an analytics identity, and must not be exposed in reports.
- Future event payloads should use closed event names and fixed route/post identifiers where needed; no free-form search text, evidence reference, submitter ID, exact coordinates, or arbitrary URL.
- Non-essential collection must respect stored consent. Marketing/ad storage is governed separately by Advertising consent; enabling analytics does not enable ads.
- Owner-approved local defaults set per-post deduplication material to 48 hours, hourly Valid Read aggregates to 30 days, and daily route aggregates to 13 months. Cleanup runs daily, so eligible rows may remain until the next run. These cleanup jobs must remain unverified/unapplied on hosted environments until legal/privacy review and retention acceptance pass.
- Admin-facing analytics should be operational aggregates only. Owner-only commercial data needs separate tables, RPCs, exports, and audit events; do not join campaign/customer money into Admin reports.

## Owner Campaign CRM quote scope (confirmed 2026-10-04)

The first local CRM slice is a private quote register, not an advertising system. It records client name, quote amount in MYR, Flat Fee/CPM/CPC quote model, a proposed ad-slot note, optional dates, text-only creative notes, and a workflow status. It does not collect contact details, upload creative files, reserve/serve an ad slot, emit impressions/clicks, track referrals, create billable events, or generate invoices. CPM/CPC are descriptive quote models only; there is no delivery count to multiply by a rate. A `confirmed` status is an internal quote state and does not authorize or start ad delivery.

Campaign quote rows and their changed-field audit are held in separate private tables, with no direct browser-role table grants or reusable client directory. Owner reads and writes require recent TOTP; writes also require a reason. The audit stores field names rather than duplicating the commercial values. Admin allowlists and operational Analytics remain separate. Local CSV and print-to-PDF export controls are documented as a convenience only and have not been validated; they do not add advertising placements or billing.

## Decisions and gates still open before hosted collection

1. Legal/privacy review must confirm analytics and aggregate retention durations before any collection is enabled in a hosted environment.
2. Coarse region/device/source dimensions remain out of scope; any future addition needs a separate necessity, granularity, and consent review.
3. Advertising stays off; future viewability and billable-event rules require an explicit Owner decision before any campaign can be billed.

The authorized route Page View defaults and dormant Valid Read/Hot design are represented in local source. Local pgTAP verifies the service-only Page View writer, route exclusions, rate limits, staff TOTP access, default-off Valid Read/Hot gates, hidden historical submission totals, and synthetic cleanup boundaries. Keep all collection flags OFF, and keep ranking, Unique Visitor/Session, share/referral, and paid campaigns disabled. The quote-only Owner CRM and its PDF/CSV exports are local UI only and remain unusable for real client data until interface review and security validation; they contain no delivery or billing metrics. The consent-attestation endpoint, consent withdrawal in a browser, Owner threshold UI, and quote exports remain untested. The cleanup schedule must not run on hosted environments until legal/privacy review.

## Implementation acceptance criteria

- Page View increments once for every actual public navigation/refresh after consent; no private route or query/entity data is sent.
- Revoking consent prevents subsequent First-party and GA4 collection; no non-essential scripts load before consent.
- Invalid, duplicated, scripted, bot-like, hidden, or unpublished-post events cannot inflate Valid Read, Hot Score, or ad billing; all corrections are attributable and auditable.
- Public Hot Score is deterministic for the same event set and time window and never incorporates campaign payments, Featured/Boost, or advertising clicks.
- Admin and Owner APIs/RLS expose only their approved scopes; exports contain no identity, raw IP, private evidence, or arbitrary URLs.
- Each event class has an explicit retention rule and deletion path before collection is enabled.

### Integrity blocker for Valid Read / Hot

The current request path accepts the browser's claimed `visibleSeconds`, `scrollPercent`, and client-generated per-post token. The HMAC attestation binds Analytics consent, but does not attest to visibility duration, scroll position, or token generation. An attacker can forge these request fields and mint tokens; rate limits and per-post/day deduplication only constrain volume. Therefore the current pipeline cannot describe its records as verified reading behavior. Keep Valid Read and Hot disabled until the evidence model is redesigned or the product owner explicitly accepts a weaker, accurately named signal. This limitation is a release gate, not a test that can be passed by replaying browser scenarios.
