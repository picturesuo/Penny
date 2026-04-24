# Codebase Audit

## Snapshot

Penny’s current repo is split into three practical zones:

- Public entry and auth under `src/app`.
- Signed-in dashboard and workspace surfaces under `src/app/dashboard` and `src/app/app`.
- Shared domain logic under `src/lib`, `src/server`, `src/types`, and `src/components/penny`.

The roadmap should be read against this layout, not against an older mental model of the app.

## Canonical Path

- Public visitors start at `/`.
- Authenticated users land on `/dashboard`.
- The active product workspace lives under `/app`.
- The thought-map workspace is the main task surface for claims, critique, and learning.

## Actual Surface Map

- `src/app/page.tsx`: landing page and authenticated redirect.
- `src/app/auth/sign-in/page.tsx`: sign-in page.
- `src/app/auth/sign-up/page.tsx`: sign-up page.
- `src/app/dashboard/page.tsx`: signed-in home dashboard.
- `src/app/app/page.tsx`: in-product dashboard and overview surface.
- `src/app/app/maps/[id]/page.tsx`: map detail entry.
- `src/components/penny/home-dashboard.tsx`: dashboard renderer.
- `src/components/penny/thought-map-workspace.tsx`: core map workspace.
- `src/components/penny/challenge-round.tsx`: challenge-round card.
- `src/components/penny/auth-form.tsx`: auth submission form.
- `src/server/thought-map.ts`: authoritative map hydration and persistence logic.
- `src/server/mvp.ts`: MVP-level map access helpers.
- `src/db/prisma.ts`: Prisma client bootstrap.

## Type Surface

The repo already uses current runtime-aligned types rather than the original sketch names:

- `src/types/mvp-core.ts` captures the MVP contract.
- `src/types/thought-map.ts` holds the richer thought-map model.
- `src/types/penny.ts` and the related domain types describe the signed-in product surfaces.

When the roadmap says “map” or “dashboard,” the code usually means one of these concrete surfaces rather than a generic page.

## Route Reality

- Auth now resolves to `/dashboard`, not `/app`.
- The workspace and deeper product routes still live under `/app`.
- The dashboard is a home entrypoint, not the primary working shell.
- The workspace is where claims, critique, and learning happen.

## Reconciliation Table

- “Roadmap step about the dashboard” -> `src/app/dashboard/page.tsx` and `src/components/penny/home-dashboard.tsx`.
- “Roadmap step about the main workspace” -> `src/app/app/page.tsx` and `src/components/penny/thought-map-workspace.tsx`.
- “Roadmap step about auth” -> `src/app/auth/sign-in/page.tsx`, `src/app/auth/sign-up/page.tsx`, and `src/components/penny/auth-form.tsx`.
- “Roadmap step about the core runtime model” -> `src/server/thought-map.ts`, `src/types/thought-map.ts`, and `src/types/mvp-core.ts`.

## Audit Notes

- `docs/knowledge.md` and `docs/queue.md` are the running repo memory, but they are not the roadmap itself.
- If a future roadmap step names a file that does not exist, the step is stale and should be rewritten against the current code map before execution.
- If a future route claim conflicts with the actual auth/home path, the code path should be fixed first and the docs should follow.

## Current Conclusion

The codebase is internally coherent, but the published roadmap language needs to stay synchronized with the actual `/dashboard` and `/app` split and with the current `thought-map` / `mvp-core` type surfaces.
