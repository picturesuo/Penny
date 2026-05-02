# Thinking Mode Autopilot Test Plan

Artifact ID: `AUTOPILOT-TEST-PLAN`

## Purpose

This plan tracks the active Thinking Mode Autopilot verification surface without broadening the product into a chatbot, note app, wiki, or generic AI wrapper.

The backend remains the source of canonical thinking state. Tests must verify Moves, ClaimVersions, graph focus, candidates, challenges, and artifacts through backend-owned contracts.

## Goal

- G1: Keep the Thinking Mode Autopilot test surface executable in the default repo test flow.
- G2: Prove the MVP loop pieces that Autopilot touches: candidate ranking, accepted focus, manual override, challenge response handling, Canvas graph output, Verify source grounding, and Challenge Brief output.
- G3: Keep coverage aligned with Penny's durable graph contract: Moves are append-only, ClaimVersions preserve revision history, and the frontend renders backend-owned state.

## Scope

- SP1: In scope: deterministic next-move engine tests, Thinking Mode service/route tests, Challenge service tests, Challenge Brief tests, frontend client tests that exercise backend-owned contracts, and the smoke script listed in this file.
- SP2: In scope: documenting the minimum test mapping needed before a demo or contract-changing implementation.
- SP3: Out of scope: new product surfaces, generic chat behavior, broad document ingestion, external provider quality, vector ranking quality, and UI polish unrelated to Autopilot contract correctness.
- SP4: Out of scope for this documentation pass: adding new runtime behavior or changing product contracts beyond this test-plan artifact.

## Constraints

- CT1: Use the Node built-in test runner through `tsx --test`.
- CT2: Keep `pnpm test` free of TODO-only placeholders.
- CT3: Keep next-move engine tests database-free.
- CT4: Prefer session-scoped Autopilot routes for new MVP tests; keep legacy aliases as compatibility preservation surfaces.
- CT5: Add DB-backed service tests only when the behavior depends on persisted Moves, ClaimVersions, FocusState, candidates, or artifacts.
- CT6: Require `DATABASE_URL` before `pnpm db:migrate` or DB-backed API smoke tests.
- CT7: Backend state is canonical; tests must not validate frontend-invented graph edges or durable thinking state as source of truth.
- CT8: Autopilot tick and focus tests must not silently mutate claim text, confidence, or edge truth.

## Success Criteria

- SC1: `pnpm test` covers the current Autopilot contract without skipped TODO placeholders.
- SC2: Ranking tests prove founder willingness-to-pay assumptions outrank lower-leverage nodes for the founder seed.
- SC3: Open challenge tests prove unanswered challenges return `resume_open_challenge`.
- SC4: GET/state route tests prove reads do not append Moves or mutate claim truth.
- SC5: Tick tests prove candidates persist through `next_move_candidates` and `next_move_recomputed`.
- SC6: Accepted focus tests prove `autopilot_focus_started` is recorded through backend and frontend contracts.
- SC7: Manual selection tests prove `manual_node_selected` is recorded and Autopilot is paused.
- SC8: Challenge response tests prove Defend, Revise, and Absorb create the correct Moves and ClaimVersion effects.
- SC9: Challenge Brief tests prove response outcome, revisions, open risks, and replaced ClaimVersions appear in the artifact.
- SC10: Canvas and search/Verify tests prove downstream Brain context stays backend-derived and source-grounded where possible.
- SC11: Demo gate commands are explicit and runnable by the next implementation or release pass.

## Invariants

- INV1: Penny remains a controllable thinking instrument, not a generic chatbot.
- INV2: Moves remain immutable and append-only.
- INV3: Claim text and confidence changes require explicit user action such as Revise.
- INV4: Candidate suggestions are thinking actions with rationale and exit criteria, not mere graph navigation.
- INV5: Backend-owned graph, focus, candidate, challenge, and artifact state remains the test source of truth.

## Failure Modes

- FM1: Tests validate a local-only navigation path instead of a Move-backed accepted focus.
- FM2: Candidate auditability splits across inconsistent move names, candidate rows, and fixture-only metadata.
- FM3: Manual override tests miss paused Autopilot state or the selected claim reference.
- FM4: GET route coverage allows read paths to append Moves or mutate claim truth.
- FM5: Frontend tests pass while inventing durable graph state that the backend did not return.
- FM6: Demo gate omits the smoke script, build, or typecheck and gives a false sense of readiness.

## Risks / Open Questions

- R1: `scripts/smoke-thinking-mode.sh` may require local API/database setup that is not available in every developer environment.
- R2: Live provider output can vary when provider credentials are enabled; deterministic contract tests should remain the primary gate.
- Q1: Should DB-backed smoke setup get a dedicated fixture command so the smoke script is less environment-dependent?

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

## Test Mapping

| ID | Case | Test surface | Assertion |
| --- | --- | --- | --- |
| TM1 | Ranking chooses the founder willingness-to-pay assumption | `test/brain/nextMoveEngine.test.ts` | The pure engine ranks the willingness-to-pay assumption above lower-leverage nodes for a founder seed. |
| TM2 | Open challenge returns `resume_open_challenge` | `test/brain/nextMoveEngine.test.ts` | An unanswered challenge outranks fresh exploration and returns the resume action. |
| TM3 | MVP mode labels stay narrow | `packages/brain/src/modes.test.ts` and `packages/brain/frontend/test/modeLabels.test.ts` | The user-facing surface stays on Brain, Check, and Learn rather than reintroducing broad Search or chatbot modes. |
| TM4 | GET routes do not mutate | `packages/brain/src/thinking-mode-routes.test.ts`, `packages/brain/src/session-cockpit-routes.test.ts`, and `packages/brain/src/thinking-mode-service.test.ts` | GET/state reads do not append Moves or mutate claim truth. |
| TM5 | Autopilot tick creates candidates | `packages/brain/src/thinking-mode-service.test.ts` | Tick persists `next_move_candidates` and `next_move_recomputed` without mutating claim text or confidence. |
| TM6 | Start focus creates `autopilot_focus_started` | `packages/brain/src/thinking-mode-service.test.ts`, `packages/brain/src/thinking-mode-routes.test.ts`, and `packages/brain/frontend/test/brainClient.test.ts` | Accepting a suggested focus records an explicit focus-start Move through backend and frontend contracts. |
| TM7 | Manual node click creates `manual_node_selected` | `packages/brain/src/thinking-mode-service.test.ts`, `packages/brain/src/thinking-mode-routes.test.ts`, `packages/brain/src/autopilot-route.test.ts`, and `packages/brain/frontend/test/brainClient.test.ts` | Manual selection pauses Autopilot and records the selected claim. |
| TM8 | Go There starts one backend candidate | `packages/brain/frontend/test/autopilotUx.test.ts` and `packages/brain/frontend/test/brainClient.test.ts` | The frontend start intent uses a selected persisted candidate and refreshes cockpit state after the write. |
| TM9 | Defend creates `user_defended` | `packages/brain/src/challenge-service.test.ts` | Defend stores reasoning and emits the correct Move kind. |
| TM10 | Revise creates new ClaimVersion and `claim_revised` | `packages/brain/src/challenge-service.test.ts` | Revise preserves the old version and appends a new current version. |
| TM11 | Absorb creates `critique_absorbed` | `packages/brain/src/challenge-service.test.ts` | Absorb marks the challenge as acknowledged without rewriting the claim. |
| TM12 | Challenge Brief includes what changed | `packages/brain/src/challenge-brief-service.test.ts` | The final Challenge Brief summarizes response, revisions, open risks, and replaced ClaimVersions. |
| TM13 | Session canvas exposes the thinking graph | `packages/brain/src/session-canvas-route.test.ts` and `packages/brain/src/brain-search-route.test.ts` | Canvas output maps backend claims, edges, Brain objects, and recommended next-move path without frontend-invented graph state. |
| TM14 | YC MVP loop reaches Autopilot, Brain, Canvas, and related context | `packages/brain/src/mvp-idea-drop-flow.test.ts` | The exact demo seed becomes Learn structure, a Check recommendation, a saved Brain result, Canvas structure, and searchable related context. |
| TM15 | Route preservation protects active Autopilot paths | `packages/brain/src/p3-route-preservation.test.ts` | Session-scoped routes stay active while legacy compatibility aliases remain explicit and non-preferred. |
| TM16 | Verify remains source-grounded where possible | `packages/brain/src/verify-route.test.ts` and `packages/brain/frontend/test/verifyPanel.test.ts` | Verify uses structured provider output, records search trace when available, and exposes evidence/confidence controls. |

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

## Status

- ST1: This artifact is initialized for the current Autopilot test-plan task.
- ST2: This documentation pass changes documentation only; no runtime API, schema, or exported TypeScript contract changes are introduced.
- ST3: Implementation should stop here until a later role takes a specific test or runtime gap from the Success Criteria or Test Mapping.
