# Thinking Mode Contract Critique

Status: Current implementation re-review: `BACKEND PASS, FRONTEND/CONTRACT ALIGNMENT BLOCKED`
Artifact ID: `THINKING-MODE-CONTRACT-CRITIQUE`
Review date: 2026-04-29

This update keeps the original Wave 1 contract review below as historical context. The current judgment is based on the implemented Thinking Mode backend path, the still-active frontend/demo path, the contract docs, the YC fixture, and focused verification commands.

## Current Verification Summary

Criterion judgments for `THINKING-MODE-CONTRACT-CRITIQUE`:

- `PASS` SC1: the active backend scorer in `packages/brain/src/domain/engine.ts` is deterministic, database-free, provider-free, and returns ranked candidates with rationale, exit criteria, score breakdown, stable fingerprint, and graph hash.
- `PASS` SC2 for the new API path: `POST /api/brains/:brainId/autopilot/tick` validates input, rejects non-POST methods, loads canonical graph state, persists next-move candidates, records `next_move_recomputed`, updates suggestion FocusState, and does not mutate claim text or confidence.
- `PASS` SC3 for the new API path: `POST /api/brains/:brainId/focus/manual` validates input, records `manual_node_selected`, persists `manual_selection` FocusState, pauses Autopilot, and returns the selected focus.
- `PASS` SC4: current challenge response tests cover Defend, Revise, Absorb, `focus_completed`, and old ClaimVersion preservation on Revise.
- `PASS` SC5: focused Thinking Mode tests, full package tests, `pnpm typecheck`, and `pnpm lint` pass.
- `NOT VERIFIED` SC6 as a global repo-cleanliness criterion: reviewed implementation commits are already on `origin/main`, but the current working tree contains unrelated public asset changes outside this critique.

Verification commands run:

- `pnpm exec tsx --test packages/brain/src/domain-engine.test.ts packages/brain/src/thinking-mode-service.test.ts packages/brain/src/thinking-mode-routes.test.ts packages/brain/src/challenge-service.test.ts packages/brain/src/challenge-brief-service.test.ts packages/brain/src/domain-repository.test.ts packages/brain/src/db-schema.test.ts` -> `PASS`, 43 tests.
- `pnpm exec tsx --test packages/brain/src/autopilot-core.test.ts packages/brain/src/autopilot-route.test.ts test/brain/nextMoveEngine.test.ts test/brain/thinkingModeService.test.ts test/brain/challengeRespond.test.ts` -> `PASS`, but 8 files in `test/brain/*` remain TODO skeleton checks and should not be treated as implementation proof.
- `pnpm test` -> `PASS`, 161 tests.
- `pnpm typecheck` -> `PASS`.
- `pnpm lint` -> `PASS`.
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

### `THINKING-MODE-CONTRACT-CRITIQUE-F3`: Contract Artifacts Still Disagree With The Implemented Vocabulary

Judgment: `FAIL`

The implementation standardized the active backend on `resume_open_challenge`, `challenge`, `verify`, `clarify`, and `learn`. The Wave 1 contract and fixture still use older action names such as `respond_to_challenge`, `challenge_claim`, and `verify_confidence`, and `docs/thinking-mode-autopilot-spec.md` still documents `wouldCreateMoveKind` singular while the fixture and historical domain type use `wouldCreateMoveKinds`.

Candidate auditability is also still split across artifacts. The implemented new backend uses `next_move_candidates` rows plus embedded candidate summaries in `next_move_recomputed`. `docs/move-taxonomy.md` still presents `autopilot_candidate_generated` and `autopilot_focus_suggested` as required first-loop Moves, while the current Drizzle `move_kind` enum does not include `autopilot_candidate_generated` and the new backend does not create `autopilot_focus_suggested`.

Impact: the backend has a coherent persistence model, but the contract docs and fixture can mislead the next implementer into adding obsolete move kinds or testing against the wrong action names.

Required fix:

- Update `docs/thinking-mode-autopilot-spec.md`, `docs/move-taxonomy.md`, `docs/yc-demo-script.md`, `packages/brain/src/domain/types.ts`, and `test/fixtures/penny-yc-demo-graph.json` to match the implemented action vocabulary and persistence model.
- Either remove `autopilot_candidate_generated` / `autopilot_focus_suggested` from required current-path moves, or explicitly document them as legacy/contract aliases that are not emitted by the new Thinking Mode API.
- Use one field name for downstream effects: prefer `acceptedMoveKinds` or `wouldCreateMoveKinds`, but do not keep both contract languages.

### `THINKING-MODE-CONTRACT-CRITIQUE-F4`: The YC Fixture Still Misses The Willingness-To-Pay Demo Claim

Judgment: `FAIL`

The demo script says the pressure point is `Pre-seed founders will pay for structured thinking before traction.` The actual YC fixture target claim is still `Founders will use structured thinking guidance during ambiguous company decisions.`

I verified the current fixture-driven path by ranking the fixture with `rankNextMoveCandidates` and passing the selected target into `buildTemplateChallenge`. The selected candidate is sensible, but the challenge falls back to the generic load-bearing assumption template rather than the sharper willingness-to-pay critique.

Impact: backend mechanics pass, but the demo artifact is less founder-specific than the script promises. The first challenge can sound like generic adoption risk instead of the sharper paid-founder-moment risk.

Required fix:

- Replace or add the fixture claim with the willingness-to-pay wording used by the demo script.
- Keep the expected top candidate pointed at that claim.
- Add a fixture-backed assertion that `buildTemplateChallenge` produces the exact willingness-to-pay critique on the selected candidate, not just on a manually constructed test input.

### `THINKING-MODE-CONTRACT-CRITIQUE-F5`: Backend Truth Mutation Boundaries Hold

Judgment: `PASS`

The reviewed backend path keeps Autopilot suggestions separate from truth mutation. Tick and focus start mutate candidate/focus rows and Moves only; they do not change claim text, confidence, edge truth, or artifacts. Challenge response behavior preserves the explicit Defend / Revise / Absorb split, and Revise preserves the old ClaimVersion before marking the new ClaimVersion current.

Remaining risk is integration-level, not core backend behavior: the frontend must stop using local-only accepted focus if the demo is meant to prove Move-backed Thinking Mode.

## Current Status

`PROCEED FOR BACKEND API; BLOCKED FOR FRONTEND DEMO AND CONTRACT ALIGNMENT`

The backend service, route, persistence, challenge response, and Challenge Brief behavior now meet the core artifact. The visible app and Wave 1 contract artifacts do not yet prove the same contract because they still reference legacy routes, stale move names, and a weaker founder fixture.

---

Status: Wave 1 delayed CRITIC review  
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

## Blocking Issues

1. Candidate persistence is ambiguous across spec, taxonomy, demo, and fixture.
2. The fixture does not prove manual override as signal.
3. The action vocabulary is inconsistent: `test/brain/nextMoveEngine.test.ts` expects `resume_open_challenge`, while `packages/brain/src/domain/types.ts` and the spec use `respond_to_challenge`.
4. The founder fixture and skeleton disagree on whether the primary market risk is adoption/usage or willingness to pay.
5. Accepted Autopilot focus is contractually meaningful, but the fixture does not include `autopilot_focus_started`.

## Required Contract Fixes Before Wave 1 Implementation

1. Align action names across spec, domain types, fixture, and skeleton tests.
2. Align candidate persistence into either dedicated candidate Moves or embedded persisted candidate records.
3. Add fixture coverage for accepted focus and manual override, or split fixtures into named states: `initial_suggestion`, `focus_started`, `manual_override`, `challenge_response`, and `brief_ready`.
4. Make the founder market-risk claim match the test language.
5. Keep MCP, broad product surfaces, and generic chat out of the contract.

BLOCKED

## 2026-04-29 Backend Addendum

Classification: `tiny`

This file is a historical Wave 1 contract critique. Keep the original `BLOCKED` judgment as the state of the reviewed contract set at the time, but do not treat it as the only current implementation gate.

Current backend reading:

- The new Thinking Mode service path now has durable candidate recomputation through `next_move_recomputed`, candidate rows, paused `FocusState`, `manual_node_selected`, and accepted focus via `autopilot_focus_started`.
- The current demo script now uses the sharper willingness-to-pay founder claim: `Pre-seed founders will pay for structured thinking before traction.`
- `wouldCreateMoveKinds` is the plural form used by the domain type and fixture; any future contract edit should make the spec match that plural name.
- The fixture still does not include named post-suggestion states for `focus_started` or `manual_override`, so it remains insufficient as the full end-to-end demo proof.
- Legacy `/autopilot/*` routes and the frontend still use the older suggestion shape; the demo path should use `/api/brains/:brainId/autopilot/*` plus `POST /api/next-move-candidates/:candidateId/start` before claiming accepted focus is durable in the product UI.
- Candidate persistence should be documented as the current service behavior: materialized candidate rows plus a `next_move_recomputed` Move payload, not a required `autopilot_candidate_generated` Move for every candidate unless a later migration explicitly adds that audit style.

Next backend fix target:

1. Keep future implementation work on the new Thinking Mode API path.
2. Wire visible "Go there" behavior to candidate start so it creates `autopilot_focus_started`.
3. Add fixture or test coverage for accepted focus and manual override state transitions before using this critique as a closed contract.
