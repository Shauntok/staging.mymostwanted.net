# MMWR Clarification System V1 Design

Date: 2026-10-03  
Status: User-approved design; local implementation in progress on 2026-10-03. UI acceptance precedes all automated and database verification.

## Goal

Add a first-party Clarification system for official follow-up information on an already published MMWR story. Preserve the original story and its publication history. Make the relationship visible in both directions, provide a separate public Clarifications directory, include Clarifications in public search, and keep staff actions auditable.

This feature is a published-content workflow. It is not a user-submitted post type, a report/feedback workflow, a verdict label, or a reason to rewrite the original story.

## Approved product decisions

- The existing post model remains the primary content model. Add an independent `post_type` (`story` or `clarification`) and a formal relationship table.
- V1 uses a one-to-one relationship: one Mother Clarification Post references one Son Original Post, and a Son has at most one active Mother. Do not implement multi-story references.
- Only Admin and Owner can create, edit, and publish Mother posts. Ordinary users can only read published Clarifications and use the configured Telegram contact path to prepare a request draft.
- A Mother post has its own URL, publication time, public reading identity, Reactions, and page-level read events. It never changes the Son's content, timestamps, Reactions, ranking inputs, or public history.
- Mother and Son remain separate records. Removing a Mother from public view never hides or removes its Son. The relationship and content history are retained for audit.
- If a Son is emergency-hidden, the Owner chooses whether its Mother remains public or is also hidden. If the Mother remains public, its public projection suppresses the hidden Son's title, name, area, date, Case ID, and URL; the Son card becomes a neutral unavailable notice.
- The current post UUID is the stable Case ID in V1. There is no existing independent `case_id` field or numbering service.
- The public Telegram contact is controlled by `PUBLIC_TELEGRAM_SUPPORT_URL`. Without a valid configured URL, show a localized “not available yet” message. Configuration alone enables the link for this new Clarification request path; it does not reopen ban appeals or other legal/takedown requests.
- Attachments use the existing evidence metadata, scan, visibility, private-storage and access-audit model. Upload and public evidence reads remain unavailable while those safety gates are off or unverified.
- Existing public indexing gates remain authoritative. Metadata and sitemap support are implemented, but no Clarification URL is indexable until the existing Production origin/indexing gate permits it.

## Current architecture and constraints

- `private.posts` contains approved title, primary name, excerpt, full body, area, publication status and first/last publication timestamps. It has no `case_id` or content-type field today.
- `public.published_previews` is the sanitized public read model. Post detail and public lists read this projection; staff-only source material remains private.
- `private.evidence_metadata` is single-parent evidence metadata. Scanner, upload and preview features use separate gates and are not currently verified as live capabilities.
- Staff publication, post revisions, Owner hide/restore/remove and append-only audit patterns already exist. The Clarification workflow must use equivalent server-side role, recent TOTP, reason, locking and audit checks.
- Public search and suggestions use `search_published_previews`. Existing latest, area browsing and Hot Ranked queries currently operate on published projections. Hot eligibility must explicitly remain `story`-only.
- The production indexability helper requires Production, `ALLOW_SEARCH_INDEXING=true`, and a valid public HTTPS `NEXT_PUBLIC_SITE_URL`. Other detail routes remain noindex until this gate is open.
- There is no `PUBLIC_TELEGRAM_SUPPORT_URL` in `.env.example` or current feature code. The official support account therefore remains unconfigured in local preview.

## Data model

### Posts

Add a constrained `post_type` column to `private.posts`; backfill every existing row as `story`. The Clarification creator RPC creates `clarification` rows. Ordinary submission/publication RPCs must continue to create only `story` rows and must not let a client select `post_type`.

The sanitized `public.published_previews` projection carries `post_type`, but never private staff notes, submitter identity, evidence object paths, hidden Son metadata, or relationship history.

### Relationships

Add a private `post_relationships` table with a typed `clarifies` relationship, `clarification_post_id`, `referenced_post_id`, actor, and timestamp. Foreign keys use `ON DELETE RESTRICT`. Unique constraints enforce one relationship per Mother and one Mother per Son. A database trigger/RPC boundary enforces:

- Mother has type `clarification`; Son has type `story`.
- Mother and Son IDs differ.
- A relationship is created only when the selected Son is currently public and its area is active.
- Only the server-authorized staff workflow can create or change a relationship; Owner-only rebinding must include a reason and audit entry.
- Physical deletes are not part of the public lifecycle. Existing permanent removal state and retained audit history are used.

Do not store a user-entered URL as the relationship. Public links are generated from trusted IDs and validated site origin.

### Revisions and audit

Keep current public-content revision history for before/after Mother content. Add immutable Clarification events for creation, Son selection, relation change (before/after IDs), publication, edits, hide, restore, Admin removal proposal, and Owner decision. Audit records include actor, reason where required, timestamp and stable post IDs. Browser clients cannot directly write or read private audit tables.

Admin cannot permanently remove a published Mother. Admin can submit a reasoned removal proposal; Owner makes and records the final decision. Owner removal uses the existing `permanently_removed` public lifecycle state and does not delete the row or Son.

## Staff workflow and permissions

Add an Admin/Owner Clarification tool in the staff dashboard. Access requires the existing verified staff session and recent TOTP checks on mutations.

1. Search current published `story` posts only. Show Case ID (post UUID), title, primary name, State/City, first publication time, current status and generated public URL.
2. The staff member confirms the Son. A server RPC repeats eligibility checks and locks the candidate before persisting the relationship; the browser cannot send an arbitrary relationship URL.
3. Create a Mother draft with required title, excerpt, body, optional tags and eligible evidence references.
4. Admin/Owner may edit and publish with required reason and audit. Relationship rebinding is Owner-only. Admin removal is a proposal; Owner performs the final lifecycle action.
5. Any stale post status, duplicate relationship, revoked role, expired TOTP, inactive area, failed feature gate or audit failure aborts the transaction without partial post/projection changes.

The Clarification publication feature gate is seeded OFF. Public rendering only sees published rows already present in the sanitized projection.

## Public routes and presentation

- Replace the desktop Navbar Community Rules item with Clarifications. Keep `/rules` and Community Rules in the Footer/legal navigation and other existing legal references.
- Add localized `/clarifications` with newest published Mother first. Cards use the current MMWR design system and show the Clarification badge, Mother title, Son identity and title while the Son is public, area, publication date, excerpt, and separate links to Mother and Son.
- Add independent localized `/clarifications/{postId}` URLs. Render a Clarification label, Son card, then Mother excerpt/body/evidence. The Son card shows a thumbnail only when the Son is currently public and has a scan-clean public thumbnail. Never call a clarification a false post or guilty verdict by default.
- On a public Son detail page, show a calm cyan information banner after title/name/area/date/views and before evidence when a public Mother exists. It says that an official clarification/addendum is available and links to it.
- If Owner keeps a Mother public while its Son is hidden, do not expose Son details in the card, search, structured metadata, sitemap relationship data or Telegram draft; show only a neutral unavailable notice.
- Preserve existing Community Rules content and existing report/feedback separation.
- Translate all added page, badge, banner, action and unavailable-state text into Simplified Chinese, English and Bahasa Melayu. Support current Light B / Dark C tokens, responsive layout, keyboard focus and screen readers. Use a dedicated MMWR Clarification icon, not an emoji.

## User-request draft

`/clarifications` explains that the user cannot create a Mother post directly. The “Request clarification” interaction first uses public search to let the user select a currently public story; selecting a Son on that Son's own page preselects it. This selection and the explanation draft exist only in browser navigation state. MMWR does not save the user's explanation, evidence, identity or request.

When `PUBLIC_TELEGRAM_SUPPORT_URL` is absent or invalid, show the localized unavailable message and no Telegram link. Validate a strict public HTTPS Telegram username URL (`https://t.me/<username>`, with no credentials, port, query, or fragment); do not accept arbitrary redirects, invite links, or a general share-picker URL as the official recipient. When configured, generate a deep link to that username with an encoded locale-specific draft containing the selected Case ID (post UUID), title, canonical Son URL, and a blank explanation prompt. Opening the link only opens Telegram with an editable draft; MMWR never sends it.

Telegram documents `https://t.me/<username>?text=<draft_text>` as a public username link that pre-enters editable text, while `https://t.me/share/url` opens a recipient picker. The direct username format is therefore required for the configured support recipient: [Telegram deep links](https://core.telegram.org/api/links).

This new configured contact path supersedes the earlier closed policy only for Clarification requests. It does not change the closed status of ban appeals, account sanctions appeals, or unrelated legal/privacy/takedown requests. The official username itself still requires the user to configure it.

## Search, listing, tags, areas and ranking

- Add `post_type` to the public search result contract and include published Mother rows in search/autocomplete. Mark each result as Clarification in all three locales; do not merge Mother and Son results into a single person/case result.
- The dedicated Clarifications directory includes all currently public Mother posts, newest first. Public tag browsing may include Clarifications and must label them.
- Keep ordinary Latest/home stories, Hot Ranked, homepage mix counts and geographic/map counts restricted to `story`. This prevents an official follow-up from silently changing existing ranking and area totals. A Mother remains discoverable through its directory, tags, search, and the Son banner.
- Reaction and valid-read records are keyed to the Mother post ID and therefore do not increment the Son. Do not attribute views or shares from a Mother URL to its Son.
- Share controls generate the Mother URL. Share attribution/count tracking stays off in accordance with the existing Phase 5 consent/metric boundary; this design does not claim a share counter exists.

## SEO and indexability

Each Mother has an independent canonical URL, title/description, Open Graph and Twitter metadata, and article structured data. When its Son is public, structured metadata may expose the explicit `clarifies` relationship through a public URL reference; never infer truth or falsity. Keep the Son's canonical metadata unchanged.

Add published Mother URLs and all supported locale variants to the gated sitemap only when the existing Production indexing helper returns a valid origin. Hidden, draft and permanently removed Mothers are absent from the public projection, metadata and sitemap. Son hide never automatically deletes or edits Mother SEO content; the Owner's visibility decision controls Mother's own publication state.

## Storage and evidence gates

Mother evidence records must reference the Mother post, use the existing private storage object path model, and pass the existing file validation/scanner workflow. Public display may include only scan-clean evidence explicitly marked `public_thumbnail`; internal-only evidence stays behind staff access, same-session authorization, recent TOTP and append-only access audit. No new upload bypass is introduced. Since upload/scanner/preview flags and database migrations have not been verified in an environment, all upload and file-read controls stay off pending the existing Phase 2/3 gates.

## Rollout and verification boundaries

Implementation is local only. Add forward-only migrations, staff actions, public routes/components, i18n, search/list/detail/SEO integration and update `MASTER_PLAN.md`, `HANDOFF.md`, `USER_MANUAL.md` and `CHANGELOG.md` (which is currently absent and must be created). Do not apply migrations to local/staging/production databases, configure Telegram, open uploads, turn on indexing, or enable publication during implementation.

After the user reviews the UI, run the requested migration/RLS/role, search/autocomplete, Mother/Son navigation, hidden-Son privacy, SEO/sitemap, responsive/light/dark/zh/en/ms, and existing-system regression verification. Until then, code and SQL can be reviewed statically only; no test suite, build, database, external provider, Staging or Production result is claimed.

## Design self-review

- Preserves all 20 supplied requirements without storing a user-submitted clarification request.
- Keeps original Son fields, publication time, Reaction rows and valid-read rows independent of Mother operations.
- Enforces server-side type and relationship integrity instead of trusting a tag or URL.
- Uses the Owner decision required by the brief for Son emergency hiding; public suppression avoids re-exposing hidden Son fields through a surviving Mother.
- Keeps evidence, Telegram recipient, SEO indexing and database rollout behind their already documented configuration/safety gates.
- No Production, Supabase, Staging, Telegram account, public indexability or upload state has been changed.


## Requirement coverage

| Supplied requirement | Design coverage |
| --- | --- |
| 1, 19. Replace the navbar entry and retain Community Rules in Legal/Footer. | Public routes and presentation |
| 2. Define Mother/Son and V1 one-to-one relationship. | Approved product decisions; Data model |
| 3. Preserve original Son fields, publication time, and history. | Approved product decisions; Search, listing, tags, areas and ranking |
| 4, 16. Public request text and a manual Telegram draft. | User-request draft |
| 5. Staff searches, inspects, and binds an eligible published Son. | Staff workflow and permissions |
| 6, 14. Content type, separate relationship, Mother content, tags, and evidence. | Data model; Storage and evidence gates |
| 7. Neutral Son banner to a published Mother. | Public routes and presentation |
| 8. Mother label and Son card with reverse navigation. | Public routes and presentation |
| 9. Localized latest-first `/clarifications` listing and current design system. | Public routes and presentation |
| 10. Search and autocomplete include a Clarification badge. | Search, listing, tags, areas and ranking |
| 11. Independent Mother metadata/canonical/structured data/sitemap without changing Son SEO. | SEO and indexability |
| 12, 13. Role boundaries, Owner decisions, and immutable before/after audit. | Staff workflow and permissions; Revisions and audit |
| 15. Mother engagement remains keyed to Mother; no Son algorithm mutation. | Approved product decisions; Search, listing, tags, areas and ranking |
| 17. Keep reports/feedback separate. | Public routes and presentation |
| 18. Calm cyan treatment and non-emoji icon. | Public routes and presentation |
| 20. Update HANDOFF, USER_MANUAL, CHANGELOG and verify all requested surfaces after UI review. | Rollout and verification boundaries |
## Open configuration item

The official Telegram support URL has not been supplied and no matching variable currently exists. The UI must therefore render its unavailable state until the user configures a valid URL for the intended environment.



