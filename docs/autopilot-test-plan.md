# Thinking Mode Autopilot Test Plan

Artifact ID: `AUTOPILOT-TEST-PLAN`
Latency update: 2026-05-05
Repository completion update: 2026-05-20
Smoke gate update: 2026-05-20
Repository verification refresh: 2026-05-22

## Purpose

This plan tracks the active Thinking Mode Autopilot verification surface without broadening the product into a chatbot, note app, wiki, or generic AI wrapper.

The backend remains the source of canonical thinking state. Tests must verify Moves, ClaimVersions, graph focus, candidates, challenges, artifacts, and speed-critical local paths through backend-owned contracts.

## Goal

- G1: Keep the Thinking Mode Autopilot test surface executable in the default repo test flow.
- G2: Prove the MVP loop pieces that Autopilot touches: candidate ranking, accepted focus, manual override, challenge response handling, Canvas graph output, Verify source grounding, and Challenge Brief output.
- G3: Keep coverage aligned with Penny's durable graph contract: Moves are append-only, ClaimVersions preserve revision history, and the frontend renders backend-owned state.
- G4: Make latency part of correctness for the first loop: local graph/ranking paths must stay provider-free, provider-backed work must be bounded and observable, and demo gates must catch slow AI orchestration before a pitch.

## Scope

- SP1: In scope: deterministic next-move engine tests, Thinking Mode service/route tests, Challenge service tests, Challenge Brief tests, frontend client tests that exercise backend-owned contracts, and the smoke script listed in this file.
- SP2: In scope: documenting the minimum test mapping needed before a demo or contract-changing implementation.
- SP3: In scope: local-path latency gates, provider-route metadata checks, and a demo timing record that distinguishes local graph work from provider-backed generation.
- SP4: Out of scope: new product surfaces, generic chat behavior, broad document ingestion, external provider quality, vector ranking quality, and UI polish unrelated to Autopilot contract correctness.
- SP5: Out of scope for this documentation pass: adding new runtime behavior or changing product contracts beyond this test-plan artifact.

## Constraints

- CT1: Use the Node built-in test runner through `tsx --test`.
- CT2: Keep `pnpm test` free of TODO-only placeholders.
- CT3: Keep next-move engine tests database-free.
- CT4: Prefer session-scoped Autopilot routes for new MVP tests; keep legacy aliases as compatibility preservation surfaces.
- CT5: Add DB-backed service tests only when the behavior depends on persisted Moves, ClaimVersions, FocusState, candidates, or artifacts.
- CT6: Require `DATABASE_URL` before `pnpm db:migrate` or DB-backed API smoke tests.
- CT7: Backend state is canonical; tests must not validate frontend-invented graph edges or durable thinking state as source of truth.
- CT8: Autopilot tick and focus tests must not silently mutate claim text, confidence, or edge truth.
- CT9: Provider-backed tests must never be the only proof that the first loop works; local deterministic tests are the primary gate for speed-critical graph and next-move behavior.
- CT10: Latency checks must report the command, environment, elapsed time, and whether a live provider was used.

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
- SC12: Local fast-path tests prove next-move ranking, Autopilot tick, accepted focus, manual override, and post-response retick behavior run without live provider calls.
- SC13: Current provider-backed AI operation tests prove BrainRun guard coverage for operation, provider, model, status, input, output, error, createdAt, and completedAt; latency-specific route metadata remains deferred to TM19 and LG6.
- SC14: Demo gate records elapsed time separately for local tests, frontend build, full smoke, and any live-provider smoke so a slow provider cannot hide inside a generic pass/fail result.

## Invariants

- INV1: Penny remains a controllable thinking instrument, not a generic chatbot.
- INV2: Moves remain immutable and append-only.
- INV3: Claim text and confidence changes require explicit user action such as Revise.
- INV4: Candidate suggestions are thinking actions with rationale and exit criteria, not mere graph navigation.
- INV5: Backend-owned graph, focus, candidate, challenge, and artifact state remains the test source of truth.
- INV6: Speed-critical Thinking Mode paths are local unless the contract explicitly labels them provider-backed.
- INV7: Streaming or partial UI output can improve perceived latency, but only final validated structured output can write durable truth.

## Failure Modes

- FM1: Tests validate a local-only navigation path instead of a Move-backed accepted focus.
- FM2: Candidate auditability splits across inconsistent move names, candidate rows, and fixture-only metadata.
- FM3: Manual override tests miss paused Autopilot state or the selected claim reference.
- FM4: GET route coverage allows read paths to append Moves or mutate claim truth.
- FM5: Frontend tests pass while inventing durable graph state that the backend did not return.
- FM6: Demo gate omits the smoke script, build, or typecheck and gives a false sense of readiness.
- FM7: Correctness tests pass while Autopilot waits on a live provider before returning local next-move candidates.
- FM8: A fast provider route is enabled without timeout, context budget, reasoning-effort setting, or BrainRun latency metadata.
- FM9: A demo claims Gemini-like speed while the measured path is actually a deterministic mock or cached response.

## Risks / Open Questions

- R1: The bare `scripts/smoke-thinking-mode.sh` command is environment-sensitive: it requires usable local API/database setup and an auth mode compatible with the script's unauthenticated API calls. Use the isolated dev-auth command in the Demo Gate for reproducible release evidence.
- R2: Live provider output can vary when provider credentials are enabled; deterministic contract tests should remain the primary gate.
- R3: Wall-clock latency assertions can be flaky in CI; keep hard assertions focused on provider-free boundaries and record measured timings as release evidence.
- R4: Adding Gemini or any other fast provider without streaming/structured-output parity could improve perceived speed while weakening validation.
- Q1: Should DB-backed smoke setup get a dedicated fixture command so the smoke script is less environment-dependent?
- Q2: Should the repo add a small `pnpm latency:autopilot` script that measures demo-seed local tick, challenge generation, and brief generation separately?

## Current Verification Surface

- Test framework: Node built-in test runner through `tsx --test`.
- Current suite: `pnpm test`, which runs `packages/brain/src/*.test.ts`, `packages/brain/frontend/test/*.test.ts`, and `test/brain/nextMoveEngine.test.ts`. As of 2026-05-22, that glob passes 455 tests and also exercises the expanded Create, context-layer, memory, Brain Ranker, Google connector, codebase, deployment-readiness, recipe, and graph/search test surface; those tests strengthen repository readiness without broadening this Autopilot artifact's scope.
- Typecheck: `pnpm typecheck`.
- Local API: `pnpm dev:api`, serving `http://localhost:3000`.
- DB setup: `DATABASE_URL` must be exported before `pnpm db:migrate` or DB-backed API smoke tests.
- Current speed proof: next-move ranking and Thinking Mode service tests use local deterministic fixtures; they prove candidate ranking and focus writes do not require a live provider, but they do not yet enforce per-request wall-clock budgets.
- Current provider audit proof: Challenge, Verify, Learn, seed, and artifact generation require a recorded BrainRun id before provider-backed generation. BrainRun rows record operation, provider, model, status, input, output, error, createdAt, and completedAt. Latency-specific route metadata remains a deferred regression item rather than a current repository-completion blocker.
- Removed gap: TODO-only skeleton tests were deleted; the remaining `test/brain` suite is real and runs in the default test script.
- Smoke status: `scripts/smoke-thinking-mode.sh` is the current full mutating happy-path smoke, not a placeholder waiting for promotion. For reproducible local release evidence, run it with `SMOKE_ISOLATED_DB=1` and `PENNY_AUTH_MODE=dev` on an unused local port so token-auth private deployments do not make the unauthenticated smoke requests fail.
- Primary Autopilot routes: session-scoped `/api/sessions/:sessionId/autopilot/state`, `/api/sessions/:sessionId/autopilot/tick`, and `/api/sessions/:sessionId/next-move-candidates/:candidateId/start`.
- Compatibility routes: legacy `/autopilot/*` and `/api/brains/:brainId/autopilot/*` aliases are preservation surfaces, not the preferred MVP contract.

## Repository Completion Snapshot

- CS1: The current repository-completion gate for this artifact is documentation readiness, not adding runtime behavior.
- CS2: The default test surface already includes backend route/service tests, frontend client tests, and the pure next-move engine test. This artifact should stay synchronized with that command rather than listing non-runnable placeholders.
- CS3: The queue's cleanup audit is complete; this plan should not reopen archived frontend cleanup, generic ingestion, broad search, or chatbot scope.
- CS4: Remaining latency work is intentionally deferred: add a focused provider metadata regression and optional timing script only when implementing latency instrumentation, not as part of this artifact completion pass.
- CS5: Before a demo, the gate remains `pnpm typecheck`, `pnpm test`, `pnpm build`, and the isolated dev-auth smoke script when PostgreSQL tooling is available.
- CS6: As of 2026-05-20, repository completion for this artifact means the plan is synchronized with the current default test command and expanded matching test files while still treating latency instrumentation as future work.
- CS7: As of 2026-05-22, repository completion refresh means the default test command passes 455 tests with no skipped or TODO tests in the default globs, and the isolated dev-auth smoke gate passes against a temporary PostgreSQL database; latency metadata remains intentionally deferred to TM19 and LG6.

## Test Mapping

| ID | Case | Test surface | Assertion |
| --- | --- | --- | --- |
| TM1 | Ranking chooses the founder willingness-to-pay assumption | `test/brain/nextMoveEngine.test.ts` | The pure engine ranks the willingness-to-pay assumption above lower-leverage nodes for a founder seed. |
| TM2 | Open challenge returns `resume_open_challenge` | `test/brain/nextMoveEngine.test.ts` | An unanswered challenge outranks fresh exploration and returns the resume action. |
| TM3 | MVP mode labels stay narrow | `packages/brain/src/modes.test.ts` and `packages/brain/frontend/test/modeLabels.test.ts` | The user-facing surface stays on Brain, Create, and Learn rather than reintroducing broad Search or chatbot modes. |
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
| TM14 | YC MVP loop reaches Autopilot, Brain, Canvas, and related context | `packages/brain/src/mvp-idea-drop-flow.test.ts` | The exact demo seed becomes Learn structure, a Create challenge or Verify recommendation, a saved Brain result, Canvas structure, and searchable related context. |
| TM15 | Route preservation protects active Autopilot paths | `packages/brain/src/p3-route-preservation.test.ts` | Session-scoped routes stay active while legacy compatibility aliases remain explicit and non-preferred. |
| TM16 | Verify remains source-grounded where possible | `packages/brain/src/verify-route.test.ts` and `packages/brain/frontend/test/verifyPanel.test.ts` | Verify uses structured provider output, records search trace when available, and exposes evidence/confidence controls. |
| TM17 | Fast path stays provider-free | `test/brain/nextMoveEngine.test.ts`, `packages/brain/src/thinking-mode-service.test.ts`, and `packages/brain/src/thinking-mode-routes.test.ts` | Ranking, tick, start focus, manual focus, and explicit retick are local contract paths and must not require live provider credentials. |
| TM18 | Provider generation requires BrainRun audit rows | `packages/brain/src/challenge-route.test.ts`, `packages/brain/src/verify-route.test.ts`, `packages/brain/src/inline-learn-route.test.ts`, `packages/brain/src/artifact-route.test.ts`, and `packages/brain/src/seed.test.ts` | Provider-backed generation rejects missing BrainRun ids and records operation/provider/model/status/input/output through the service or route prelude. |
| TM19 | Latency metadata is still deferred | Future provider metadata regression | A later implementation should fail if provider-backed inline routes lack timeout, context budget, route tier, reasoning-effort policy, latency fields, and validation result. |
| TM20 | Demo timing is separated by phase | Manual release record until a script exists | Local tests, frontend build, smoke script, and optional live-provider smoke are timed separately so slow AI orchestration is visible. |

## Maintenance Path

1. Keep the next-move engine tests database-free.
2. Prefer session-scoped Autopilot routes for new MVP tests; keep legacy route tests only for compatibility preservation.
3. Add DB-backed service tests only after a stable test database bootstrap exists.
4. Keep default `pnpm test` free of TODO-only placeholders.
5. Treat the smoke script as a demo/readiness gate for the full happy path, and keep focused service or route tests as the first proof for each new Move-backed behavior.
6. Update this plan whenever a new test becomes the canonical guard for Autopilot candidate persistence, focus start, manual override, Canvas graph output, or Verify source grounding.
7. Keep local-path tests independent of provider keys; live-provider tests may supplement release evidence but must not replace deterministic contract tests.
8. When adding a fast provider such as Gemini Flash, add provider-route tests for timeout, context budget, reasoning-effort controls, structured-output validation, and BrainRun latency metadata before enabling it in demo mode.

## Demo Gate

Before a demo against disposable local data or an isolated smoke database, run and record elapsed time for each phase:

```sh
time pnpm typecheck
time pnpm test
time pnpm build
time SMOKE_ISOLATED_DB=1 PENNY_AUTH_MODE=dev BASE_URL=http://localhost:3017 PORT=3017 ./scripts/smoke-thinking-mode.sh
```

Use a different unused `BASE_URL` and `PORT` pair if port `3017` is already occupied. The bare `time ./scripts/smoke-thinking-mode.sh` command is only a convenience for a local environment that already has a migrated database and dev-compatible auth; in token-auth or missing-database environments, record the bare command as environment-blocked rather than silently skipping the isolated smoke gate.

If a live provider is enabled for a demo, add a separate note for provider, model, operation, elapsed time, and BrainRun latency metadata. Do not describe the AI path as fast if the only passing gate used mock or deterministic fallback output.

## Latency Gate

- LG1: `test/brain/nextMoveEngine.test.ts` remains the first guard for provider-free ranking.
- LG2: `packages/brain/src/thinking-mode-service.test.ts` remains the first guard for local tick, candidate persistence, accepted focus, and manual override.
- LG3: `packages/brain/src/thinking-mode-routes.test.ts` remains the first guard that the client can explicitly retick after a challenge response instead of the frontend inventing the next state.
- LG4: Existing provider-backed generators must keep requiring a recorded BrainRun id before generation so AI output cannot affect truth without an audit row.
- LG5: A future demo timing script should separate deterministic local time from provider generation time and should flag provider paths that exceed the latency class in `docs/thinking-mode-autopilot-spec.md`.
- LG6: A future provider-route test should fail if an inline AI route lacks timeout, context budget, route tier, reasoning-effort policy, validation result, or latency metadata.

## Status

- ST1: This artifact is initialized for the current Autopilot test-plan task.
- ST2: This documentation pass changes documentation only; no runtime API, schema, or exported TypeScript contract changes are introduced.
- ST3: Implementation should stop here until a later role takes a specific test or runtime gap from the Success Criteria or Test Mapping.
- ST4: 2026-05-05 latency rewrite added fast-path, provider metadata, and demo timing gates to align the test plan with the Autopilot latency contract.
- ST5: 2026-05-08 repository completion update aligned the plan with the current default test command, BrainRun audit coverage, cleanup-audit queue status, and deferred latency instrumentation work.
- ST6: 2026-05-20 smoke gate update documented the previously verified isolated dev-auth smoke command and clarified when the bare smoke command is environment-blocked.
- ST7: 2026-05-20 repository refresh corrected SC13 so the current BrainRun audit proof no longer claims deferred latency metadata, and noted that the default test glob now covers the broader repository readiness surface.
- ST8: 2026-05-20 verification passed: `git diff --check -- docs/autopilot-test-plan.md`, `pnpm typecheck`, `pnpm test` with 405 passing tests, and `pnpm build` with no generated asset diff.
- ST9: 2026-05-22 verification refresh passed: `git diff --check -- docs/autopilot-test-plan.md`, `pnpm typecheck`, `pnpm test` with 455 passing tests, 0 failed, 0 skipped, and 0 todo, `pnpm build` with no generated asset diff, and `SMOKE_ISOLATED_DB=1 PENNY_AUTH_MODE=dev BASE_URL=http://localhost:3017 PORT=3017 ./scripts/smoke-thinking-mode.sh` in 9.692s total; no skipped or TODO test declarations were found in the default test globs.
