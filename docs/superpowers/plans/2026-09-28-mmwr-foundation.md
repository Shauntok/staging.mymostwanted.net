# MMWR Foundation Implementation Plan

> **For agentic workers:** Execute this plan task by task. Keep the approved product specification in `HANDOFF.md` and the full program roadmap in `MASTER_PLAN.md` open while working.

**Goal:** Establish an independent MMWR application in `C:\Users\PC\Desktop\mmwr` and deliver the initial responsive public shell without copying the Our Little Age codebase.

**Architecture:** Use Next.js App Router with TypeScript and Tailwind, then organize product domains into focused `components`, `lib`, and Supabase migration areas. Build the shared language/theme/age/consent foundation first; implement public content and the real geographic map only after their route and licensed boundary-data sources are identified.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS; Supabase Auth/Postgres/Storage will be integrated in later phases. Node.js 20.9+ is required by current Next.js documentation.

**Spec:** `HANDOFF.md`; program roadmap: `MASTER_PLAN.md`; user workflows: `USER_MANUAL.md`.

## Global Constraints

- Project path: `C:\Users\PC\Desktop\mmwr`.
- Brand: `MMWR / Malaysia Most Wanted Ranking`; Chinese display name: `马来西亚人渣排行榜`.
- UI locales: `zh-CN`, `en`, `ms`; user selection persists and overrides device preferences.
- Light and Dark use one shared component/layout system.
- Homepage sections: interactive Malaysia map, 8 Latest, 8 Hot Ranked, 12 Smart Mix Tags; every ad placement defaults OFF.
- Never copy `.env*`, Supabase data, secrets, or production assets from `C:\Users\PC\Desktop\ourlittleage`.
- Protect RLS, Owner/Admin TOTP 2FA, private internal evidence, audit records, 18+ gate, and consent controls as required launch gates.
- No Production configuration or deployment until the user completes the guided provider setup.

---

## File Structure

- `app/layout.tsx`: document shell, metadata defaults, font setup, shared providers.
- `app/globals.css`: design tokens, reset, Light/Dark variables, responsive primitives.
- `app/page.tsx`: public homepage section composition.
- `components/shell/*`: navbar, mobile menu, footer, language and theme controls.
- `components/consent/*`: 18+ gate and optional-cookie controls.
- `components/home/*`: map region, Latest/Hot/Tags section shells.
- `lib/i18n/*`: locale types, dictionaries, locale persistence and selection.
- `lib/preferences/*`: theme and age/consent preference helpers.
- `lib/locations/*`: State/City types and later licensed boundary data adapter.
- `docs/superpowers/specs/*`: approved product/design references if refinements become necessary.
- `docs/superpowers/plans/*`: implementation plans and progress.
- `supabase/migrations/*`: later schema/RLS changes, isolated from the frontend foundation.

## Task 1: Initialize the isolated Next.js project

**Files:**
- Create: default Next.js App Router TypeScript/Tailwind application files.
- Create: `.gitignore`, `.env.example`, `README.md`.
- Preserve: `HANDOFF.md`, `MASTER_PLAN.md`, `USER_MANUAL.md`, this plan.

**Interfaces:**
- Produces the independent `mmwr` application with `@/*` import alias and standard `dev`, `build`, `start`, `lint` scripts.
- No Our Little Age application source, environment file, database, production content, or Supabase config is imported.

- [ ] Initialize the app using the current official `create-next-app` defaults for TypeScript, ESLint, Tailwind and App Router.
- [ ] Set package name and project metadata to `mmwr`.
- [ ] Add a safe `.env.example` listing only variable names needed by later phases, with no values or secrets.
- [ ] Replace starter README copy with MMWR project setup, environment separation, document pointers, and the no-secret rule.
- [ ] Add a concise `AGENTS.md` that points to `HANDOFF.md`, `MASTER_PLAN.md`, and `USER_MANUAL.md` and requires reading them before implementation.

**Completion criterion:** The project has a standard Next.js structure, its package identity is MMWR, and no third-party service credentials are present.

## Task 2: Establish design tokens and UI language foundation

**Files:**
- Create: `lib/i18n/locales.ts`, `lib/i18n/dictionaries/zh-CN.ts`, `lib/i18n/dictionaries/en.ts`, `lib/i18n/dictionaries/ms.ts`.
- Create: `lib/preferences/theme.ts`, `components/shell/ThemeProvider.tsx`, `components/shell/LanguageProvider.tsx`.
- Modify: `app/layout.tsx`, `app/globals.css`.

**Interfaces:**
- Locale union: `type Locale = 'zh-CN' | 'en' | 'ms'`.
- Theme union: `type Theme = 'light' | 'dark' | 'system'`.
- Brand copy remains identical across locales; UI strings are translated.

- [ ] Define complete starter-shell strings in all three dictionaries: navigation, gate, consent, loading/error and accessibility labels.
- [ ] Add theme CSS variables for both palettes using the approved restrained style direction.
- [ ] Resolve first-visit locale/theme from browser preferences and persist explicit user choices.
- [ ] Keep preference storage helpers behind small typed interfaces so persistence can move to account settings later.
- [ ] Apply theme and locale consistently to document metadata, controls and shell content.

**Completion criterion:** Every visible shell string has all three translations; language and theme controls persist and manual choices win over system changes.

## Task 3: Add 18+ gate and cookie consent shell

**Files:**
- Create: `components/consent/AgeGate.tsx`, `components/consent/CookieConsent.tsx`, `lib/preferences/consent.ts`.
- Modify: `app/layout.tsx`, `app/globals.css`.

**Interfaces:**
- Consent categories: `necessary`, `analytics`, `advertising`.
- Age approval expires after 30 days; under-18 selection never creates an approval value.
- Necessary cookies remain enabled; optional categories default to refused until user choice.

- [ ] Render age gate before interactive site content on a first visit or expired approval.
- [ ] Show the approved blur/dark overlay and explicit adult/minor actions.
- [ ] Render cookie choices after age approval with accept all, necessary only, and custom options.
- [ ] Provide a footer action to reopen cookie preferences.
- [ ] Ensure Analytics and Advertising integrations have no loading path until consent is granted in their categories.

**Completion criterion:** Age approval and consent state are independent; no optional tracking starts before opt-in.

## Task 4: Build the responsive public navigation and homepage shell

**Files:**
- Create: `components/shell/Navbar.tsx`, `components/shell/MobileMenu.tsx`, `components/shell/Footer.tsx`.
- Create: `components/home/HomeSection.tsx`, `components/home/MapPanel.tsx`, `components/home/LatestPreview.tsx`, `components/home/HotPreview.tsx`, `components/home/TagsPreview.tsx`.
- Modify: `app/page.tsx`, `app/globals.css`.

**Interfaces:**
- Homepage sections: map → Latest 8 → Hot Ranked 8 → Smart Mix Tags 12 → optional ad slots (OFF).
- Public post cards will later use one shared responsive card/media-collage component.
- `MapPanel` is a named integration boundary and must not present invented geographic counts or fake boundaries.

- [ ] Build desktop top navigation and a covering mobile/desktop drawer.
- [ ] Add localized section headings, empty/loading states and “View All” links for Latest and Hot.
- [ ] Add 12-item Tag section shell with count slot and “View All” link.
- [ ] Reserve ad positions in layout configuration but render no space when disabled.
- [ ] Keep map location data behind `lib/locations` so a verified boundary source can be integrated without rewriting the homepage.

**Completion criterion:** The shell follows the approved page order and counts at both narrow and wide widths; disabled ad positions leave no blank area; no fake content is presented as real.

## Later workstreams (follow `MASTER_PLAN.md`)

The approved product spans several independent systems. Implement them as separate deliverables after the foundation: (1) licensed location dataset and interactive map, (2) Supabase schema/Auth/RLS/Storage and account lifecycle, (3) submission/moderation/legal workflows, (4) search/Tags/reactions/sharing/SEO, (5) Analytics/Campaign/advertising, (6) security operations/backups/recovery, and (7) Staging/Production provider configuration. Keep optional advertising, translation, video, drafts, comments and VIP unavailable by default.

## Execution Choice

The user explicitly asked to begin work and selected inline continuation in this chat. Continue with the foundation tasks in this project without changing `ourlittleage`.

**Progress note (2026-09-28):** The initial public shell, preference provider, trilingual age and cookie dialogs, responsive drawer, homepage section counts, and default noindex metadata are in place. No database, authentication, real geographic data, analytics, advertising or provider credentials have been integrated. This foundation has not been run through build or browser verification.
