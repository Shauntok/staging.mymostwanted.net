# Changelog

## 2026-10-03 — Clarification V1 local implementation

- Added the existing-post-model architecture with distinct `story` / `clarification` types and a private one-to-one relationship table.
- Added localized clarification directory/detail pages, story cross-links, search and tag badges, and a staff management widget with audited Owner controls.
- Added an in-browser clarification request draft. Telegram remains unavailable until an official strict-format URL is configured; requests are not sent to or saved by MMWR.
- Kept publishing and Telegram unconfigured by default. The migrations are local only; no tests, build, database validation, Staging or Production deployment has been run for this work.
- Added an Owner-only TOTP-and-reason control for the clarification publication gate, with an audit trail; its initial state remains off.
- Added Clarification-specific Phase 3 UI review, Staging acceptance and migration rollback guidance. These are local plans; the migrations have not been applied and the checks have not been run.
- Hardened Owner removal decisions against null or unsupported values; the negative database case is documented for post-UI Staging verification and has not been executed.
- Serialized Clarification tag selection against concurrent tag deactivation using deterministic shared row locks; the race and invalid-tag cases remain unverified until the post-UI database gate.
- Moved Clarification mutation timestamps after row-lock waits and authorization rechecks; concurrency and time-boundary behavior remains unverified until the post-UI database gate.
- Serialized Admin removal proposals with Mother lifecycle and relationship locks, with post-lock role/TOTP validation; its lock-wait case remains unverified until the post-UI database gate.
- Revalidated staff role and recent TOTP after tag-selection locks and Owner hide after relation locking; lock-wait negative cases remain unverified until the post-UI database gate.
- When a public clarification's related story is hidden, the directory and detail now show only localized neutral unavailable copy; they omit placeholder fields, body, reactions, sharing controls and identifying structured data. UI and runtime verification remain pending.
- Extended the Phase 3 UI review guide to all three Clarification locale routes and stated that the hidden-story privacy branch cannot be visually accepted until synthetic data is available.
- Reconciled the Phase 3 rollback guide against the current 20260930, 20261001, and Clarification migration files: all 48 in-scope files have one guide entry, with no missing or out-of-scope rows. This is an inventory check only; no migration was run.
- Rechecked Phase 3 high-risk defaults in `.env.example` and migration seeds. Deletion, IP blocking, evidence scanning/preview/visibility, submission publication, critical email and Clarification publication remain OFF; Telegram support remains unset. This confirms source defaults only, not runtime state.
