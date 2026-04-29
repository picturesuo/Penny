# Persistence Critique

Artifact ID: `PERSISTENCE-CRITIQUE`  
Date: 2026-04-29  
Role: CRITIC  
Status: `PROCEED WITH RISKS`

## Scope

Reviewed persistence-related implementation and tests in the current workspace:

- `packages/brain/src/db/schema.ts`
- `drizzle/0019_sweet_ezekiel_stane.sql`
- `drizzle/0020_freezing_baron_strucker.sql`
- `packages/brain/src/domain/repository.ts`
- `packages/brain/src/domain-repository.test.ts`
- `packages/brain/src/services/thinking-mode-service.ts`
- `packages/brain/src/autopilot-route.ts`
- `packages/brain/src/autopilot-route.test.ts`
- `packages/brain/src/routes/thinking-mode-routes.ts`
- `packages/brain/src/server.ts`
- `packages/brain/src/thinking-mode-service.test.ts`
- `packages/brain/src/thinking-mode-routes.test.ts`
- `packages/brain/src/autopilot-core.ts`
- `packages/brain/src/move-payloads.ts`
- `test/brain/thinkingModeService.test.ts`
- `docs/thinking-mode-autopilot-spec.md`
- `docs/move-taxonomy.md`

During review, `origin/main` advanced through service, route, test, and migration commits. This critique reflects current `HEAD` at `751b50c`.

## Findings

### `PERSISTENCE-CRITIQUE-F1`: Thinking Mode service and API route use backend persistence

`PASS WITH LEGACY ROUTE RISK`

The repository layer has `focus_states` and `next_move_candidates`, and `ThinkingModeService` now uses them. Its tick path loads a graph snapshot, ranks through the pure engine, persists candidate rows, records `next_move_recomputed`, marks a selected candidate, and upserts FocusState.

Evidence:

- `packages/brain/src/services/thinking-mode-service.ts:133` starts the persisted tick flow.
- `packages/brain/src/services/thinking-mode-service.ts:146` loads the backend graph snapshot.
- `packages/brain/src/services/thinking-mode-service.ts:147` ranks pure candidates.
- `packages/brain/src/services/thinking-mode-service.ts:148` persists candidate rows.
- `packages/brain/src/services/thinking-mode-service.ts:153` creates `next_move_recomputed`.
- `packages/brain/src/services/thinking-mode-service.ts:160` upserts FocusState.

The new Thinking Mode route is wired through `server.ts`, so the intended API path can exercise the service/repository persistence model. The remaining risk is backwards compatibility: the older `/autopilot/tick` path still exists and still ranks with `autopilot-core.ts`, persisting only an `autopilot_suggested` Move.

Evidence:

- `packages/brain/src/domain/repository.ts:125` reads `focusStates` and `nextMoveCandidates`.
- `packages/brain/src/domain/repository.ts:145` persists candidate rows with reason, score breakdown, provenance, graph hash, and fingerprint.
- `packages/brain/src/autopilot-route.ts:239` ranks through the older `rankAutopilotMoves` path.
- `packages/brain/src/autopilot-route.ts:257` creates only `autopilot_suggested`; it does not persist `next_move_recomputed`, `autopilot_focus_suggested`, `autopilot_focus_started`, `focus_states`, or `next_move_candidates`.
- `packages/brain/src/server.ts` dispatches `handleThinkingModeTickRequest` for `/api/brains/:brainId/autopilot/tick`.

Impact: the new Thinking Mode API can prove the persistence model. The demo should avoid the legacy `/autopilot/tick` route unless it is mapped onto `ThinkingModeService` or retired.

### `PERSISTENCE-CRITIQUE-F2`: FocusState supports resume structurally, not operationally

`PASS`

The schema has the right durable shape: `focusedClaimId`, `focusedEdgeId`, `source`, `suggestionMoveId`, `manualMoveId`, `paused`, `reason`, and `updatedAt`.

Evidence:

- `packages/brain/src/db/schema.ts:289` defines `focus_states`.
- `packages/brain/src/db/schema.ts:300` links suggestion and manual moves.
- `packages/brain/src/domain/repository.ts:240` upserts the row by `sessionId`.

`ThinkingModeService` writes FocusState for suggestion, accepted start, and manual override, and it respects paused state on tick when `resume` is false.

Evidence:

- `packages/brain/src/services/thinking-mode-service.ts:136`
- `packages/brain/src/services/thinking-mode-service.ts:160`
- `packages/brain/src/services/thinking-mode-service.ts:211`
- `packages/brain/src/services/thinking-mode-service.ts:271`

The committed legacy manual-selection route still returns a pause object without writing `focus_states`, and the committed legacy tick resume is still inferred from latest `manual_node_selected` versus latest `autopilot_suggested` Move. That is a legacy-route risk, not a blocker for the new Thinking Mode API path.

Evidence:

- `packages/brain/src/autopilot-route.ts:226` derives pause from Moves.
- `packages/brain/src/autopilot-route.ts:298` creates `manual_node_selected`.
- `packages/brain/src/autopilot-route.ts:313` returns pause state, with no FocusState write.

Impact: backend-owned resume state is implemented and route-tested for the new API path.

### `PERSISTENCE-CRITIQUE-F3`: candidate rows are explainable, but the live tick audit is too thin

`PASS WITH LEGACY ROUTE RISK`

The candidate table is strong for later explanation: it stores `reason`, `reasonCodes`, `exitCriteria`, `scoreBreakdown`, `provenance`, `graphHash`, and `fingerprint`.

Evidence:

- `packages/brain/src/db/schema.ts:316`
- `packages/brain/src/db/schema.ts:335`
- `packages/brain/src/db/schema.ts:337`
- `packages/brain/src/db/schema.ts:338`
- `packages/brain/src/db/schema.ts:339`

`ThinkingModeService.tick` writes those candidate rows and also creates a `next_move_recomputed` Move with selected/candidate IDs. However, committed live `POST /autopilot/tick` still does not write that table. The current persisted `autopilot_suggested` payload stores only compact `candidateScores`, not full candidate rationale, exit criteria, score breakdown, or provenance for later replay.

Evidence:

- `packages/brain/src/services/thinking-mode-service.ts:148`
- `packages/brain/src/services/thinking-mode-service.ts:153`
- `packages/brain/src/autopilot-route.ts:258`
- `packages/brain/src/move-payloads.ts:196`
- `packages/brain/src/move-payloads.ts:207`

Impact: new Thinking Mode service/route calls can explain candidates later; the committed legacy route cannot.

### `PERSISTENCE-CRITIQUE-F4`: duplicate prevention exists, with concurrency and command gaps

`PASS WITH GAPS`

Good coverage:

- `focus_states.session_id` is the primary key, so one focus row exists per session.
- `next_move_candidates` has unique indexes on `(session_id, fingerprint)` and `(session_id, candidate_id)`.
- `upsertNextMoveCandidates` targets `(session_id, fingerprint)`.
- route commands support idempotency keys through `command_idempotency_keys`.

Evidence:

- `packages/brain/src/db/schema.ts:292`
- `packages/brain/src/db/schema.ts:346`
- `packages/brain/src/db/schema.ts:347`
- `packages/brain/src/domain/repository.ts:184`
- `packages/brain/src/autopilot-route.ts:147`
- `packages/brain/src/autopilot-route.ts:191`

Gaps:

- idempotency keys are optional, so repeated POSTs without keys can still create repeated suggestion/manual Moves.
- selected candidate uniqueness is procedural, not constrained; `next_move_candidates_selected_idx` is a non-unique index, so concurrent selections are not protected by a database invariant.
- no DB-backed test proves duplicate command replay against the real tables.

### `PERSISTENCE-CRITIQUE-F5`: new focus move kinds are migrated, but still not used by live commands

`PASS WITH ROUTE GAP`

The current workspace schema, payload code, and migration set include `next_move_recomputed` and `autopilot_focus_started`.

Evidence:

- `packages/brain/src/db/schema.ts:94`
- `packages/brain/src/db/schema.ts:96`
- `packages/brain/src/move-payloads.ts:428`
- `packages/brain/src/move-payloads.ts:430`
- `drizzle/0020_freezing_baron_strucker.sql:1`
- `drizzle/0020_freezing_baron_strucker.sql:2`

Impact: enum persistence is no longer the blocker. The remaining gap is command wiring: live tick/manual routes still do not create those newer Moves.

### `PERSISTENCE-CRITIQUE-F6`: focused verification is green

`PASS`

Focused persistence, route, schema, service, and typecheck verification pass on current `HEAD`.

Verification results:

- `PASS`: `pnpm exec tsx --test packages/brain/src/domain-repository.test.ts packages/brain/src/thinking-mode-service.test.ts packages/brain/src/thinking-mode-routes.test.ts` -> 17 passing tests.
- `PASS`: `pnpm exec tsx --test packages/brain/src/db-schema.test.ts packages/brain/src/autopilot-route.test.ts packages/brain/src/autopilot-core.test.ts` -> 16 passing tests.
- `PASS`: `pnpm typecheck`.

Impact: current focused verification supports proceeding. The remaining gaps are DB-backed duplicate/read-only coverage and legacy-route cleanup.

## Criterion Judgments

1. Is state backend-owned?  
   `PASS` for `PERSISTENCE-CRITIQUE`. Canonical graph state remains in backend rows, and the new service/API route uses backend-owned focus/candidate rows.

2. Are GET routes/read methods mutation-free?  
   `PASS WITH DB TEST GAP` for `PERSISTENCE-CRITIQUE`. Repository read tests assert no insert/update calls, GET graph/moves routes are read-oriented, `GET /autopilot/tick` rejects before persistence, and the new state route has route-level tests. The DB-backed all-GET mutation-count test is still TODO in `test/brain/thinkingModeService.test.ts`.

3. Are duplicates prevented?  
   `PASS WITH GAPS` for `PERSISTENCE-CRITIQUE`. Candidate/focus uniqueness exists, and command idempotency exists when keys are supplied. Optional idempotency and non-unique selected-candidate state remain gaps.

4. Does FocusState support resume?  
   `PASS` for `PERSISTENCE-CRITIQUE`. The service writes and reads FocusState for resume semantics, and route tests cover the exposed state/tick/start/manual path.

5. Does manual override have a durable place to go?  
   `PASS WITH LEGACY ROUTE RISK` for `PERSISTENCE-CRITIQUE`. `manual_node_selected` is a durable Move and the service persists `focus_states.manualMoveId`; the old manual override route does not persist FocusState.

6. Are candidates explainable later?  
   `PASS WITH LEGACY ROUTE RISK` for `PERSISTENCE-CRITIQUE`. Candidate rows are explainable and service tick persists them; committed legacy tick does not.

## Required Debugger Guidance

1. Ensure the demo/frontend uses the new `/api/brains/:brainId/autopilot/*` routes, or map the existing `/autopilot/*` paths onto `ThinkingModeService`.
2. Keep `drizzle/0020_freezing_baron_strucker.sql` with the schema/payload changes so `next_move_recomputed` and `autopilot_focus_started` remain persistable.
3. Make accepted "Go there" durable through `autopilot_focus_started` and `FocusState(source="autopilot_started", paused=false)`.
4. Persist manual override through both `manual_node_selected` and `FocusState(source="manual_selection", manualMoveId=..., paused=true)`.
5. Add DB-backed idempotency/duplicate tests for repeated tick and manual-select commands.
6. Add a DB-backed GET non-mutation test that records Move, ClaimVersion, Edge, Artifact, FocusState, and NextMoveCandidate counts before and after read routes.
7. Keep full typecheck in the gate after future route/frontend wiring changes.
