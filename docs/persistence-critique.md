# Persistence Critique

Artifact ID: `PERSISTENCE-CRITIQUE`  
Date: 2026-04-29  
Role: CRITIC  
Status: `BLOCKED FOR DEMO INTEGRATION`

## Scope

Reviewed persistence-related implementation and tests in the current workspace:

- `packages/brain/src/db/schema.ts`
- `drizzle/0019_sweet_ezekiel_stane.sql`
- `drizzle/0020_freezing_baron_strucker.sql`
- `packages/brain/src/domain/repository.ts`
- `packages/brain/src/domain-repository.test.ts`
- `packages/brain/src/autopilot-route.ts`
- `packages/brain/src/autopilot-route.test.ts`
- `packages/brain/src/autopilot-core.ts`
- `packages/brain/src/move-payloads.ts`
- `test/brain/thinkingModeService.test.ts`
- `docs/thinking-mode-autopilot-spec.md`
- `docs/move-taxonomy.md`

Existing uncommitted implementation changes were treated as the review target and left untouched. During review, `origin/main` advanced to `f318f21` with the focus move-kind migration; this critique reflects that current `HEAD`.

## Findings

### `PERSISTENCE-CRITIQUE-F1`: live Autopilot does not use the new persistence model

`FAIL`

The repository layer has `focus_states` and `next_move_candidates`, but the live `/autopilot/tick` path still loads state through `autopilot-route.ts`, ranks with `autopilot-core.ts`, and persists only an `autopilot_suggested` Move.

Evidence:

- `packages/brain/src/domain/repository.ts:125` reads `focusStates` and `nextMoveCandidates`.
- `packages/brain/src/domain/repository.ts:145` persists candidate rows with reason, score breakdown, provenance, graph hash, and fingerprint.
- `packages/brain/src/autopilot-route.ts:239` ranks through the older `rankAutopilotMoves` path.
- `packages/brain/src/autopilot-route.ts:257` creates only `autopilot_suggested`; it does not persist `next_move_recomputed`, `autopilot_focus_suggested`, `autopilot_focus_started`, `focus_states`, or `next_move_candidates`.

Impact: the demo can show a persisted suggestion Move, but it cannot yet prove durable FocusState resume, durable candidate explainability, or the new pure-engine candidate persistence in the actual command path.

### `PERSISTENCE-CRITIQUE-F2`: FocusState supports resume structurally, not operationally

`NOT VERIFIED`

The schema has the right durable shape: `focusedClaimId`, `focusedEdgeId`, `source`, `suggestionMoveId`, `manualMoveId`, `paused`, `reason`, and `updatedAt`.

Evidence:

- `packages/brain/src/db/schema.ts:289` defines `focus_states`.
- `packages/brain/src/db/schema.ts:300` links suggestion and manual moves.
- `packages/brain/src/domain/repository.ts:240` upserts the row by `sessionId`.

But the live manual-selection route returns a pause object without writing `focus_states`, and tick resume is still inferred from latest `manual_node_selected` versus latest `autopilot_suggested` Move.

Evidence:

- `packages/brain/src/autopilot-route.ts:226` derives pause from Moves.
- `packages/brain/src/autopilot-route.ts:298` creates `manual_node_selected`.
- `packages/brain/src/autopilot-route.ts:313` returns pause state, with no FocusState write.

Impact: backend-owned resume state is designed, but not proven in the user-facing loop.

### `PERSISTENCE-CRITIQUE-F3`: candidate rows are explainable, but the live tick audit is too thin

`FAIL`

The candidate table is strong for later explanation: it stores `reason`, `reasonCodes`, `exitCriteria`, `scoreBreakdown`, `provenance`, `graphHash`, and `fingerprint`.

Evidence:

- `packages/brain/src/db/schema.ts:316`
- `packages/brain/src/db/schema.ts:335`
- `packages/brain/src/db/schema.ts:337`
- `packages/brain/src/db/schema.ts:338`
- `packages/brain/src/db/schema.ts:339`

However, live `POST /autopilot/tick` does not write that table. The current persisted `autopilot_suggested` payload stores only compact `candidateScores`, not full candidate rationale, exit criteria, score breakdown, or provenance for later replay.

Evidence:

- `packages/brain/src/autopilot-route.ts:258`
- `packages/brain/src/move-payloads.ts:196`
- `packages/brain/src/move-payloads.ts:207`

Impact: an investor-facing demo could explain the top card now, but later forensic explanation of "why did Penny rank this set this way?" is not durable on the live path.

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

Focused persistence, route, schema, and typecheck verification pass in the current workspace.

Verification results:

- `PASS`: `pnpm exec tsx --test packages/brain/src/domain-repository.test.ts` -> 7 passing tests.
- `PASS`: `pnpm exec tsx --test packages/brain/src/db-schema.test.ts packages/brain/src/autopilot-route.test.ts packages/brain/src/autopilot-core.test.ts` -> 16 passing tests.
- `PASS`: `pnpm typecheck`.

Impact: verification supports the storage primitives. It does not clear the live-command integration gaps above.

## Criterion Judgments

1. Is state backend-owned?  
   `PASS WITH INTEGRATION GAP` for `PERSISTENCE-CRITIQUE`. Canonical graph state remains in backend rows, and the new focus/candidate tables are backend-owned. The live route still bypasses those new rows.

2. Are GET routes/read methods mutation-free?  
   `PASS WITH TEST GAP` for `PERSISTENCE-CRITIQUE`. Repository read tests assert no insert/update calls, GET graph/moves routes are read-oriented, and `GET /autopilot/tick` rejects before persistence. The DB-backed all-GET mutation-count test is still TODO in `test/brain/thinkingModeService.test.ts`.

3. Are duplicates prevented?  
   `PASS WITH GAPS` for `PERSISTENCE-CRITIQUE`. Candidate/focus uniqueness exists, and command idempotency exists when keys are supplied. Optional idempotency and non-unique selected-candidate state remain gaps.

4. Does FocusState support resume?  
   `NOT VERIFIED` for `PERSISTENCE-CRITIQUE`. The row shape supports resume, but the live tick/manual override path does not write or read it.

5. Does manual override have a durable place to go?  
   `PASS WITH FOCUSSTATE GAP` for `PERSISTENCE-CRITIQUE`. `manual_node_selected` is a durable Move and `focus_states.manualMoveId` exists, but the live manual override route does not persist FocusState.

6. Are candidates explainable later?  
   `FAIL ON LIVE PATH` for `PERSISTENCE-CRITIQUE`. Candidate rows are explainable, but live tick does not persist them or a full `next_move_recomputed` audit.

## Required Debugger Guidance

1. Wire `POST /autopilot/tick` to the pure next-move engine and `DrizzleBrainRepository` so the live command persists recomputation, candidate rows, selected candidate, and FocusState.
2. Keep `drizzle/0020_freezing_baron_strucker.sql` with the schema/payload changes so `next_move_recomputed` and `autopilot_focus_started` remain persistable.
3. Make accepted "Go there" durable through `autopilot_focus_started` and `FocusState(source="autopilot_started", paused=false)`.
4. Persist manual override through both `manual_node_selected` and `FocusState(source="manual_selection", manualMoveId=..., paused=true)`.
5. Add a DB-backed idempotency/duplicate test for repeated tick and manual-select commands.
6. Add a DB-backed GET non-mutation test that records Move, ClaimVersion, Edge, Artifact, FocusState, and NextMoveCandidate counts before and after read routes.
7. Keep full typecheck in the gate after wiring the live command path to the new repository.
