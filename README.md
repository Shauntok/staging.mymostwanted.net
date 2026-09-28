# MMWR — Malaysia Most Wanted Ranking

Independent project in C:\Users\PC\Desktop\mmwr.

## Start locally

- Install Node.js 20.9 or newer and npm.
- Run npm install, then npm run dev.
- Open the local address printed by Next.js.

## Project documents

- HANDOFF.md is the approved product brief and requirements.
- MASTER_PLAN.md is the implementation and release roadmap.
- USER_MANUAL.md documents intended user and operator workflows.
- docs/superpowers/plans/2026-09-28-mmwr-foundation.md records the initial build sequence.

## Environment separation

Keep Development, Staging, and Production projects and credentials separate. .env.example contains only nonsecret local defaults and variable names. Never copy credentials, databases, user submissions, evidence, or production assets from another project. Production setup is a guided user task after the application work is ready.

## Current scope

The current work establishes the responsive public shell and preference controls. Public posts, real map boundaries, authentication, data storage, analytics, advertising, and provider integrations are not connected yet. Optional analytics and advertising consent default to off. Search indexing remains disabled until launch review.
