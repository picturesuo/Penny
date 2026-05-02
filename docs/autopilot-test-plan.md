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
- Primary Autopilot routes: session-scoped `/api/sessions/:sessionId/autopilot/state`, `/api/sessions/:sessionId/autopilot/tick`, and `/api/sessions/:sessionId/next-move-candidates/:candidateId/start`.
- Compatibility routes: legacy `/autopilot/*` and `/api/brains/:brainId/autopilot/*` aliases are preservation surfaces, not the preferred MVP contract.

## Active Coverage

| Case | Test surface | Assertion |
| --- | --- | --- |
| Ranking chooses the founder willingness-to-pay assumption | `test/brain/nextMoveEngine.test.ts` | The pure engine ranks the willingness-to-pay assumption above lower-leverage nodes for a founder seed. |
| Open challenge returns `resume_open_challenge` | `test/brain/nextMoveEngine.test.ts` | An unanswered challenge outranks fresh exploration and returns the resume action. |
| MVP mode labels stay narrow | `packages/brain/src/modes.test.ts` and `packages/brain/frontend/test/modeLabels.test.ts` | The user-facing surface stays on Brain, Check, and Learn rather than reintroducing broad Search or chatbot modes. |
| GET routes do not mutate | `packages/brain/src/thinking-mode-routes.test.ts`, `packages/brain/src/session-cockpit-routes.test.ts`, and `packages/brain/src/thinking-mode-service.test.ts` | GET/state reads do not append Moves or mutate claim truth. |
| Autopilot tick creates candidates | `packages/brain/src/thinking-mode-service.test.ts` | Tick persists `next_move_candidates` and `next_move_recomputed` without mutating claim text or confidence. |
| Start focus creates `autopilot_focus_started` | `packages/brain/src/thinking-mode-service.test.ts`, `packages/brain/src/thinking-mode-routes.test.ts`, and `packages/brain/frontend/test/brainClient.test.ts` | Accepting a suggested focus records an explicit focus-start Move through backend and frontend contracts. |
| Manual node click creates `manual_node_selected` | `packages/brain/src/thinking-mode-service.test.ts`, `packages/brain/src/thinking-mode-routes.test.ts`, `packages/brain/src/autopilot-route.test.ts`, and `packages/brain/frontend/test/brainClient.test.ts` | Manual selection pauses Autopilot and records the selected claim. |
| Go There starts one backend candidate | `packages/brain/frontend/test/autopilotUx.test.ts` and `packages/brain/frontend/test/brainClient.test.ts` | The frontend start intent uses a selected persisted candidate and refreshes cockpit state after the write. |
| Defend creates `user_defended` | `packages/brain/src/challenge-service.test.ts` | Defend stores reasoning and emits the correct Move kind. |
| Revise creates new ClaimVersion and `claim_revised` | `packages/brain/src/challenge-service.test.ts` | Revise preserves the old version and appends a new current version. |
| Absorb creates `critique_absorbed` | `packages/brain/src/challenge-service.test.ts` | Absorb marks the challenge as acknowledged without rewriting the claim. |
| Challenge Brief includes what changed | `packages/brain/src/challenge-brief-service.test.ts` | The final Challenge Brief summarizes response, revisions, open risks, and replaced ClaimVersions. |
| Session canvas exposes the thinking graph | `packages/brain/src/session-canvas-route.test.ts` and `packages/brain/src/brain-search-route.test.ts` | Canvas output maps backend claims, edges, Brain objects, and recommended next-move path without frontend-invented graph state. |
| YC MVP loop reaches Autopilot, Brain, Canvas, and related context | `packages/brain/src/mvp-idea-drop-flow.test.ts` | The exact demo seed becomes Learn structure, a Check recommendation, a saved Brain result, Canvas structure, and searchable related context. |
| Route preservation protects active Autopilot paths | `packages/brain/src/p3-route-preservation.test.ts` | Session-scoped routes stay active while legacy compatibility aliases remain explicit and non-preferred. |
| Verify remains source-grounded where possible | `packages/brain/src/verify-route.test.ts` and `packages/brain/frontend/test/verifyPanel.test.ts` | Verify uses structured provider output, records search trace when available, and exposes evidence/confidence controls. |

## Maintenance Path

1. Keep the next-move engine tests database-free.
2. Prefer session-scoped Autopilot routes for new MVP tests; keep legacy route tests only for compatibility preservation.
3. Add DB-backed service tests only after a stable test database bootstrap exists.
4. Keep default `pnpm test` free of TODO-only placeholders.
5. Treat the smoke script as a demo/readiness gate for the full happy path, and keep focused service or route tests as the first proof for each new Move-backed behavior.
6. Update this plan whenever a new test becomes the canonical guard for Autopilot candidate persistence, focus start, manual override, Canvas graph output, or Verify source grounding.

## Demo Gate

Before a demo against disposable local data or an isolated smoke database, run:

```sh
pnpm typecheck
pnpm test
pnpm build:frontend
./scripts/smoke-thinking-mode.sh
```

If `DATABASE_URL` is not configured for the smoke script, run the first three commands and record the smoke script as environment-blocked rather than silently skipping it.
