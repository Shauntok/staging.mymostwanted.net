<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# MMWR project rules

Before changing application code, read `HANDOFF.md`, `MASTER_PLAN.md`, and `USER_MANUAL.md`.

- This is a separate product from Our Little Age. Reuse only reviewed ideas or isolated patterns; never copy its environment files, production data, credentials, or unrelated code.
- Keep the brand `MMWR / Malaysia Most Wanted Ranking`; UI supports Simplified Chinese, English and Bahasa Melayu.
- Homepage order/counts: interactive Malaysia map, 8 Latest, 8 Hot Ranked, 12 Smart Mix Tags. Advertising is OFF by default.
- Keep the 18+ gate, consent, RLS, server authorization, Owner/Admin TOTP 2FA, internal evidence isolation, audit logs and backup verification as launch requirements.
- Do not present fabricated posts, people, statistics or geographic boundaries as real data.
- Mark optional features OFF unless HANDOFF explicitly says otherwise. Do not configure or deploy Production without guiding the user step by step.
- Never write secrets into source, docs, chat, logs or the browser bundle.
