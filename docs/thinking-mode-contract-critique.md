# Thinking Mode Contract Critique

Status: Current implementation re-review: `BACKEND/CONTRACT PASS, FRONTEND API PASS, FRONTEND PRODUCT PROOF BLOCKED`
Artifact ID: `THINKING-MODE-CONTRACT-CRITIQUE`
Review date: 2026-04-29

This update keeps the original Wave 1 contract review below as historical context. The current judgment is based on the implemented Thinking Mode backend path, the still-active frontend/demo path, the contract docs, the YC fixture, and focused verification commands.

## Contract-Only Re-Check

Status: `PASS WITH SCOPE GUARD`
Artifact ID: `THINKING-MODE-CONTRACT-CRITIQUE`
Review date: 2026-04-29
Scope: contract artifacts only: Autopilot spec, move taxonomy, demo script, YC fixture contract states, and this critique file.

Criterion judgments:

- `PASS` `THINKING-MODE-CONTRACT-CRITIQUE-C1`: the contract does not authorize the frontend to invent canonical state. It says backend graph rows are canonical, the frontend renders returned graph/focus/candidate/challenge/artifact slices, and frontend state may only cache display state.
- `PASS` `THINKING-MODE-CONTRACT-CRITIQUE-C2`: accepted focus is Move-backed in the contract. "Go there" records `autopilot_focus_started`; the demo script lists that backend receipt; the fixture includes an `acceptedFocus.move` with candidate/action/target refs and `FocusState.source = "autopilot_started"`.
- `PASS` `THINKING-MODE-CONTRACT-CRITIQUE-C3`: manual focus is Move-backed in the contract. Manual selection records `manual_node_selected`, pauses Autopilot, carries `pauseAutopilot: true`, and the fixture includes paused `manual_selection` FocusState with `manualMoveId` and a prior ranking Move link.
- `PASS WITH SCOPE RISK` `THINKING-MODE-CONTRACT-CRITIQUE-C4`: the contract is acceptable as an umbrella first-loop contract, but it is too broad if treated as one implementation ticket. The next implementation should stay narrow: visible frontend accepted focus and manual focus must call the new Thinking Mode command routes and refresh move history.

Finding:

- `THINKING-MODE-CONTRACT-CRITIQUE-CF1`: No contract-level blocker remains for state ownership or Move-backed focus. The remaining blocker is execution scope: do not expand into Challenge Brief, Learn, MCP, generic chat, or broad UI redesign while fixing the frontend focus contract.

## Backend Cockpit Adapter Review

Status: `PASS WITH ADAPTER SCOPE GUARD`
Artifact ID: `THINKING-MODE-CONTRACT-CRITIQUE`
Review date: 2026-04-29
Scope: `packages/brain/src/routes/session-cockpit-routes.ts`, `packages/brain/src/server.ts`, and `packages/brain/src/session-cockpit-routes.test.ts`.

Criterion judgments:

- `PASS WITH ROUTE-SURFACE RISK` `THINKING-MODE-CONTRACT-CRITIQUE-C5`: Backend did not duplicate Thinking Mode business logic. The session cockpit service delegates graph state to `loadSessionGraph` and Autopilot writes to `ThinkingModeService`; the new code only adapts session-scoped route inputs, composes DTO fields, and selects existing active challenge/latest artifact rows. The risk is route-surface duplication, not duplicated domain behavior: keep scoring, Move creation, challenge responses, artifact synthesis, and focus persistence out of this adapter.
- `PASS` `THINKING-MODE-CONTRACT-CRITIQUE-C6`: the cockpit DTO is frontend-shaped but backend-owned. `SessionCockpitPayload` intentionally groups graph, moves, lens, Autopilot, active challenge, latest artifact, and meta for the cockpit, but the shape is built on the backend from canonical backend projections and rows.
- `PASS` `THINKING-MODE-CONTRACT-CRITIQUE-C7`: this did not create a second source of truth. The adapter adds no new table, cache, persisted cockpit store, or frontend-owned graph state. `activeChallenge` and `latestArtifact` are read projections over existing rows, and accepted focus/manual focus still write through `ThinkingModeService` as `autopilot_focus_started` and `manual_node_selected`.
- `NOT VERIFIED` `THINKING-MODE-CONTRACT-CRITIQUE-C8`: full-repo typecheck is currently blocked by unrelated dirty frontend changes and an optional `pause` typing mismatch in `packages/brain/frontend/src/App.tsx`. Focused cockpit route tests pass.

Verification commands run:

- `pnpm exec tsx --test packages/brain/src/session-cockpit-routes.test.ts packages/brain/src/thinking-mode-routes.test.ts` -> `PASS`, 18 tests.
- `pnpm typecheck` -> `FAIL` outside this adapter review scope: `packages/brain/frontend/src/App.tsx` rejects an optional `pause` value under `exactOptionalPropertyTypes`.

Finding:

- `THINKING-MODE-CONTRACT-CRITIQUE-CF2`: No backend cockpit blocker found. The guard is architectural: keep `buildSessionCockpitPayload`, `loadActiveChallenge`, and `loadLatestArtifact` as read-only DTO composition helpers, and do not let the session-scoped aliases become a parallel Thinking Mode implementation.

## Frontend Thinking Mode API Review

Status: `API PASS; PRODUCT PROOF BLOCKED`
Artifact ID: `THINKING-MODE-CONTRACT-CRITIQUE`
Review date: 2026-04-29
Scope: frontend commit `e13099e` (`Wire frontend to session cockpit`): `packages/brain/frontend/src/App.tsx`, `packages/brain/frontend/src/api/brainClient.ts`, `packages/brain/frontend/src/types/brain.ts`, `packages/brain/frontend/test/brainClient.test.ts`, and visible placeholder components.

Criterion judgments:

- `PASS WITH TEST-SCRIPT RISK` `THINKING-MODE-CONTRACT-CRITIQUE-C9`: frontend source now uses the new Thinking Mode/session cockpit API path instead of legacy Autopilot. `tickAutopilot` calls `POST /api/sessions/:sessionId/autopilot/tick`, accepted focus calls `POST /api/sessions/:sessionId/next-move-candidates/:candidateId/start`, manual focus calls `POST /api/sessions/:sessionId/focus/manual`, and refresh uses `GET /api/sessions/:sessionId/cockpit`. `handleGoThere` now starts a candidate and refreshes cockpit state instead of only setting local focus. Test-script risk: the focused frontend client test is tracked, but it is outside the default `pnpm test` package script.
- `FAIL` `THINKING-MODE-CONTRACT-CRITIQUE-C10`: old placeholder paths still mask missing backend state. `CurrentExploration` still falls back to `placeholderPaths`, `InsightRail` renders `"Placeholder"` values and `placeholderMoves`, and `ThoughtMap` renders a placeholder tree when backend graph state is empty. `mergeCockpitData` also preserves prior seed-only fields such as exploration paths when cockpit does not return them, which can make absent backend state look intentionally populated.
- `PASS WITH UI COPY RISK` `THINKING-MODE-CONTRACT-CRITIQUE-C11`: the UI now displays the selected candidate's thinking action label and rationale from backend state, and the button starts the Move-backed candidate. The primary control still says `Go there`, and the normalized UI model does not expose exit criteria or expected Move kinds, so the visible interaction still reads partly like navigation rather than a concrete "start challenge / verify / learn" thinking action.
- `NOT VERIFIED` `THINKING-MODE-CONTRACT-CRITIQUE-C12`: live browser proof against a running API/database was not rerun in this critic pass. The source, frontend build, focused client test, and backend route tests were verified locally.

Verification commands run:

- `pnpm exec tsx --test packages/brain/frontend/test/brainClient.test.ts` -> `PASS`, 2 tests.
- `pnpm exec tsx --test packages/brain/src/session-cockpit-routes.test.ts packages/brain/src/thinking-mode-routes.test.ts` -> `PASS`, 18 tests.
- `pnpm typecheck` -> `PASS`.
- `pnpm build:frontend` -> `PASS`; generated public asset changes were reverted because this critic pass does not own build output.

Finding:

- `THINKING-MODE-CONTRACT-CRITIQUE-CF3`: Frontend API wiring is no longer the blocker. The remaining blocker is visible product proof: remove placeholder fallbacks from backend-owned regions or render explicit empty/error states, and change accepted-focus copy/data to expose the actual next thinking action and exit criteria instead of making `Go there` the dominant affordance.

## Current Verification Summary

Criterion judgments for `THINKING-MODE-CONTRACT-CRITIQUE`:

- `PASS` SC1: the active backend scorer in `packages/brain/src/domain/engine.ts` is deterministic, database-free, provider-free, and returns ranked candidates with rationale, exit criteria, score breakdown, stable fingerprint, and graph hash.
- `PASS` SC2 for the new API path: `POST /api/brains/:brainId/autopilot/tick` validates input, rejects non-POST methods, loads canonical graph state, persists next-move candidates, records `next_move_recomputed`, updates suggestion FocusState, and does not mutate claim text or confidence.
- `PASS` SC3 for the new API path: `POST /api/brains/:brainId/focus/manual` validates input, records `manual_node_selected`, persists `manual_selection` FocusState, pauses Autopilot, and returns the selected focus.
- `PASS` SC4: current challenge response tests cover Defend, Revise, Absorb, `focus_completed`, and old ClaimVersion preservation on Revise.
- `PASS` SC5: focused Thinking Mode tests, full package tests, pure-engine skeleton tests, `pnpm typecheck`, and `pnpm lint` pass.
- `NOT VERIFIED` SC6 as a global repo-cleanliness criterion: reviewed implementation commits are already on `origin/main`, but the current working tree contains unrelated public asset changes outside this critique.

Verification commands run:

- `pnpm exec tsx --test packages/brain/src/domain-engine.test.ts packages/brain/src/thinking-mode-service.test.ts packages/brain/src/thinking-mode-routes.test.ts packages/brain/src/challenge-service.test.ts packages/brain/src/challenge-brief-service.test.ts packages/brain/src/domain-repository.test.ts packages/brain/src/db-schema.test.ts` -> `PASS`, 43 tests.
- `pnpm exec tsx --test packages/brain/src/autopilot-core.test.ts packages/brain/src/autopilot-route.test.ts test/brain/nextMoveEngine.test.ts test/brain/thinkingModeService.test.ts test/brain/challengeRespond.test.ts` -> `PASS`, but 8 files in `test/brain/*` remain TODO skeleton checks and should not be treated as implementation proof.
- `pnpm test` -> `PASS`, 161 tests.
- `pnpm typecheck` -> `PASS`.
- `pnpm lint` -> `PASS`.
- After follow-up action-alignment commits landed on `origin/main`, `pnpm exec tsx --test test/brain/nextMoveEngine.test.ts packages/brain/src/domain-engine.test.ts` -> `PASS`, 14 tests.
- After follow-up demo-artifact commits landed on `origin/main`, the YC fixture was probed with `rankNextMoveCandidates` plus `buildTemplateChallenge`; it produced the exact willingness-to-pay challenge copy.
- `git diff --check -- docs/thinking-mode-contract-critique.md packages/brain/src/domain/engine.ts packages/brain/src/services/thinking-mode-service.ts packages/brain/src/routes/thinking-mode-routes.ts packages/brain/src/domain/repository.ts packages/brain/src/move-payloads.ts packages/brain/src/db/schema.ts` -> `PASS`.

## Current Findings

### `THINKING-MODE-CONTRACT-CRITIQUE-F1`: New Backend Path Satisfies The Core Loop

Judgment: `PASS`

The new backend API path now implements the controllable thinking loop instead of merely recommending a graph node. `ThinkingModeService.tick` ranks from a persisted graph snapshot, upserts durable `next_move_candidates`, selects a candidate, records `next_move_recomputed`, and stores `FocusState(source="autopilot_suggestion")`. `ThinkingModeService.startCandidate` records `autopilot_focus_started`, and `ThinkingModeService.manualFocus` records `manual_node_selected` with `pauseAutopilot: true` and persisted manual FocusState.

This resolves the original backend risks around deterministic ranking, manual override as signal, accepted focus as a Move, and POST-only mutation for the new `/api/brains/:brainId/*` surface.

### `THINKING-MODE-CONTRACT-CRITIQUE-F2`: The Active Frontend Still Bypasses The New Thinking Mode API

Judgment: `FAIL`

The React frontend still calls the legacy `/autopilot/tick` and `/autopilot/select-node` endpoints from `packages/brain/frontend/src/api/brainClient.ts`. It does not call `POST /api/brains/:brainId/autopilot/tick`, `POST /api/next-move-candidates/:candidateId/start`, or `POST /api/brains/:brainId/focus/manual`.

The `Go there` handler in `packages/brain/frontend/src/App.tsx` only sets local `focusedClaimId` and status text. It does not create `autopilot_focus_started`, does not update persisted `FocusState(source="autopilot_started")`, and does not fetch the move timeline afterward.

Impact: the backend implementation is correct, but the visible app can still collapse into next-node navigation during the accepted-suggestion moment. This directly reopens the original Section 1 and Section 4 contract risk for demo use.

Required fix:

- Make the frontend tick against the new `/api/brains/:brainId/autopilot/tick` response shape.
- Make `Go there` call `POST /api/next-move-candidates/:candidateId/start`.
- Make manual map selection call `POST /api/brains/:brainId/focus/manual`.
- Refresh moves after accepted focus as well as after manual selection.

### `THINKING-MODE-CONTRACT-CRITIQUE-F3`: Demo Artifact Vocabulary Now Matches The Implemented Vocabulary

Judgment: `PASS`

The implementation, Autopilot spec, move taxonomy, domain types, and pure engine are now aligned on the active action set: `resume_open_challenge`, `challenge`, `verify`, `clarify`, and `learn`. Candidate auditability is also now documented as `next_move_candidates` rows plus embedded candidate summaries in `next_move_recomputed`.

The demo-facing artifacts now match that contract: `docs/yc-demo-script.md` no longer narrates `autopilot_candidate_generated` or `autopilot_focus_suggested`, and `test/fixtures/penny-yc-demo-graph.json` now uses current candidate actions plus a `next_move_recomputed` ranking-audit payload.

Impact: this closes the original action-name and candidate-persistence contract drift for the backend/demo artifacts.

Remaining risk:

- The frontend still needs to call the new Thinking Mode route family before the visible demo proves the same contract.

### `THINKING-MODE-CONTRACT-CRITIQUE-F4`: The YC Fixture Now Carries The Willingness-To-Pay Demo Claim

Judgment: `PASS`

The demo script says the pressure point is `Pre-seed founders will pay for structured thinking before traction.` The YC fixture now uses that claim as the selected target.

I verified the current fixture by ranking it with `rankNextMoveCandidates` and passing the selected target into `buildTemplateChallenge`; it produces the exact sharper willingness-to-pay critique.

Impact: this closes the founder-specificity gap in the contract fixture. The remaining demo risk is the frontend path, not the fixture content.

Remaining risk:

- Add or keep a fixture-backed assertion that `buildTemplateChallenge` produces the exact willingness-to-pay critique on the selected candidate, not just on a manually constructed test input.

### `THINKING-MODE-CONTRACT-CRITIQUE-F5`: Backend Truth Mutation Boundaries Hold

Judgment: `PASS`

The reviewed backend path keeps Autopilot suggestions separate from truth mutation. Tick and focus start mutate candidate/focus rows and Moves only; they do not change claim text, confidence, edge truth, or artifacts. Challenge response behavior preserves the explicit Defend / Revise / Absorb split, and Revise preserves the old ClaimVersion before marking the new ClaimVersion current.

Remaining risk is integration-level, not core backend behavior: the frontend must stop using local-only accepted focus if the demo is meant to prove Move-backed Thinking Mode.

## Current Status

`PROCEED FOR BACKEND API AND CONTRACT ARTIFACTS; BLOCKED FOR FRONTEND DEMO`

The backend service, route, persistence, challenge response, Challenge Brief behavior, spec, move taxonomy, and fixture now meet the core artifact. The visible app still references legacy routes and local-only accepted focus, so the live demo does not yet prove Move-backed accepted focus.

---

Status: Resolved after DEBUGGER contract alignment  
Date: 2026-04-29  
Scope: contracts and fixture only; no implementation review

Reviewed:

- `docs/thinking-mode-autopilot-spec.md`
- `docs/move-taxonomy.md`
- `docs/yc-demo-script.md`
- `packages/brain/src/domain/types.ts`
- `test/fixtures/penny-yc-demo-graph.json`
- `test/brain/nextMoveEngine.test.ts`
- `test/brain/thinkingModeService.test.ts`
- `test/brain/challengeRespond.test.ts`

## 1. Does The Plan Build Thinking Mode, Not Next-Node Navigation?

Judgment: `PASS WITH CONTRACT RISK`

The plan is pointed at Thinking Mode. The spec defines a full loop: raw idea, claims, assumptions, thought map, ranked next thinking move, visible rationale, focus acceptance or manual override, challenge response, revision history, and Challenge Brief. The candidate model also includes `action`, `mode`, `evidence`, `blockedBy`, and `wouldCreateMoveKinds`, which is enough to make a suggestion about work, not merely which node to click next.

The risk is that `FocusState` is framed as navigation state and the demo language leans on "Go there." That is acceptable only if accepted focus is immediately tied to a thinking action and a Move. Otherwise this collapses into next-node navigation with a graph-shaped UI.

Required tightening before implementation:

- Align the accepted focus path around `autopilot_focus_started`.
- Make the selected candidate's next thinking action visible wherever "Go there" appears.
- Keep `wouldCreateMoveKinds` attached to each candidate in tests and demo assertions.

## 2. Does It Preserve Backend-Owned State?

Judgment: `PASS`

The contract repeatedly states that backend graph rows are canonical and the frontend renders returned graph, focus, candidate, challenge, and artifact state. `FocusState`, `NextMoveCandidate`, `AutopilotTickResult`, `ThinkingGraphSnapshot`, and the YC fixture all carry backend-owned IDs rather than frontend-invented labels.

This is the strongest part of the contract. It keeps Thinking Mode anchored in claims, claim versions, edges, moves, and artifacts rather than UI-local state.

Remaining risk:

- `expectedAutopilot.candidates` in the fixture is outside `moves`. That is fine as test expectation metadata, but the real persisted audit trail must put candidate details in `autopilot_candidate_generated` moves or inside a persisted `next_move_recomputed` payload.

## 3. Does Manual Override Become Signal?

Judgment: `PASS IN CONTRACT, NOT PROVEN BY FIXTURE`

The spec and taxonomy correctly define `manual_node_selected` as a Move with `pauseAutopilot: true`, optional reason, and `previousSuggestionMoveId`. The demo script also treats manual override as history Penny can learn from later, not as an escape hatch outside the system.

The YC fixture does not include a manual override state. It only represents the initial seed-to-suggestion snapshot. That is not fatal for an initial graph fixture, but it means the fixture does not prove manual override as signal.

Required tightening before implementation:

- Add a second fixture state or fixture patch for the post-manual-override moment.
- That fixture should include `manual_node_selected`, `pauseAutopilot: true`, `manualMoveId`, selected claim focus, and a link to the prior suggestion Move.

## 4. Does Every Meaningful Event Create A Move?

Judgment: `FAIL UNTIL CONTRACTS ALIGN`

The principle is correct, but the current contract set is internally inconsistent.

Findings:

- `docs/yc-demo-script.md` says Autopilot ranking should show `next_move_recomputed`, `autopilot_candidate_generated`, and `autopilot_focus_suggested`.
- `docs/move-taxonomy.md` lists `autopilot_candidate_generated` as a required Move kind and includes it in the expected first-loop order.
- `docs/thinking-mode-autopilot-spec.md` allows exposed candidates to be persisted either as `autopilot_candidate_generated` moves or as entries inside `next_move_recomputed`.
- `test/fixtures/penny-yc-demo-graph.json` includes `next_move_recomputed` and `autopilot_focus_suggested`, but no `autopilot_candidate_generated` move and no full candidate detail inside the `next_move_recomputed` move payload.

That leaves candidate auditability split across contract text, move taxonomy, and fixture expectation metadata. If implemented as-is, a candidate could be visible to the demo without being a first-class Move or embedded persisted audit record.

Additional mismatch:

- `docs/thinking-mode-autopilot-spec.md` says `wouldCreateMoveKind` singular.
- `packages/brain/src/domain/types.ts` uses `wouldCreateMoveKinds` plural.
- The fixture also uses `wouldCreateMoveKinds` plural.

Required tightening before implementation:

- Choose one candidate persistence rule:
  - individual `autopilot_candidate_generated` Moves, or
  - full embedded candidate records inside `next_move_recomputed`.
- Make the demo script, move taxonomy, domain type, fixture, and skeleton tests agree.
- Use `wouldCreateMoveKinds` everywhere if multiple downstream Moves are allowed.

## 5. Is The Demo Specific To Founders?

Judgment: `PASS WITH MARKET-SPECIFICITY GAP`

The demo is founder-specific in seed, claim text, assumptions, and narrative. The fixture includes founder adoption, generic AI chat comparison, ambiguous company decisions, and founder workflow as claims or labels. That is enough to avoid a generic productivity demo.

The gap is that the skeleton test says "willingness-to-pay assumption," but the fixture's primary market assumption is usage/adoption, not willingness to pay. For a YC demo, this difference matters. A founder adoption claim can still sound like generic engagement; willingness to pay or urgent founder workflow would make the demo sharper.

Required tightening before implementation:

- Either rename the skeleton test away from willingness-to-pay, or add a fixture claim about founders paying for structured thinking during high-stakes decisions.
- Prefer one founder wedge: fundraising memo, pivot decision, cofounder conflict, hiring bet, or board update. "Ambiguous company decisions" is directionally right but still broad.

## 6. Is There Unnecessary MCP/Product Bloat?

Judgment: `PASS`

The contract explicitly keeps public MCP out of scope until the core loop works. The reviewed contract files do not add broad imports, social features, browser extensions, or a generic chatbot surface.

Risk to watch later:

- `FocusState.mode` includes `learn` and `verify`, and the repo already has wiki/verify surfaces elsewhere. Those are not bloat in this contract by themselves, but Wave 1 should not expand them beyond what the founder Thinking Mode demo needs.

## Original Blocking Issues

1. Candidate persistence is ambiguous across spec, taxonomy, demo, and fixture.
2. The fixture does not prove manual override as signal.
3. The action vocabulary is inconsistent: `test/brain/nextMoveEngine.test.ts` expects `resume_open_challenge`, while `packages/brain/src/domain/types.ts` and the spec use `respond_to_challenge`.
4. The founder fixture and skeleton disagree on whether the primary market risk is adoption/usage or willingness to pay.
5. Accepted Autopilot focus is contractually meaningful, but the fixture does not include `autopilot_focus_started`.

## Original Required Contract Fixes Before Wave 1 Implementation

1. Align action names across spec, domain types, fixture, and skeleton tests.
2. Align candidate persistence into either dedicated candidate Moves or embedded persisted candidate records.
3. Add fixture coverage for accepted focus and manual override, or split fixtures into named states: `initial_suggestion`, `focus_started`, `manual_override`, `challenge_response`, and `brief_ready`.
4. Make the founder market-risk claim match the test language.
5. Keep MCP, broad product surfaces, and generic chat out of the contract.

## DEBUGGER Resolution

Status: `RESOLVED` on 2026-04-29.

- Candidate persistence is now one rule: the Thinking Mode tick persists `next_move_candidates` rows and embeds auditable candidate records in the `next_move_recomputed` Move payload.
- The contract no longer requires `autopilot_candidate_generated` or `autopilot_focus_suggested` as Thinking Mode Moves; accepted focus is recorded by `autopilot_focus_started`.
- Action names now align on the active Thinking Mode vocabulary: `resume_open_challenge`, `challenge`, `verify`, `learn`, and `clarify`.
- The YC fixture now centers the low-confidence founder market assumption on willingness to pay before traction, not generic adoption.
- The fixture now includes accepted-focus and manual-override patches with `autopilot_focus_started`, `manual_node_selected`, `pauseAutopilot: true`, `manualMoveId`, selected focus, and a link to the prior ranking Move.

RESOLVED

## 2026-04-29 Backend Addendum

Classification: `tiny`

This file is a historical Wave 1 contract critique. The original `BLOCKED` judgment below is preserved as the state of the reviewed contract set at the time; the current implementation gate is the re-review status at the top of this file.

Current backend reading:

- The new Thinking Mode service path now has durable candidate recomputation through `next_move_recomputed`, candidate rows, paused `FocusState`, `manual_node_selected`, and accepted focus via `autopilot_focus_started`.
- The current demo script now uses the sharper willingness-to-pay founder claim: `Pre-seed founders will pay for structured thinking before traction.`
- `wouldCreateMoveKinds` is now the plural form used by the spec, domain type, and fixture.
- The fixture now includes `acceptedFocus` and `manualOverride` patches covering `autopilot_focus_started`, `manual_node_selected`, paused FocusState, `manualMoveId`, selected focus, and the prior ranking Move link.
- Legacy `/autopilot/*` routes and the frontend still use the older suggestion shape; the demo path should use `/api/brains/:brainId/autopilot/*` plus `POST /api/next-move-candidates/:candidateId/start` before claiming accepted focus is durable in the product UI.
- Candidate persistence should be documented as the current service behavior: materialized candidate rows plus a `next_move_recomputed` Move payload, not a required `autopilot_candidate_generated` Move for every candidate unless a later migration explicitly adds that audit style.

Next backend fix target:

1. Keep future implementation work on the new Thinking Mode API path.
2. Wire visible "Go there" behavior to candidate start so it creates `autopilot_focus_started`.
3. Add or keep a fixture-backed assertion that the selected YC fixture claim produces the exact willingness-to-pay challenge copy.
