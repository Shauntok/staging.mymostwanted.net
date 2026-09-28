# MMWR Phase 1: Honest Route Shells

> Follow-up to Phase 1 of MASTER_PLAN.md. These route shells bridge navigation to later feature phases; they must not suggest that data or workflows are live.

## Goal

Provide a localized, accessible, noindex status page at each planned but not-yet-implemented public route so the shared navigation never drops visitors into an unexplained 404 and no empty feature is mistaken for a working service.

## Task 1: Implement public route status shells

Add explicit status routes for /latest, /hot, /tags, /areas, /search, /submit, /account, /submissions, and /vip. Reuse a shared, typed, trilingual page component. Each page must:

- Clearly state in Simplified Chinese, English and Bahasa Melayu that the named feature is still being prepared and isn't connected.
- For posts/search/tags/areas, make clear that no real public data is available yet.
- For submit/account/submissions, make clear that sign-in, registration and submission are unavailable and not to send real information through this shell.
- For VIP, avoid implying a launch date, price or benefit.
- Include a safe link to the homepage.
- Export unique title/description metadata with noindex/nofollow.

## Constraints

- Only edit this MMWR workspace.
- Do not change shared navigation, legal pages, consent, provider integrations, feature flags, or homepage counts.
- Do not invent people, posts, statistics, release dates, prices or service contacts.
- No real account/post workflows, network service configuration, tests or build.

## Completion

- All nine advertised paths resolve to a clear localized status page.
- Nothing on these pages is indexable or presented as implemented.
