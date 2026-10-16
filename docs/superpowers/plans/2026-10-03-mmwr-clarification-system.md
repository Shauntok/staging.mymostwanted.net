# MMWR Clarification System V1 Implementation Plan

> **For agentic workers:** Execute this plan inline, task by task. Do not delegate. Automated tests, builds, database validation and browser acceptance are deferred until the user has inspected and accepted the completed UI.

**Goal:** Add auditable, localized Mother Clarification Posts linked one-to-one with unchanged published Son stories, with public browsing, search, Telegram draft support and gated evidence/SEO.

**Architecture:** Extend the existing private posts model with `post_type`, add a constrained formal relationship and immutable clarification audit/proposal tables, and expose only curated published projections. Reuse the staff MFA/session, post revision/lifecycle, search, evidence, analytics, localization and SEO gates while keeping ordinary story feeds and Hot ranking isolated from Clarifications.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase Postgres/RPC/RLS, existing Supabase SSR/browser clients, CSS Modules, existing `zh-CN`/`en`/`ms` catalog.

**Spec:** `docs/superpowers/specs/2026-10-03-mmwr-clarification-system-design.md`

## Global Constraints

- Preserve original Son title/body/area, `published_at`, public post ID, Reactions, view events and ranking inputs.
- V1 has one Mother per Son and one Son per Mother; no multi-reference UX or RPC.
- Only authenticated Admin/Owner with the existing valid staff session and recent TOTP may mutate clarification content; mutations require reasons and append-only audit.
- Normal users cannot publish or save a request. The browser only prepares an editable Telegram draft; MMWR never sends or stores it.
- The public Telegram link appears only for a strict configured HTTPS public username URL. Missing/invalid configuration fails closed.
- `clarification_publication`, uploads and public evidence reads remain OFF. Indexing uses the existing Production-only indexability gate.
- Clarifications appear in Clarifications directory, search/autocomplete and tagged results; ordinary Latest, Hot Ranked, home mix and geographic counts remain story-only.
- Community Rules remains at `/rules` and in Footer/Legal; only its desktop Navbar position changes.
- Maintain Simplified Chinese, English, Bahasa Melayu, Light B, Dark C, keyboard and screen-reader behavior.
- No external Supabase, Staging, Production, Telegram, Vercel or DNS configuration changes.
- Do not add or run automated tests, builds, migration execution, or browser acceptance before the user's UI review.

---

## File structure

- `supabase/migrations/20261003130000_mmwr_clarification_system.sql`: forward-only type, relationship, audit, removal proposal, feature gate, public projection, integrity guards and narrowly granted staff/public RPCs.
- `supabase/migrations/20261003131500_mmwr_clarification_dashboard_widget.sql`: versioned Admin/Owner dashboard default and server allowlist update.
- `lib/clarifications.ts`: server-only published list/detail/relationship reads and status typing.
- `lib/clarification-metadata.ts`: safe locale-aware detail metadata inputs.
- `lib/clarification-telegram.ts`: server-only config validation and editable direct-recipient Telegram draft URL.
- `components/clarifications/`: directory, detail, Son banner, Son picker/request draft, and Admin/Owner manager components with CSS Modules.
- `app/clarifications/page.tsx`, `app/clarifications/[postId]/page.tsx`: localized directory/detail route modules following existing proxy locale conventions.
- `lib/public-posts.ts`, `lib/public-search.ts`, `components/search/SearchBox.tsx`, `components/search/SearchExperience.tsx`, `app/api/search/suggestions/route.ts`: type-aware read contracts and label/link presentation.
- `components/public-posts/PostDetailPage.tsx`, `components/public-posts/SharePostControls.tsx`: Son banner and correct Mother URL sharing without changing Son interactions.
- `components/shell/SiteChrome.tsx`, `components/auth/StaffDashboard.tsx`, `lib/admin/dashboard-widget-ids.ts`, `app/admin/page.tsx`: navigation and role-filtered Clarification staff tool.
- `app/sitemap.ts`, `lib/public-post-metadata.ts`, `app/posts/[postId]/page.tsx`: gated localized sitemap/SEO and ordinary-story route protections.
- `lib/i18n/catalog.ts`, new Clarification copy in components: three-locale text.
- `.env.example`: document `PUBLIC_TELEGRAM_SUPPORT_URL` as a public username URL, blank by default.
- `MASTER_PLAN.md`, `HANDOFF.md`, `USER_MANUAL.md`, `CHANGELOG.md`: record local scope, gates, user-facing steps and limitations. `CHANGELOG.md` does not currently exist and will be created.
- After UI acceptance only: `supabase/tests/clarifications.test.sql` and any narrowly scoped UI checks will be added and run.

## Task 1: Add the constrained data model and audit boundary

**Files:**
- Create: `supabase/migrations/20261003130000_mmwr_clarification_system.sql`
- Keep all migration changes forward-only; put any post-review correction in a new later timestamped migration, never edit an applied migration.

**Interfaces:**
- Existing posts default to type `story`; browser-supplied post type is never trusted.
- Private relationship columns: `clarification_post_id`, `referenced_post_id`, `relationship_type='clarifies'`, `created_by`, `created_at`.
- New public projection column: `content_type` constrained to `story|clarification`.
- New private feature flag: `clarification_publication=false`.
- Public users receive only published projection read access and approved `clarifies` metadata where both posts are currently public.
- Staff write access is through narrow RPCs only; no client grants on private tables.

- [ ] Add `post_type text not null default 'story'` and constraint to `private.posts`; backfill existing rows as `story` and add `content_type` to `public.published_previews`.
- [ ] Add private `post_relationships` with restrictive foreign keys, one-to-one unique constraints, valid type checks and append-only `clarification_audit_events` / `clarification_removal_proposals` tables. Reject direct client access and audit UPDATE/DELETE/TRUNCATE.
- [ ] Add a false-by-default `clarification_publication` runtime flag. Keep ordinary `publish_post` and submission publication pinned to `story`.
- [ ] Extend `private.sync_public_post_projection` to expose `content_type` and keep hidden/draft/removed Mothers out of the public projection. Do not expose relation fields through the base preview row.
- [ ] Add private/public RPC pairs with exact signatures:

```sql
public.staff_find_clarification_sons(p_query text, p_limit integer default 20)
returns table(post_id uuid, approved_title text, primary_name text, area_id uuid,
  public_area_name text, first_published_at timestamptz, status text);

public.staff_create_clarification(p_referenced_post_id uuid, p_title text,
  p_public_excerpt text, p_full_body text, p_tag_ids uuid[], p_reason text)
returns uuid;

public.staff_publish_clarification(p_clarification_post_id uuid,
  p_expected_updated_at timestamptz, p_reason text)
returns boolean;

public.public_clarification_for_story(p_son_post_id uuid)
returns table(clarification_post_id uuid);

public.public_referenced_story_for_clarification(p_clarification_post_id uuid)
returns table(post_id uuid, approved_title text, primary_name text,
  public_area_name text, first_published_at timestamptz, thumbnail_available boolean);

public.owner_hide_story_with_clarification_decision(p_son_post_id uuid,
  p_keep_mother_public boolean, p_reason text)
returns boolean;

public.owner_rebind_clarification_son(p_clarification_post_id uuid,
  p_new_son_post_id uuid, p_reason text)
returns boolean;

public.staff_propose_clarification_removal(p_clarification_post_id uuid,
  p_reason text)
returns bigint;

public.owner_resolve_clarification_removal(p_proposal_id bigint,
  p_decision text, p_reason text)
returns boolean;
```

- [ ] Implement role/TOTP/session checks, feature flag locking, deterministic post locks, published-story eligibility and unique relation checks inside each SECURITY DEFINER RPC; write creation/selection/publication audit in the same transaction. The browser cannot set `post_type`, actor, timestamps, URL or audit data.
- [ ] Add a privacy-safe public relation RPC returning Mother IDs only for public Son/Mother pairs, and Son preview fields only when the Son is currently public.
- [ ] Add `public.owner_hide_story_with_clarification_decision(p_son_post_id uuid, p_keep_mother_public boolean, p_reason text)`; lock Son and Mother, require a non-null decision/reason/fresh TOTP after locks, hide Son, and hide Mother only when `p_keep_mother_public=false`. If kept, suppress Son fields in public relation reads.
- [ ] Replace/guard the existing `private.owner_post_action` and public wrapper so `action=hide` refuses a Son with a linked Mother unless it is routed through the decision RPC. Keep generic hide/restore/remove behavior for unlinked stories and standalone Mothers.
- [ ] Add `public.staff_propose_clarification_removal(p_clarification_post_id uuid, p_reason text)` and `public.owner_resolve_clarification_removal(p_proposal_id bigint, p_decision text, p_reason text)` with immutable proposal/final decision audit, actor and wall-clock timestamps. Removal changes Mother lifecycle state only; relation remains restricted/audited.
- [ ] Add `public.owner_rebind_clarification_son(p_clarification_post_id uuid, p_new_son_post_id uuid, p_reason text)` with target-story revalidation, reason, before/after relation audit and transaction rollback on any failed guard.

**Before UI acceptance:** statically inspect migration ordering, search paths, grants, RLS, lock order, projection behavior and existing publication/lifecycle function callers. Do not run SQL or tests yet.

## Task 2: Build the staff Clarification workflow

**Files:**
- Create: `supabase/migrations/20261003131500_mmwr_clarification_dashboard_widget.sql`
- Create: `components/clarifications/StaffClarificationManager.tsx`
- Create: `components/clarifications/StaffClarificationManager.module.css`
- Modify: `components/auth/OwnerPostLifecycle.tsx`
- Modify: `components/auth/OwnerPostLifecycle.module.css`
- Modify: `app/admin/page.tsx`
- Modify: `components/auth/StaffDashboard.tsx`
- Modify: `lib/admin/dashboard-widget-ids.ts`
- Modify: `lib/i18n/catalog.ts`

**Interfaces:**

```ts
type ClarificationSon = {
  post_id: string;
  approved_title: string;
  primary_name: string;
  area_id: string;
  public_area_name: string;
  first_published_at: string;
  status: "published";
};

type ClarificationDraftInput = {
  sonPostId: string;
  title: string;
  publicExcerpt: string;
  fullBody: string;
  tagIds: string[];
  reason: string;
};
```

- [ ] Add `clarifications` to the Admin and Owner frontend widget ID arrays, the React `WidgetId` union, localized widget labels and `app/admin/page.tsx` content registry.
- [ ] In `20261003131500_mmwr_clarification_dashboard_widget.sql`, insert the next versioned Admin default with 10 IDs (current 9 plus `clarifications`), replace the SQL Owner default with 17 IDs (current 16 plus `clarifications`), update both roles' save allowlists, and raise the preference cardinality constraint from 16 to 17. Preserve existing preferences and default-version history.
- [ ] Implement son lookup through `staff_find_clarification_sons`, requiring 2+ safe query characters, bounded results and text escaping. Display UUID Case ID, title, name, state/city, first publication time, current public status and generated URL.
- [ ] After selection, render a confirmation card and editor. Require title, public excerpt, body, reason and the existing TOTP challenge for create/publish/revision actions. Do not add a free-form URL input.
- [ ] Display eligibility/race errors generically without revealing hidden/private post fields; reload current state on stale response.
- [ ] Provide Owner relationship rebind, visibility choice on linked Son emergency hide, Owner restore/remove and Admin removal proposal controls behind role checks and required reasons/TOTP.
- [ ] Render audit/revision history read-only to staff with before/after values and actor/time; never allow editing audit records.

**Before UI acceptance:** static review only; do not run lint/build or make Staff RPC calls.

## Task 3: Add Clarifications directory and detail pages

**Files:**
- Create: `lib/clarifications.ts`
- Create: `components/clarifications/ClarificationsPage.tsx`
- Create: `components/clarifications/ClarificationsPage.module.css`
- Create: `components/clarifications/ClarificationDetailPage.tsx`
- Create: `components/clarifications/ClarificationDetailPage.module.css`
- Create: `components/clarifications/SonClarificationBanner.tsx`
- Create: `components/clarifications/SonClarificationBanner.module.css`
- Modify: `lib/published-post-detail.ts`
- Create: `app/clarifications/page.tsx`
- Create: `app/clarifications/[postId]/page.tsx`
- Modify: `components/public-posts/PostDetailPage.tsx`

**Interfaces:**

```ts
type PublicClarification = {
  post_id: string;
  approved_title: string;
  primary_name: string;
  public_excerpt: string;
  last_listed_at: string;
  public_tag_labels: string[];
  public_area_name: string;
  full_body: string | null;
  referenced_post: PublicPost | null;
};

type ClarificationListResult = {
  posts: PublicClarification[];
  status: "ready" | "empty" | "unavailable";
  hasNextPage: boolean;
};
```

- [ ] Implement server-only pagination of only current published Mother projections, newest first; return `unavailable` on database failure and never fall back to private source rows.
- [ ] Render current MMWR card design, cyan Clarification label, Mother title/excerpt/area/date, and two localized navigation links. Show Son thumbnail only for public scan-clean `public_thumbnail` evidence.
- [ ] Create independent `/clarifications/{postId}` routes with UUID validation, metadata generation and permanent-removal handling consistent with the existing post detail route.
- [ ] Render Mother label and Son card before Mother body/evidence. If Son is hidden, show only neutral unavailable copy and no Son metadata or link.
- [ ] Add the Son banner at the specified position. It appears only when the server relation RPC returns a public Mother; it never asserts that the Son is false/incorrect.
- [ ] Ensure Mother own post ID flows to Reaction, valid-read, share and full-body reading gates. Pass Mother href into SharePostControls; never pass Son ID for a Mother interaction.

**Before UI acceptance:** inspect server/client boundaries and rendered localized route code statically; do not run page tests or the development server again.

## Task 4: Extend search and preserve story-only surfaces

**Files:**
- Modify: `supabase/migrations/20261003130000_mmwr_clarification_system.sql` for type-aware search, Hot/Latest/home-tag/geography RPC filters.
- Modify: `lib/public-search.ts`
- Modify: `lib/public-posts.ts`
- Modify: `components/search/SearchExperience.tsx`
- Modify: `components/search/SearchBox.tsx`
- Modify: `app/api/search/suggestions/route.ts`
- Modify: tag/area data readers and the SQL functions they call in the Clarification migration.

**Interfaces:**

```ts
type PublicSearchPost = PublicPost & {
  content_type: "story" | "clarification";
};

type PublicSearchSuggestion = Pick<PublicSearchPost,
  "post_id" | "primary_name" | "approved_title" | "public_area_name" | "content_type">;
```

- [ ] Add published Mothers to text search and autocomplete while keeping existing query limits, rate limits and public-field-only contract. Return `content_type` and render the three-locale badge.
- [ ] Route search/suggestion targets to `/clarifications/{id}` for Mothers and `/posts/{id}` for stories.
- [ ] Keep `getLatestPublicPosts`, home Latest, `public_hot_ranked_posts`, home mix counts and geography/map counts restricted to `story` in both SQL and callers.
- [ ] Keep public tag browse inclusive as approved, with a Clarification badge and correct Mother route.
- [ ] Keep Son's Hot score and metrics untouched; Mother's valid reads and Reactions remain tied to its own ID.
- [ ] Confirm ordinary published stories remain the only input to existing Hot and area output; use explicit `post_type='story'`, not a tag exclusion.

**Before UI acceptance:** inspect SQL and TypeScript result-shape parity; do not call RPCs or run tests.

## Task 5: Add configured Telegram drafts and evidence gating

**Files:**
- Create: `lib/clarification-telegram.ts`
- Create: `components/clarifications/ClarificationRequestDraft.tsx`
- Create: `components/clarifications/ClarificationRequestDraft.module.css`
- Modify: `app/clarifications/page.tsx`
- Modify: `app/posts/[postId]/page.tsx` only if contextual request links are rendered server-side.
- Modify: `.env.example`

**Interfaces:**

```ts
export type TelegramSupportConfig =
  | { available: false }
  | { available: true; baseUrl: string };

export function getTelegramSupportConfig(
  raw: string | undefined
): TelegramSupportConfig;

export function buildClarificationTelegramUrl(input: {
  baseUrl: string;
  locale: "zh-CN" | "en" | "ms";
  sonTitle: string;
  caseId: string;
  canonicalSonUrl: string;
}): string;
```

- [ ] Accept only `https://t.me/<username>` with no credentials, custom port, query, fragment, invite path or other hostname; treat missing/invalid config as unavailable. Keep the variable blank in `.env.example`.
- [ ] Use the existing public search suggestion flow for selecting a Son in the directory; the Son detail action preselects the current public story.
- [ ] Generate localized text with Case ID, title, canonical URL and blank explanation prompt. Encode with `URLSearchParams` into the configured username link's `text` parameter. Show a separate copy fallback when public origin or support config is missing; never call Telegram APIs.
- [ ] Do not submit, persist, log or analyze the selection or request text. The user sends manually from Telegram.
- [ ] Reuse `private.evidence_metadata`, scanner state and existing public/internal visibility rules. Attachments are displayable only if their migration/gates provide a clean allowed record; do not open uploads, preview grants or public reads.

**Before UI acceptance:** static validation of URL generation and gate branches only; do not send Telegram links or configure external support.

## Task 6: Finish localization, navigation, SEO and documentation

**Files:**
- Modify: `components/shell/SiteChrome.tsx`
- Modify: `lib/i18n/catalog.ts`
- Modify: `lib/public-post-metadata.ts`
- Create: `lib/clarification-metadata.ts` if generic metadata types become over-coupled.
- Modify: `app/sitemap.ts`
- Modify: `app/robots.ts` only if gated Clarification paths need an explicit noindex rule.
- Modify: `MASTER_PLAN.md`, `HANDOFF.md`, `USER_MANUAL.md`
- Create: `CHANGELOG.md`

- [ ] Replace desktop Navbar `/rules` label/target with localized Clarifications; leave legal/footer `/rules` links and contents unchanged.
- [ ] Add complete Simplified Chinese, English and Bahasa Melayu page, request, empty, unavailable, badge, banner, button and form guidance.
- [ ] Keep CSS within existing Light B / Dark C variables and responsive/accessibility conventions; use a custom icon component/SVG, not emoji.
- [ ] Add locale-aware Mother canonical/Open Graph/Twitter metadata and JSON-LD article relation only when the Son is also public. Escape `<` before embedding JSON-LD.
- [ ] Add only public Mothers to locale-specific sitemap alternates when `getIndexableProductionOrigin()` succeeds; keep hidden/draft/removed/private routes excluded and detail pages noindex when the gate is closed.
- [ ] Document which features remain closed, the Telegram config name/format, the existing upload/index gates, and the fact that user request text is never stored. Do not say Phase 3, testing, migrations or production are complete.
- [ ] Create a dated changelog entry without adding secrets, support usernames, sample people or fabricated post data.

## Task 7: Assemble local UI for product review

- [ ] Run the already-authorized local development server only if it is not already serving port 3000; verify the Clarification directory, a synthetic no-data/empty state, role-filtered Admin/Owner tool layout, search badge, Son banner, request unavailable state and locales/themes through manual source/UI review.
- [ ] Keep `clarification_publication=false`, no Telegram support username, evidence upload/reads off and Production indexing gate unchanged.
- [ ] Open the Clarifications page and `/admin` tool for the user and stop for UI acceptance. Do not create synthetic people or public Mother/Son posts in any environment.
- [ ] Record corrections from UI feedback, implement them locally, and show the updated UI before starting any verification suite.

## Task 8: Verification after UI acceptance

Do not start this task until the user has reviewed the complete UI and explicitly moved to verification.

- [ ] Add `supabase/tests/clarifications.test.sql` covering type backfill/default, one-to-one constraints, published-story eligibility, disabled gate, unauthenticated/ordinary/Admin/Owner RPC matrix, recent/stale TOTP, reason checks, audit immutability, removal proposal/final decision, Mother-only lifecycle and concurrent duplicate/rebind/hide operations.
- [ ] Run `npx supabase test db` only against a local database. If Docker/Postgres is unavailable, record the exact limitation; do not substitute a remote database.
- [ ] Run `npm run lint -- <changed paths>`, then `npm run lint`, `npx tsc --noEmit`, and `npm run build` after UI acceptance.
- [ ] Exercise anonymous/account/staff/Owner visibility, relation preservation, banner location, Son-hidden/Mother-kept suppression, two-way navigation, Telegram disabled/configured/malformed branches without sending, three locales, Light/Dark, keyboard and mobile widths.
- [ ] Verify canonical/meta/JSON-LD/sitemap include only published public Mothers and obey production indexing gate; confirm Son metadata stays byte-for-byte logically unchanged.
- [ ] Update HANDOFF, Master Plan, and Phase 3 staging/rollback/UI acceptance records with exact local results and the still-unrun Staging/Production checks.
- [ ] Do not apply migrations to external Supabase/Staging/Production or configure Vercel/Telegram. Present the complete local result and remaining deployment requirements.

## Plan self-review

- Covers all 20 source requirements through Tasks 1–8.
- Tasks 1 and 4 preserve the original story-only algorithm/list boundary; Task 3 does not reuse Son IDs for Mother interaction.
- Task 5 has no server-side request intake, Telegram send API, persistence or logging path.
- Task 1 includes atomic Owner choice for Son hide and append-only lifecycle/relation audit.
- Task 2 updates both frontend and database Widget ID registries, versioned defaults, and preference limits (Admin 10, Owner 17).
- Task 6 retains Community Rules and records the missing changelog file explicitly.
- Automated tests/build/database/browser validation are explicitly deferred until the user accepts the UI, matching the user's instruction.
- No task authorizes an external database, Vercel, Telegram account, DNS, upload, or indexability change.





