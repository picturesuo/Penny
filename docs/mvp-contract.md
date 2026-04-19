# MVP Contract

## Purpose
Penny’s MVP is a closed loop for pressure-testing thought: capture a claim, challenge it, learn from the response, and keep the result available for later revisiting.

This document describes the current product contract as it exists in the repo today. It is not a roadmap and does not invent future surfaces.

## Canonical Routes

- `/` is the public landing page.
- `/app` is the canonical signed-in product home.
- `/app/*` is the active workspace family for maps, sessions, search, lessons, velocity, identity, unlocks, and related surfaces.
- `/dashboard` is legacy and redirects to `/app`.
- `/auth/sign-in`, `/auth/sign-up`, and `/auth/verify` still exist, but they are not the canonical product home.

## Current User Loop

1. A visitor lands on `/`.
2. If they already have a valid session or are running in demo mode, they are taken into `/app`.
3. If they choose to sign up or sign in, the auth form completes and returns them to `/app`.
4. In `/app`, the user captures a map, opens an existing map, or enters a supporting surface like search or lessons.
5. The map workspace moves through claim capture, steel-man, challenge, response, and follow-up learning.
6. The user can revisit history, artifacts, and related surfaces without leaving the `/app` shell.

## Load-Bearing Surfaces

- `src/app/page.tsx` owns the public landing page and the authenticated redirect.
- `src/app/app/page.tsx` owns the main in-product dashboard and surface orchestration.
- `src/app/app/layout.tsx` owns the shared signed-in shell for the active workspace.
- `src/components/penny/nav.tsx` owns the signed-in navigation for `/app`.
- `src/components/penny/home-dashboard.tsx` renders the richer dashboard state used inside `/app`.
- `src/components/penny/home-dashboard-client.tsx` renders the standalone dashboard mode for the route-backed home.
- `src/components/penny/thought-map-workspace.tsx` renders the map workspace and the capture-to-challenge flow.
- `src/components/penny/challenge-round.tsx` renders the dedicated challenge-round card.
- `src/components/penny/auth-form.tsx` owns the sign-in and sign-up submission flow.

## Runtime Contract

- Claims, moves, shapes, and the live user lens are the core data layers.
- The map payload is hydrated from the server-side thought-map model, not from ad hoc client parsing.
- Capture and challenge remain auditable and schema-aligned.
- Challenge responses enforce the current 10-character minimum at the API boundary and in the UI.
- `/dashboard` is not a separate product home anymore; it is only a compatibility redirect into `/app`.

## Non-Goals

- This contract does not add new product surfaces.
- This contract does not redefine persistence tables or schema ownership.
- This contract does not reintroduce a split between `/dashboard` and `/app`.

## Published Artifacts

- `docs/codebase-audit.md` records the current repo shape and route reality.
- `docs/design-language.md` records the current visual and navigation language.

## Reconciliation Note

Earlier repo language treated `/dashboard` as the home entrypoint. The code now treats `/app` as the canonical authenticated root, and this document follows the code.
