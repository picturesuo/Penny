# MVP Contract

## Purpose
Penny’s MVP is a pressure-tested second brain: capture a claim, challenge it, learn from the response, and keep the resulting record available for later revisiting.

This contract is the published, code-aligned version of the current slice. It is written to match the repo as it exists now, not an older sketch of the app.

## Canonical Routes

- `/` is the public landing page.
- `/auth/sign-in` and `/auth/sign-up` are the auth entry points.
- `/dashboard` is the signed-in home entrypoint.
- `/app` is the main workspace shell for maps, sessions, search, lessons, velocity, identity, and the other in-product surfaces.
- `/app/maps/[id]` is the thought-map workspace.

## Canonical Flow

1. A visitor lands on `/`.
2. A new user signs up or an existing user signs in through `/auth/*`.
3. Authenticated users land on `/dashboard`.
4. The dashboard routes the user into the appropriate work surface under `/app`.
5. The user captures or opens a map, then works through claim, challenge, and learning surfaces without leaving the product loop.

## Load-Bearing Surfaces

- `src/app/page.tsx` owns the public story and the redirect for authenticated visitors.
- `src/app/dashboard/page.tsx` owns the signed-in home view.
- `src/app/app/page.tsx` owns the main in-product dashboard and work surfaces.
- `src/components/penny/home-dashboard.tsx` renders the signed-in home state.
- `src/components/penny/thought-map-workspace.tsx` renders the map workspace and the capture-to-challenge-to-learn flow.
- `src/components/penny/challenge-round.tsx` renders the dedicated challenge-round card.
- `src/components/penny/auth-form.tsx` owns the sign-in and sign-up submission flow.

## Runtime Contract

- Claims, moves, shapes, and the live user lens are the core data layers.
- The map payload is derived from the server-side thought-map model, not from ad hoc client parsing.
- Capture and challenge should remain auditable and schema-aligned.
- The challenge response minimum is 10 characters at the API boundary and in the UI.
- Authenticated navigation should stay on one clean path: `/dashboard` for home, then `/app` for work.

## Published Artifacts

- `docs/codebase-audit.md` documents the current repo shape and the reconciliation between roadmap language and actual files.
- `docs/design-language.md` documents the visual system and layout rules for the product.

## Non-Goals

- This contract does not redefine persistence routes.
- This contract does not introduce a new app shell.
- This contract does not rename the existing `/app` workspace.

## Reconciliation Note

Older roadmap language in the repo referenced dashboard-oriented steps loosely and sometimes assumed older file names. This contract treats the current code layout as authoritative and keeps the user journey anchored to the actual routes and surfaces now in use.
