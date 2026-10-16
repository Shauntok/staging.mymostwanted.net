# Phase 5 local and hosted acceptance gate

This checklist is a verification plan, not evidence that analytics or advertising is enabled. Local database tests with synthetic, rollback-only data may run before visual UI acceptance; browser/interaction acceptance should follow the Owner's UI review. Hosted configuration and data collection require a later, separate environment review. Production remains out of scope.

## Current local evidence (2026-10-04)

The isolated local Supabase database has the current migration chain applied. Full local pgTAP passes **13 files / 277 assertions**, including `analytics_boundaries.test.sql`: route allowlist and submission/private-route rejection, service-only writer grants, 60-per-minute Page View limiting, recent-TOTP staff reporting, disabled Valid Read/Hot behavior, hiding historical `submit` aggregates, and synthetic cleanup of expired dedup/rate-limit/aggregate rows. The fixtures roll back. `supabase db lint --local` exits 0 with seven unused row-lock-result notices; `supabase db advisors --local --type all --level warn` reports no issues. These checks do not validate browser consent withdrawal, real request attestation, export files, hosted cron behavior, or any enabled analytics collection. No analytics, Hot, advertising, or CRM flag was enabled, and no hosted service was contacted.

**Localized route privacy regression (2026-10-05):** `npm run test:analytics-route-policy` verifies locale prefixes are removed before category assignment, private localized paths and API paths are excluded, and public paths map to coarse route categories without carrying identifiers or query values. The full local run then passed `npm run test:local`: 144 Node tests passed, two opt-in ClamAV tests were skipped, pgTAP passed 26 files / 620 assertions, and database lint found no schema errors. Browser consent/withdrawal and Staging checks below remain outstanding.

**Owner threshold and natural Hot ranking regression (2026-10-06):** `owner_hot_threshold.test.sql` adds 26 rollback-only pgTAP assertions for RLS/grants, anon/Admin/member denial, Owner AAL2/recent-TOTP read and write, range/reason validation, audit contents, no-op behavior, locked changes while collection/Hot is enabled, stale-TOTP denial, and direct audit mutation denial. `hot_pagination.test.sql` now has 14 assertions, including the `3×1h + 2×6h + 1×24h` score, the 100-read default threshold, 24-hour counts, deterministic same-score ordering, and pagination. Both targeted files and the full local suite pass: 27 pgTAP files / 678 assertions, no Node failures (two real ClamAV checks skipped by default), and no database lint errors. This validates database logic/authorization only; it does not validate Owner UI, browser behavior, or the trustworthiness of client-reported reading signals. Collection and Hot gates remain OFF.

## Default-off controls

- Confirm both `FIRST_PARTY_ANALYTICS_ENABLED` and `NEXT_PUBLIC_FIRST_PARTY_ANALYTICS_ENABLED` are false or absent.
- Confirm the approved default metric is daily public-route Page Views only. The Page View report opens on 30 days and offers only 7/30/90-day windows; daily aggregates become eligible after 13 months and limiter HMACs after 48 hours, then are removed by the next daily cleanup run.
- Confirm `VALID_READS_ENABLED`, `NEXT_PUBLIC_VALID_READS_ENABLED`, and `HOT_RANKING_ENABLED` are false or absent, and that the private database collection/Hot settings remain false. The dormant Valid Read/Hot design does not authorize collecting or publishing those metrics.
- Confirm `NEXT_PUBLIC_GA4_ENABLED` is false or absent; a configured Measurement ID alone must not load GA4. Keep GA4 disabled because its standard reporting includes visitor/session constructs outside the approved route-total metric.
- Confirm advertising, campaign tracking, and Featured/Boost have no enabled runtime setting or public placement.
- Confirm a disabled First-party API responds without recording or retaining analytics input.

## Page Views

- In isolated Staging, apply `20261001044447_exclude_submission_analytics_route.sql` with analytics disabled. Confirm `submit` is rejected at the browser/API/RPC boundaries and omitted from staff reports while historical aggregate rows remain preserved.
- After Analytics consent only, verify each allowlisted public pathname and hard refresh increments the aggregate exactly once.
- Verify query-only changes do not create a route Page View and search text, fragments, post UUIDs, title, account ID, raw IP, and full URL are absent from the payload and storage.
- Verify both unlocalized paths and localized equivalents (`/zh-cn`, `/en`, `/ms`) for `/submit`, `/submissions`, `/report`, `/account`, `/admin`, and `/auth` are excluded by the browser, API, database recorder, and staff report. Include nested routes such as `/en/account/reset-password` and `/ms/submissions/status`; locale-prefixed private pages must never fall through to `other_public`.
- Verify revoking Analytics consent prevents all later First-party and GA4 collection; advertising consent remains independent.
- Verify missing HMAC configuration and a missing/invalid trusted proxy address fail closed without writing a view.

## Valid Read and natural Hot score

**Integrity blocker:** The current browser request supplies `visibleSeconds`, `scrollPercent`, and its per-post dedup token. A signed Analytics-consent attestation proves consent state only; it does not prove that the client actually kept a post visible, scrolled, or used an unmodified token. These values are attacker-controlled even when correctly shaped. Keep Valid Read and Hot disabled until the ingestion design no longer treats those client claims as verified reading evidence, and update the metric name/contract if the revised design can only establish a weaker signal. Rate limits and duplicate rejection reduce abuse but do not resolve this trust gap.

- In isolated Staging only, apply `20261001044906_valid_read_event_pipeline.sql` with all collection/Hot gates OFF. Confirm its settings remain false, only the intended daily cleanup job is scheduled, and no Valid Read or Hot data is emitted until a separately authorized acceptance enables the corresponding gates.
- With consent absent, hidden tab, less than 10 seconds visible, or less than 50% post-body scroll, verify the browser does not send a candidate event; do not treat those client conditions as server-verified evidence.
- Verify the server requires an HttpOnly, SameSite Strict, HMAC-signed Analytics-consent attestation; direct requests without consent or with a forged/expired attestation must not be stored. The cookie must be scoped to `/api/analytics` and cleared after consent withdrawal. Do not enable the Valid Read flags before this behavior is validated.
- With consent granted, verify one eligible event is accepted for one published post per UTC day and duplicate events are rejected; a distinct post may independently qualify.
- Verify the per-post random token is created only after consent, rotates daily, is HMACed server-side, is not joined across posts, and expires from dedup storage within 48 hours.
- Verify the server rejects malformed IDs, unbounded bodies, missing/invalid rate-limit material, unpublished/hidden/removed posts, and rate-limit excess.
- Verify hourly aggregate rows alone support the rolling 1h/6h/24h calculation; raw identifiers are never returned by analytics RPCs.
- Verify `3 × 1h + 2 × 6h + 1 × 24h`, minimum 100 reads in the last 24 hours, and deterministic publication-time/post-ID tie breaks. Paid and Featured/Boost values must not enter this score.
- Confirm the home page still requests 8 ranked posts, while `/hot` returns at most 12 per page and carries the global rank number through pagination. In an isolated fixture call `public_hot_ranked_posts` with offsets 0 and 12 and limit 13; confirm the sentinel is not rendered, a stable fixture does not overlap pages, invalid/out-of-range bounds fail, and the RPC remains read-only with only anon/authenticated execution. Keep all flags OFF. The UI discloses that live ranks may shift between page requests.
- Verify hourly aggregates expire after 30 days and per-post dedup material after 48 hours only in an explicitly authorized Valid Read acceptance. Migration `20261001050300_analytics_page_view_rate_limit_retention.sql` extends the existing cleanup function; it must not create a duplicate cron job. Verify route aggregates become eligible after 13 months and route limiter HMACs after 48 hours; the daily schedule may remove them up to roughly one day later. Confirm UTC cleanup boundaries and that the existing scheduled function includes both route aggregates and route limiter hashes; do not enable or schedule hosted cleanup before privacy review. Keep all Valid Read/Hot collection flags off during route Page View acceptance.
- Any evidence of event inflation, stale publication state, failed expiry, or identifier exposure keeps Hot disabled. The integrity blocker above must be resolved or the metric definition explicitly weakened before Valid Read/Hot acceptance can pass.

## Explicitly uncollected V1 metrics

- Confirm no Unique Visitor or Session identifier/metric is created.
- Confirm no Share Intent, Referral Visit, coarse location, source, or device metric is created.
- Confirm no ad impression, viewability, click, or billable event is emitted. Campaign storage/exports cannot be used for billing until separate approval and validation.

## Staff access and reporting

- Admin and Owner analytics access must require current staff authorization, AAL2, and recent TOTP. Admin must not see Owner-only campaign/customer/quote/budget/revenue fields.
- Confirm the threshold control from `20261001045652_owner_hot_threshold_setting.sql` appears only in the Owner dashboard registry; saves require recent TOTP and a reason and append an audit event. Changing the threshold must not turn on collection or public Hot.
- Reports return aggregates only, with no per-event identifier, raw IP, search text, post body, evidence path, or full URL.
- Verify user data deletion/consent withdrawal behavior and exact retention rules after the scheduled cleanup has run.

## Owner Campaign CRM (quote records only)

- Confirm the CRM is visible only to an authenticated Owner with recent TOTP; Admin, ordinary authenticated users, and anon cannot read/write the private campaign or audit tables or call the private RPCs.
- With synthetic data only, verify create/list/update for client name, MYR quote amount, Flat Fee/CPM/CPC quote model, proposed ad-slot note, optional dates, text-only creative notes, and draft/quoted/confirmed/completed/cancelled status.
- Verify reason and fresh TOTP are required for each write, field and date bounds are enforced by the database, and audit rows record only actor, action, changed field names, reason, and time (not a duplicate snapshot of client/quote content).
- Confirm account deletion is not blocked by retained Campaign references: Auth deletion sets `created_by` and audit actor references to null, the quote/audit history remains, and the audit trigger allows only this identity-nullification update. Confirm the retention period for the retained commercial records before using real customer data.
- Confirm no contact details, uploaded creative assets, ad inventory, public slot, delivery event, impression/viewability/click tracker, billing event, or automated invoice is created. CPM/CPC values remain quotes and cannot be used as billable counts.
- Confirm the campaign widget ID is accepted by Owner dashboard layout RPCs and remains absent from Admin defaults and allowlists.
- With synthetic quote records, verify client/slot filters and inclusive date-range overlap behavior. Confirm the UI and application expose no export/download/print path while export format, branding and retention policy remain undecided. If exports are later approved, add a separate scoped design and acceptance cases for formula injection, branding, bounded fields and output retention before implementation.
- The CRM migration and UI are local only. Do not apply the migration to any hosted project until the Owner has reviewed the UI and separately authorized the isolated Staging acceptance sequence.
