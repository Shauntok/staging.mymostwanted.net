# MMWR Phase 5 — Owner Campaign CRM Design

Date: 2026-10-04  
Status: Draft for user review. No implementation or database rollout is authorized by this draft alone.

## Goal

Give the Owner a private workspace to record campaign customers, commercial quotes and planned placements while preparing for a possible future advertising program. The CRM is an internal record-keeping tool. It does not serve ads, collect impressions or clicks, calculate bills, or give advertisers an account.

## Scope approved for design

- Store customer names and campaign records with quote/budget, a pricing model, placement labels, schedule, creative description, and lifecycle status.
- Support `flat_fee`, `cpm`, and `cpc` as quote models only. CPM/CPC values are entered rates; no delivery metric or invoice amount is derived from them.
- Keep all campaign/customer/commercial data Owner-only at the page, server-action, RPC, and database policy layers. Admin and anonymous users cannot read it.
- Keep ad delivery, placements on public pages, click/impression tracking, Featured/Boost, advertiser Portal, and campaign exports unavailable.
- Do not store contact names, email addresses, phone numbers, arbitrary external asset URLs, uploaded creative files, user IDs, raw IPs, or evidence.

## Architecture

Add a dedicated Owner-only dashboard widget following the existing dashboard registry/layout pattern. Use the existing verified staff session and MFA gate. The page calls narrow server-side campaign RPCs; browser clients never receive direct table grants. Every RPC independently checks the current active Owner role and the project's recent TOTP requirement.

Use private tables for the client directory, campaign records, and append-only change audit. Enable RLS and revoke direct browser-role access. Only narrowly scoped RPCs may return records or write changes. Each mutation requires a non-empty reason and recent TOTP; the same transaction writes a before/after audit event. A failed audit write aborts the associated mutation.

No ad-serving code reads these tables. CRM records cannot activate a public placement. There is no runtime flag that turns delivery on as a side effect of using the CRM.

## Data model

### Client

- Stable UUID primary key.
- Display name, trimmed and length-bounded.
- Creation/update timestamps and archival state.
- No contact details or free-form notes in V1.

### Campaign

- Stable UUID primary key and a restrictive foreign key to one client.
- Internal campaign name.
- Pricing model: `flat_fee`, `cpm`, or `cpc`.
- Quoted rate and optional budget ceiling, stored as non-negative decimal currency amounts.
- Currency fixed to MYR in V1; no exchange-rate conversion.
- One or more short placement labels stored as descriptive CRM values. They are not executable slot identifiers and are never consumed by public rendering.
- Start/end dates as Malaysia-local calendar dates; end cannot precede start.
- Creative description as bounded plain text only; no upload or external URL.
- Status: `draft`, `planned`, `paused`, `completed`, or `cancelled`. There is no `live` state because this CRM does not publish ads.
- Creation/update timestamps and archival state.

For `flat_fee`, the quoted rate represents the proposed fixed amount. For `cpm` and `cpc`, it represents the proposed rate per 1,000 impressions or per click. V1 stores these as quote terms only; no count, spend, invoice, or revenue is calculated.

### Audit

Store actor ID, campaign/client ID, action, reason, timestamp, and bounded before/after field snapshots. Audit rows remain private and append-only through the supported RPC boundary. Do not copy full creative material, user content, evidence, secrets, or arbitrary URLs into audit records.

Physical deletion and automatic expiry are excluded. Records can be archived and remain available to the Owner with their audit history. No retention duration is invented; a later privacy/legal decision must define one before cleanup is added.

## Owner workflow and UI

- Owner opens a Campaigns widget from the staff dashboard; Admin has no widget, route data, RPC grant, or commercial fields.
- The initial view lists clients and their campaigns with model, quoted rate/budget, placement labels, schedule, and status. If the database is unavailable or empty, show a clear unavailable or empty state without sample transactions presented as real records.
- Owner can add/archive a client and create/edit/archive a campaign. Each save asks for a reason and fresh six-digit Authenticator code, following existing Owner control patterns.
- Amount fields show MYR. CPM/CPC forms label the entered value as a proposed rate, not actual spend.
- Placement entry is descriptive text with strict length/control-character validation. It cannot trigger a live placement or link to an external asset.
- Use the existing three locales and dashboard layout conventions. Provide a responsive, keyboard-accessible form and list.

## Excluded work and gates

- PDF, Excel, and CSV exports remain a later Phase 5 task. Any future export must be Owner-only and omit identity, raw IP, private evidence, and non-public content.
- Public ad placements, Sponsored labels, serving schedules, impression/click events, billing, and Featured/Boost need separate explicit product approval, privacy definitions, implementation, and Staging acceptance. They remain OFF.
- Analytics consent, route Page Views, and the dormant Valid Read/Hot design do not provide billable campaign metrics. The current Valid Read integrity blocker must be resolved before it can support any commercial report.
- No hosted service, database, SMTP, R2, deployment, or real campaign record is used during local implementation.
- No automated tests, build, lint, browser checks, or SQL execution until the user completes the planned UI review. After UI acceptance, validate Owner/Admin/anonymous access, TOTP freshness, audit atomicity, concurrency, amount/date validation, and the continued absence of public ad delivery and tracking.

## Open design choices for later review

1. The descriptive placement labels should be replaced by an approved fixed taxonomy before anyone needs consistent cross-campaign placement reports.
2. Campaign/client retention duration and any export format/branding policy require a separate decision before cleanup or exports are implemented.

## Self-review

- Matches the accepted boundary: Owner-private CRM records, no advertiser Portal, and no ad delivery, tracking, or automatic billing.
- Keeps Admin operational analytics separate from client and commercial data.
- Does not repurpose consented Page Views or unverified Valid Reads as campaign metrics.
- Does not enable or claim a deployment capability, and preserves the user's requested UI-first verification order.
