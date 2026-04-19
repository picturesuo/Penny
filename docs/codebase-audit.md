# Codebase Audit

## Snapshot

The repo currently has four meaningful zones:

- Public entry and auth under `src/app`.
- The canonical signed-in workspace under `src/app/app`.
- A legacy `/dashboard` route family that redirects into `/app`.
- Shared domain logic under `src/lib`, `src/server`, `src/types`, and `src/components/penny`.

The codebase is internally coherent only if you read `/app` as the active home. `/dashboard` now exists for compatibility, not as a second product root.

## Canonical Route Reality

- `/` is the public landing page.
- `/app` is the authenticated product home.
- `/app/*` contains the active work surfaces.
- `/dashboard` redirects to `/app`.
- `/auth/*` still exists, but it is no longer the center of the product loop.

## Actual Surface Map

- `src/app/page.tsx`: landing page and authenticated redirect.
- `src/app/auth/sign-in/page.tsx`: sign-in page.
- `src/app/auth/sign-up/page.tsx`: sign-up page.
- `src/app/auth/verify/page.tsx`: verification page.
- `src/app/app/page.tsx`: in-product dashboard and overview surface.
- `src/app/app/layout.tsx`: signed-in shell for the active workspace.
- `src/app/app/maps/[id]/page.tsx`: map detail entry.
- `src/app/dashboard/page.tsx`: legacy redirect to `/app`.
- `src/app/dashboard/layout.tsx`: legacy redirect to `/app`.
- `src/components/penny/home-dashboard.tsx`: dashboard renderer and server-side orchestration.
- `src/components/penny/home-dashboard-client.tsx`: client-only standalone dashboard renderer.
- `src/components/penny/thought-map-workspace.tsx`: core map workspace.
- `src/components/penny/challenge-round.tsx`: challenge-round card.
- `src/components/penny/auth-form.tsx`: auth submission form.
- `src/server/thought-map.ts`: authoritative map hydration and persistence logic.
- `src/server/mvp.ts`: MVP-level map access helpers.
- `src/db/prisma.ts`: Prisma client bootstrap.
- `src/proxy.ts`: request-time redirect for legacy `/dashboard` requests.

## Type Surface

The repo already uses runtime-aligned types rather than the original sketch names:

- `src/types/mvp-core.ts` captures the MVP contract.
- `src/types/thought-map.ts` holds the richer thought-map model.
- `src/types/penny.ts` and adjacent domain types describe the signed-in product surfaces.

When the roadmap says “map,” “dashboard,” or “workspace,” the code usually means one of these concrete surfaces rather than a generic page.

## Route Reality

- The canonical authenticated root is `/app`.
- `/dashboard` is a redirect-only compatibility path.
- Post-auth redirects, nav links, and keyboard shortcuts now point to `/app`.
- The app shell is mounted under `/app`, while the legacy dashboard route only preserves old entry points.

## Reconciliation Table

- “Roadmap step about the dashboard home” -> `src/app/app/page.tsx` and `src/components/penny/home-dashboard.tsx`.
- “Roadmap step about the main workspace” -> `src/app/app/page.tsx` and `src/components/penny/thought-map-workspace.tsx`.
- “Roadmap step about auth” -> `src/app/auth/sign-in/page.tsx`, `src/app/auth/sign-up/page.tsx`, `src/app/auth/verify/page.tsx`, and `src/components/penny/auth-form.tsx`.
- “Roadmap step about the core runtime model” -> `src/server/thought-map.ts`, `src/types/thought-map.ts`, and `src/types/mvp-core.ts`.

## Audit Notes

- `docs/knowledge.md` and `docs/queue.md` are running repo memory, but they are not the contract docs.
- If a future roadmap step names a file that does not exist, the step is stale and should be rewritten against the current code map before execution.
- If a future route claim conflicts with the actual `/app` root, the code path should be fixed first and the docs should follow.

## Current Conclusion

The codebase now has a single canonical authenticated home at `/app`. The remaining `/dashboard` path is only a legacy redirect, and the docs should stay synchronized to that reality.
