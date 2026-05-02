# Thinking Mode Autopilot Test Plan

## Purpose

This plan tracks the active Thinking Mode Autopilot verification surface without broadening the product into a chatbot, note app, wiki, or generic AI wrapper.

The backend remains the source of canonical thinking state. Tests should verify Moves, ClaimVersions, graph focus, candidates, challenges, and artifacts through backend-owned contracts.

## Current Verification Surface

- Test framework: Node built-in test runner through `tsx --test`.
- Current suite: `pnpm test`, which runs `packages/brain/src/*.test.ts`, `packages/brain/frontend/test/*.test.ts`, and `test/brain/nextMoveEngine.test.ts`.
- Typecheck: `pnpm typecheck`.
- Local API: `pnpm dev:api`, serving `http://localhost:3000`.
- DB setup: `DATABASE_URL` must be exported before `pnpm db:migrate` or DB-backed API smoke tests.
- Removed gap: TODO-only skeleton tests were deleted; the remaining `test/brain` suite is real and runs in the default test script.
- Smoke status: `scripts/smoke-thinking-mode.sh` is the current full mutating happy-path smoke, not a placeholder waiting for promotion.

## Active Coverage

| Case | Test surface | Assertion |
| --- | --- | --- |
| Ranking chooses the founder willingness-to-pay assumption | `test/brain/nextMoveEngine.test.ts` | The pure engine ranks the willingness-to-pay assumption above lower-leverage nodes for a founder seed. |
| Open challenge returns `resume_open_challenge` | `test/brain/nextMoveEngine.test.ts` | An unanswered challenge outranks fresh exploration and returns the resume action. |
| GET routes do not mutate | `packages/brain/src/thinking-mode-routes.test.ts` and `packages/brain/src/thinking-mode-service.test.ts` | GET/state reads do not append Moves or mutate claim truth. |
| Autopilot tick creates candidates | `packages/brain/src/thinking-mode-service.test.ts` | Tick persists `next_move_candidates` and `next_move_recomputed` without mutating claim text or confidence. |
| Start focus creates `autopilot_focus_started` | `packages/brain/src/thinking-mode-service.test.ts` | Accepting a suggested focus records an explicit focus-start Move. |
| Manual node click creates `manual_node_selected` | `packages/brain/src/thinking-mode-service.test.ts` | Manual selection pauses Autopilot and records the selected claim. |
| Defend creates `user_defended` | `packages/brain/src/challenge-service.test.ts` | Defend stores reasoning and emits the correct Move kind. |
| Revise creates new ClaimVersion and `claim_revised` | `packages/brain/src/challenge-service.test.ts` | Revise preserves the old version and appends a new current version. |
| Absorb creates `critique_absorbed` | `packages/brain/src/challenge-service.test.ts` | Absorb marks the challenge as acknowledged without rewriting the claim. |
| Challenge Brief includes what changed | `packages/brain/src/challenge-brief-service.test.ts` | The final Challenge Brief summarizes response, revisions, open risks, and replaced ClaimVersions. |

## Maintenance Path

1. Keep the next-move engine tests database-free.
2. Add DB-backed service tests only after a stable test database bootstrap exists.
3. Keep default `pnpm test` free of TODO-only placeholders.
4. Treat the smoke script as a demo/readiness gate for the full happy path, and keep focused service or route tests as the first proof for each new Move-backed behavior.

## Demo Gate

Before a demo against disposable local data or an isolated smoke database, run:

```sh
pnpm typecheck
pnpm test
./scripts/smoke-thinking-mode.sh
```
