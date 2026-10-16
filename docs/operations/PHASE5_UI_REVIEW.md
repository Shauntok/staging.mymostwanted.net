# Phase 5 UI review guide

Review the local UI before final Phase 5 acceptance. The Owner has since authorized local migration and synthetic-data testing before UI review; those checks may continue while the UI remains pending. This is not permission to connect a hosted project, open analytics/advertising, or begin Staging. Hosted/Staging work requires UI acceptance and a separate environment authorization.

## Owner Campaign CRM

- Use only an existing authorized Owner session at `/admin`. The CRM is an Owner-only dashboard widget; its label should be translated in Chinese, English, and Bahasa Melayu.
- Review the compact responsive quote form, latest-record cards, editing flow, customer/slot/date filters, and loading/empty/unavailable/error states. The local migration is applied, and test fixtures roll back, so an empty CRM state is expected. Do not submit customer or real commercial information. Export/download/print controls are absent until the Owner approves an export and branding policy.
- Confirm the visible scope: client name, MYR amount, Flat Fee/CPM/CPC quote model, proposed slot note, optional start/end dates, text-only creative notes, and draft/quoted/confirmed/completed/cancelled status.
- Confirm labels explain that there are no contact details, uploaded assets, ad delivery, tracking events, impressions/clicks, or automatic billing. “Confirmed” is not an ad-serving instruction; CPM/CPC are quotes only.
- Confirm the page does not expose CSV, PDF, browser-print, or other data-export actions. Keep campaign data inside the Owner CRM UI until export scope and branding policy are separately confirmed.
- Do not save a layout, create or edit a campaign, enter a TOTP, or toggle any analytics/ad setting during UI review.

## Analytics and existing gates

- Confirm the Page View surface remains consent-gated and its runtime flags are unchanged. Valid Read/Hot and GA4 continue to show their existing disabled/unavailable states when their gates/configuration are absent.
- Do not infer any metric or campaign performance from placeholder UI. No synthetic counts or customer records are seeded by this slice.
- Record requested visual changes only. Do not start the test/build/browser/database sequence until the Owner explicitly says the UI is accepted.

## Current implementation boundary

The Owner Campaign CRM component and migration `20261004180000_mmwr_owner_campaign_crm.sql` are local code. The migration has been applied only to the local database; `owner_campaign_crm.test.sql` passes as part of the full local pgTAP suite, using synthetic fixtures that roll back. The current isolated production build also includes the CRM routes. No real CRM data exists. Browser interaction/visual acceptance and all hosted/Staging/Production operations remain outstanding.
