# MMWR Phase 1: Accessible Navigation and Brand Lockup

> Derived from Phase 1 of MASTER_PLAN.md. Preserve the approved language, theme, age-gate and consent behavior.

## Goal

Finish the shared shell's left-side covering drawer, keyboard focus behavior, visible focus styling, and bilingual-capable complete MMWR brand lockup.

## Task 1: Accessible drawer, overlays and brand

Work in components/shell/SiteChrome.tsx, components/consent/ConsentOverlays.tsx, app/globals.css, and the existing locale catalog only if required.

- Change the covering drawer to enter from the left, matching the project decision.
- Treat it as a modal dialog: labelled, aria-modal, open button exposes expanded/control state, focus moves inside on open, Escape closes it, Tab stays inside, close restores focus, and background is inert/non-scrollable while open.
- Preserve mobile and desktop responsive behavior and every legal/Cookie link; do not add dead paths.
- Provide the same keyboard-focus treatment for age and consent dialogs. Under-18 choice cannot dismiss/approve the age gate; Escape cannot bypass it. Consent dialog can be closed and reopened from Footer.
- Add a visible focus-visible indicator for keyboard users and honor reduced-motion settings.
- Complete the brand lockup using the current custom mark plus MMWR and the approved Chinese display name when Chinese locale is active. Keep a compact mark-only use available. Do not use emoji or icon-library substitutes.
- Keep all user-visible strings localized in the three supported languages; no changes to homepage counts/data.

## Constraints

- Do not modify Our Little Age, provider configuration, auth, storage or legal text.
- Do not weaken 18+ gate, consent defaults, search noindex, or focus boundaries.
- Do not add/run tests or build.

## Completion

The drawer and dialogs are keyboard-operable and have clear focus states; the drawer opens from the left; brand use follows the handoff; existing routes remain unchanged.
