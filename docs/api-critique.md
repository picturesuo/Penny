# API Critique

Artifact ID: `API-CRITIQUE`
Date: 2026-04-29
Role: CRITIC
Status: `RESOLVED FOR FRONTEND/SMOKE ALIGNMENT`

## Scope

Reviewed API output, route wiring, frontend consumption, and the smoke script for the current Thinking Mode Autopilot slice:

- `packages/brain/src/services/thinking-mode-service.ts`
- `packages/brain/src/routes/thinking-mode-routes.ts`
- `packages/brain/src/server.ts`
- `packages/brain/src/autopilot-route.ts`
- `packages/brain/frontend/src/api/brainClient.ts`
- `packages/brain/frontend/src/types/brain.ts`
- `packages/brain/frontend/src/App.tsx`
- `packages/brain/frontend/src/components/CurrentExploration.tsx`
- `packages/brain/frontend/src/components/ThoughtMap.tsx`
- `packages/brain/src/thinking-mode-service.test.ts`
- `packages/brain/src/thinking-mode-routes.test.ts`
- `scripts/smoke-thinking-mode.sh`

## Current Resolution

The original findings below are preserved as the state of the API/frontend/smoke review when this critique was written. Current `origin/main` resolves the active frontend and smoke blockers for this artifact.

Criterion judgments for `API-CRITIQUE`:

- `PASS` F1: the frontend now adapts session-scoped Thinking Mode responses into the existing UI shape, including `selectedCandidate.reason`, action labels, exit criteria, and accepted Move kinds.
- `PASS` F4: the active demo path uses the session-scoped Thinking Mode routes for tick, accepted focus, manual focus, and cockpit refresh; legacy `/autopilot/*` routes remain compatibility-only risk, not active product proof.
- `PASS` F5: the smoke script now covers `GET /api/brains/:brainId/autopilot/state` and verifies repeated GETs do not append Moves.
- `PASS` F6: `scripts/smoke-thinking-mode.sh` now runs the full Thinking Mode happy path, including seed, state read, tick, candidate start, manual focus, challenge issue/respond, and Challenge Brief creation.
- `PASS WITH CLEANUP WATCH` F7: DTO richness remains justified; future cleanup should keep demos and docs off legacy route surfaces.

Verification after resolution:

- `pnpm test` -> `PASS`, 171 tests.
- `pnpm typecheck` -> `PASS`.
- `pnpm lint` -> `PASS`.
- `pnpm build:frontend` -> `PASS`.
- `bash -n scripts/smoke-thinking-mode.sh` -> `PASS`.
- `SMOKE_ISOLATED_DB=1 BASE_URL=http://localhost:3017 PORT=3017 ./scripts/smoke-thinking-mode.sh` -> `PASS`.

## Original Findings (Historical)

### `API-CRITIQUE-F1`: frontend cannot render the new Thinking Mode response without an adapter

`FAIL`

The new API returns a Thinking Mode contract: `focusState`, `candidates`, `selectedCandidate`, candidate `reason`, score breakdown, exit criteria, provenance, and Moves. That is enough raw material for a Thinking Mode UI to render focus, candidate list, and rationale when combined with a graph slice.

Evidence:

- `packages/brain/src/services/thinking-mode-service.ts:39` defines `ThinkingModeStateResponse` with `focusState`, `candidates`, and `selectedCandidate`.
- `packages/brain/src/services/thinking-mode-service.ts:55` adds `graphHash`, `persistedMoveIds`, and `move` to tick responses.
- `packages/brain/src/services/thinking-mode-service.ts:346` maps candidate details including `reason`, `reasonCodes`, `exitCriteria`, `scoreBreakdown`, and `provenance`.

The committed frontend is still typed and wired to the legacy response shape. It calls `/autopilot/tick`, expects `data.suggestion`, and renders `suggestion.label` plus `suggestion.why`. The new route returns `selectedCandidate.reason`, not `suggestion.why`, so pointing the current frontend at `/api/brains/:brainId/autopilot/tick` would not render the Autopilot card or suggested target without mapping.

Evidence:

- `packages/brain/frontend/src/api/brainClient.ts:40` posts to `/autopilot/tick`.
- `packages/brain/frontend/src/types/brain.ts:95` defines `AutopilotTickData.suggestion`.
- `packages/brain/frontend/src/types/brain.ts:85` expects `AutopilotSuggestion.why`.
- `packages/brain/frontend/src/App.tsx:21` derives the suggested claim from `autopilot?.suggestion?.targetClaimId`.
- `packages/brain/frontend/src/components/CurrentExploration.tsx:42` renders `autopilotSuggestion.label`.
- `packages/brain/frontend/src/components/CurrentExploration.tsx:43` renders `autopilotSuggestion.why`.

Impact: the backend API can support the intended UI, but the demo currently proves the legacy route, not the new Thinking Mode persistence/output contract. A small adapter or frontend type migration is required before the demo can honestly show the new API.

### `API-CRITIQUE-F2`: "why this?" exists, but not under the frontend's current field name

`PASS WITH FRONTEND GAP`

The API exposes a human-readable reason and machine-checkable rationale. Each candidate includes `reason`, `reasonCodes`, `exitCriteria`, `scoreBreakdown`, `graphHash`, and `provenance`. Tick Moves also store a compact candidate rationale payload, so the explanation can be audited later.

Evidence:

- `packages/brain/src/services/thinking-mode-service.ts:21` includes candidate `reason`.
- `packages/brain/src/services/thinking-mode-service.ts:22` includes `reasonCodes`.
- `packages/brain/src/services/thinking-mode-service.ts:23` includes `exitCriteria`.
- `packages/brain/src/services/thinking-mode-service.ts:24` includes `scoreBreakdown`.
- `packages/brain/src/services/thinking-mode-service.ts:26` includes `provenance`.
- `packages/brain/src/services/thinking-mode-service.ts:325` stores candidate rationale in the `next_move_recomputed` Move payload.

The naming mismatch is the risk: the frontend renders `why`, while the new API field is `reason`. This is not product bloat, but it is a demo integration blocker.

### `API-CRITIQUE-F3`: manual override is respected by the API, not by the current new-API demo path

`PASS IN API, FAIL IN FRONTEND INTEGRATION`

The new service creates durable manual signal. `manualFocus` validates that the claim belongs to the session, creates a `manual_node_selected` Move, upserts FocusState with `source: "manual_selection"`, stores the manual move id, and pauses Autopilot.

Evidence:

- `packages/brain/src/services/thinking-mode-service.ts:234` starts `manualFocus`.
- `packages/brain/src/services/thinking-mode-service.ts:241` rejects a claim from a different session.
- `packages/brain/src/services/thinking-mode-service.ts:250` creates `manual_node_selected`.
- `packages/brain/src/services/thinking-mode-service.ts:264` upserts FocusState.
- `packages/brain/src/services/thinking-mode-service.ts:269` sets `source: "manual_selection"`.
- `packages/brain/src/services/thinking-mode-service.ts:271` stores `manualMoveId`.
- `packages/brain/src/services/thinking-mode-service.ts:272` sets `paused: true`.
- `packages/brain/src/thinking-mode-service.test.ts:52` covers manual focus creating a pause.

The current frontend manual selection still calls the legacy `/autopilot/select-node` route. That route does create a `manual_node_selected` Move and returns pause state, but it does not exercise the new `focus_states` path. Also, "Go there" is currently local-only and does not call `POST /api/next-move-candidates/:candidateId/start`, so the accepted Autopilot focus Move is not created in the demo.

Evidence:

- `packages/brain/frontend/src/api/brainClient.ts:56` defines `selectAutopilotNode`.
- `packages/brain/frontend/src/api/brainClient.ts:61` posts to `/autopilot/select-node`.
- `packages/brain/frontend/src/App.tsx:62` handles "Go there" locally.
- `packages/brain/frontend/src/App.tsx:66` only calls `setFocusedClaimId`.
- `packages/brain/src/services/thinking-mode-service.ts:184` provides `startCandidate`.
- `packages/brain/src/services/thinking-mode-service.ts:193` creates `autopilot_focus_started`.

Impact: manual override exists as backend-owned signal, but the current demo does not yet prove the new Thinking Mode manual-focus route or accepted-suggestion route.

### `API-CRITIQUE-F4`: route names are mostly clear, but split route families create ambiguity

`PASS WITH NAMING RISK`

The new brain-scoped routes are clear enough for product intent:

- `GET /api/brains/:brainId/autopilot/state`
- `POST /api/brains/:brainId/autopilot/tick`
- `POST /api/brains/:brainId/focus/manual`

Evidence:

- `packages/brain/src/server.ts:47` wires the new state route.
- `packages/brain/src/server.ts:61` wires the new tick route.
- `packages/brain/src/server.ts:92` wires manual focus.
- `packages/brain/src/routes/thinking-mode-routes.ts:58` handles state.
- `packages/brain/src/routes/thinking-mode-routes.ts:89` handles tick.
- `packages/brain/src/routes/thinking-mode-routes.ts:167` handles manual focus.

The less clear route is `POST /api/next-move-candidates/:candidateId/start`: it is not brain-scoped, but it requires `brainId` and `sessionId` in the body. That is workable, yet awkward beside the brain-scoped routes.

Evidence:

- `packages/brain/src/server.ts:75` wires `/api/next-move-candidates/:candidateId/start`.
- `packages/brain/src/routes/thinking-mode-routes.ts:27` requires `brainId` and `sessionId` in the body for that route.
- `packages/brain/src/routes/thinking-mode-routes.ts:128` handles candidate start.

The larger risk is that the legacy `/autopilot/*` routes remain live and are still used by the frontend and smoke script. That makes it easy for a demo to show "Autopilot" while bypassing the new Thinking Mode state model.

Evidence:

- `packages/brain/src/server.ts:37` still wires `/autopilot/tick`.
- `packages/brain/src/server.ts:42` still wires `/autopilot/select-node`.
- `packages/brain/frontend/src/api/brainClient.ts:41` calls `/autopilot/tick`.
- `packages/brain/frontend/src/api/brainClient.ts:61` calls `/autopilot/select-node`.

### `API-CRITIQUE-F5`: read routes look mutation-free; smoke does not prove the new read route

`PASS WITH SMOKE GAP`

The new state read path is designed as a read-only GET. The route rejects non-GET methods before service calls, and `ThinkingModeService.getState` only calls `repository.getAutopilotState`.

Evidence:

- `packages/brain/src/routes/thinking-mode-routes.ts:63` rejects non-GET state requests.
- `packages/brain/src/routes/thinking-mode-routes.ts:83` calls only `service.getState` for valid GET state requests.
- `packages/brain/src/services/thinking-mode-service.ts:118` starts `getState`.
- `packages/brain/src/services/thinking-mode-service.ts:119` calls `repository.getAutopilotState`.
- `packages/brain/src/thinking-mode-routes.test.ts:17` asserts GET state calls only `getState`.
- `packages/brain/src/thinking-mode-service.test.ts:10` asserts service GET state records zero writes.

The smoke script does not cover this route. It only checks legacy route guards and one invalid legacy tick request.

Evidence:

- `scripts/smoke-thinking-mode.sh:53` checks `/`.
- `scripts/smoke-thinking-mode.sh:54` checks `GET /brain/seed`.
- `scripts/smoke-thinking-mode.sh:55` checks `GET /autopilot/tick`.
- `scripts/smoke-thinking-mode.sh:56` checks invalid `POST /autopilot/tick`.

Impact: code-level verification passes for read-only behavior, but the smoke script can give a false sense of coverage because it never touches the new Thinking Mode GET state endpoint.

### `API-CRITIQUE-F6`: smoke script is stale for Wave 4

`FAIL`

The smoke script is syntactically valid, but it does not smoke the API output being reviewed in this wave. It probes the legacy `/autopilot/tick` route and explicitly defers the happy path. It does not validate:

- `GET /api/brains/:brainId/autopilot/state`
- `POST /api/brains/:brainId/autopilot/tick`
- `POST /api/next-move-candidates/:candidateId/start`
- `POST /api/brains/:brainId/focus/manual`
- candidate `reason` / "why this?"
- `focusState`
- `selectedCandidate`
- manual pause/resume behavior

Evidence:

- `scripts/smoke-thinking-mode.sh:55` checks only legacy `GET /autopilot/tick`.
- `scripts/smoke-thinking-mode.sh:56` checks only invalid legacy `POST /autopilot/tick`.
- `scripts/smoke-thinking-mode.sh:62` states the full happy path is deferred.
- `scripts/smoke-thinking-mode.sh:65` lists the desired flow but does not exercise it.

Impact: the script is useful as a minimal route guard check, but not as a Thinking Mode API smoke test. It should either be renamed as a legacy non-mutation guard or updated to cover the new `/api/brains/:brainId/...` contract.

### `API-CRITIQUE-F7`: API output is rich, not product bloat

`PASS WITH CLEANUP RISK`

The new output fields are justified by the product direction. Candidates need reasons, score breakdowns, provenance, graph hashes, selected state, and exit criteria so Penny can explain "why this?", resume focus, audit scoring, and avoid becoming a generic chat wrapper.

Evidence:

- `packages/brain/src/services/thinking-mode-service.ts:11` defines the candidate DTO rather than returning plain text.
- `packages/brain/src/services/thinking-mode-service.ts:39` returns backend-owned FocusState with candidates.
- `packages/brain/src/services/thinking-mode-service.ts:68` returns accepted focus state and Move for start.
- `packages/brain/src/services/thinking-mode-service.ts:85` returns manual focus state, focus claim, and Move.

The cleanup risk is not the richness of the new DTO. It is duplicate product surfaces: legacy `/autopilot/*` output, new `/api/brains/:brainId/autopilot/*` output, and frontend types bound to the older shape. That duplication is the only overbuilt part I found.

## Original Criteria Judgment (Historical)

1. Can frontend render everything from responses?
   `FAIL` for `API-CRITIQUE`: the new API has the necessary Thinking Mode fields, but the current frontend consumes the legacy `suggestion.why` shape and is not wired to the new route. The new Autopilot state response also assumes the graph slice is available elsewhere for target claim text.

2. Does "why this?" exist?
   `PASS WITH FRONTEND GAP` for `API-CRITIQUE`: backend candidates expose `reason`, `reasonCodes`, `scoreBreakdown`, `exitCriteria`, and `provenance`; frontend expects `why`.

3. Is manual override respected?
   `PASS IN API, FAIL IN FRONTEND INTEGRATION` for `API-CRITIQUE`: the new service records `manual_node_selected` and paused FocusState, but the demo still calls the legacy manual route and "Go there" does not call candidate start.

4. Are route names clear?
   `PASS WITH NAMING RISK` for `API-CRITIQUE`: brain-scoped routes are clear; candidate start is awkwardly unscoped; legacy and new route families coexist.

5. Are there accidental mutations on read?
   `PASS WITH SMOKE GAP` for `API-CRITIQUE`: route/service tests show the new GET state path is read-only; the smoke script does not cover it.

6. Is anything overbuilt?
   `PASS WITH CLEANUP RISK` for `API-CRITIQUE`: the DTO richness is necessary for a controllable thinking instrument; the duplicated legacy/new route surfaces are the bloat.

## Original Verification (Historical)

- `PASS`: `pnpm exec tsx --test packages/brain/src/thinking-mode-service.test.ts packages/brain/src/thinking-mode-routes.test.ts`
- `PASS`: `pnpm typecheck`
- `PASS`: `bash -n scripts/smoke-thinking-mode.sh`
- `NOT VERIFIED`: runtime smoke against a live API server and database-backed happy path. The existing script intentionally does not run the new Thinking Mode happy path.

## Resolved Debugger Guidance

Current status: items 1-4 are resolved on `origin/main`. Item 5 remains a cleanup watch: legacy routes should stay off demo/product-proof paths unless explicitly documented as compatibility-only.

1. Wire the frontend to the new Thinking Mode routes or add an explicit adapter from `selectedCandidate.reason` to the current card shape before using this in a demo.
2. Make "Go there" call `POST /api/next-move-candidates/:candidateId/start` so accepted Autopilot focus creates `autopilot_focus_started`.
3. Make manual node selection call `POST /api/brains/:brainId/focus/manual` so manual override writes FocusState, not only legacy pause payload.
4. Update `scripts/smoke-thinking-mode.sh` to cover the new API contract, or rename it so it is not mistaken for a Thinking Mode smoke.
5. Either retire the legacy `/autopilot/*` route family or document it as compatibility-only and keep the demo off it.
