# Phase 6: localized URL implementation plan

## Goal

Give each supported UI language a stable URL so search engines can request the language directly, receive matching server-rendered UI, and receive accurate canonical and `hreflang` metadata. Preserve the language preference cookie as the visitor's default choice, not as the source of truth for a localized URL.

This is a URL and navigation change only. It does not translate user-submitted post bodies, expand what is indexable, or enable indexing in Development/Staging.

## URL contract

| UI locale | URL segment | Existing application locale |
| --- | --- | --- |
| English | `/en` | `en` |
| Simplified Chinese | `/zh-cn` | `zh-CN` |
| Bahasa Melayu | `/ms` | `ms` |

- `/` redirects to the saved valid language preference; without one it uses a supported primary `Accept-Language` value, then falls back to `/en`.
- Locale-prefixed paths are the stable URLs. Internal links and the language selector preserve the current page and query parameters while changing the locale segment.
- Existing unprefixed page URLs remain compatible by redirecting to the same path under the selected/default locale; preserve query parameters used by search, filters, pagination, and safe auth return paths.
- API endpoints, Next.js internals, static files, and verification callbacks are not localized or redirected.
- The path locale is authoritative for the rendered UI, `<html lang>`, page metadata, and Open Graph locale. Proxy validates the first path segment, deletes any client-supplied `x-mmwr-locale`, then forwards its own normalized locale header to the root layout. A valid preference cookie may be refreshed from a locale URL.

## Route migration sequence

1. Add a shared locale parser and URL helper. Normalize URL slugs to lowercase while mapping `zh-cn` to the existing `zh-CN` catalog key.
2. Keep current page modules in place and let Proxy rewrite `/en/<route>`, `/zh-cn/<route>`, and `/ms/<route>` internally to their existing unprefixed app routes. Keep `app/api/` handlers outside this rewrite. The root entry redirects without creating a second indexable homepage.
3. Let Proxy validate the path locale and provide it to the root layout, preference provider, and shared site chrome. Do not let a stale locale cookie override the path.
4. Replace internal Next links and client-side navigations with the locale-aware URL helper. Cover navigation, cards, map/area links, pagination, auth flows, error/empty states, and generated sharing URLs. Native form submissions and legacy links may reach the compatibility redirect, but should preserve query/hash state. Do not prefix external, API, callback, or static asset URLs.
5. Keep all non-home pages `noindex` until the content, legal, and moderation launch gates explicitly allow them. Preserve their existing authorization and query semantics.
6. Add homepage canonical and `hreflang` alternates only for the three localized homepage URLs, with English as `x-default`. Do not claim localized post content: post bodies remain the author's original language.
7. Keep the indexing gate on the Production-only HTTPS-origin validator. While closed, localized pages remain `noindex`, robots disallows crawling, and sitemap is empty. When eventually enabled, list only the three localized homepage URLs until other routes are approved.

## Compatibility and security constraints

- Keep Server Action and email-verification callback behavior working during redirects. Never place tokens or secrets in query strings added by locale routing.
- Keep return-path validation allowlisted; locale prefixes must not turn an untrusted external redirect into an accepted path.
- Cookie/18+ consent state is shared across locale paths (`Path=/`). Locale switching does not reset age confirmation, analytics consent, authentication, theme, or scroll-independent app state.
- Do not add locale detection based on IP address. The first visit may use the browser's primary supported language; the user's explicit saved language preference takes precedence.
- Do not configure Vercel, Search Console, analytics, Supabase, email, DNS, or Production as part of this routing implementation.

## Completion evidence

- Every page route has a valid locale segment; invalid locale segments return not-found without rendering the English page under a misleading locale URL.
- Direct requests to `/en`, `/zh-cn`, and `/ms` render the matching UI on the first server response, including the site chrome and `<html lang>`.
- Language switching preserves the current local route and safe query state; legacy routes redirect once and do not form loops.
- Canonical and `hreflang` point only to equivalent localized URLs. The root URL is a redirect, not a duplicate canonical page.
- Existing auth/session, report, map, search, pagination, and share paths retain behavior. Protected routes remain noindex and authorization remains server-side.
- Indexing remains disabled by default. Production crawling, generated HTML, and Search Console checks are separate launch-gate work and are not inferred from local code.

## Status

Implemented locally on 2026-09-30: `/` redirects using the saved preference, then the supported primary `Accept-Language`, then English. All supported locale-prefixed page URLs use Proxy rewrites to the existing app route modules; existing unprefixed page URLs redirect to the selected locale while preserving query/hash. The path locale is validated, takes precedence over a cookie, is forwarded in a trusted internal header, and refreshes the preference cookie. Locale-aware Next links, language switching, suggestion navigation, email verification path detection, and post canonical/Open Graph URLs retain the locale. Latest, Hot, area, Tag, and Search pages use locale-matched title/description, Open Graph, and Twitter metadata; absolute canonical/OG URLs are emitted only when the validated Production indexing gate provides a trusted HTTPS origin. All non-home pages remain noindex. Pagination and validated area filter parameters are represented in canonical URLs when the gate is open. API endpoints, auth callbacks, Next internals, and static files remain outside the locale routing. Locale-prefixed sensitive paths are included in the gated robots disallow list. The gated sitemap and homepage alternates still list only the three homepage URLs. See `MASTER_PLAN.md` for current status.

**Local SSR/indexing-gate check (2026-10-05):** Direct local HTTP requests to `/en`, `/zh-cn`, and `/ms` return 200 with matching `<html lang>`, `noindex,nofollow`, and no canonical or `hreflang` while the Production gate is closed. This check found and fixed a regression where homepage relative canonical paths resolved through the root layout's local `metadataBase` to `http://localhost:3000`; the home metadata now omits canonical/hreflang until `getIndexableProductionOrigin()` returns a trusted HTTPS origin. New unit coverage checks all three disabled locales and the enabled-origin URL set. Also verified `/zh-cn/areas`, `/ms/tags`, `/en/account`, and `/zh-cn/admin` return matching language metadata and stay noindex; a localized invalid report ID returns 404 with the requested locale. `robots.txt` disallows crawling and the sitemap shard is empty with indexing disabled. The legacy `/areas?page=2` redirect preserves the query. No indexing gate was opened; no Staging, crawler, Search Console, or Production check was performed.
