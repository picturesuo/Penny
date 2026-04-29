# Thinking Mode Contract Critique

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
