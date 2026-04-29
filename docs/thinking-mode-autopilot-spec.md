# Thinking Mode Autopilot Backend Contract

Status: Wave 1 backend contract  
Date: 2026-04-29  
Scope: backend state, move semantics, and demo fixture contract for Thinking Mode Autopilot

## 1. Product Goal

Thinking Mode Autopilot turns a raw idea into a controllable thinking loop:

1. The user enters a raw idea.
2. Penny extracts claims and assumptions.
3. Penny creates a thought map from backend-owned claims and edges.
4. Penny ranks the next highest-leverage thinking move.
5. Penny explains why that move was chosen.
6. The user either starts the suggested focus with "Go there" or manually selects another graph node.
7. Manual selection pauses Autopilot and records that override as thinking history.
8. Challenges resolve through Defend, Revise, or Absorb.
9. Revise preserves the old claim version.
10. The session ends with a Challenge Brief artifact derived from canonical state.

Penny is not a chatbot, note app, wiki, or generic AI wrapper. The backend owns canonical thinking state; the frontend renders graph slices, focus state, candidates, challenges, and artifacts returned by the backend.

## 2. Backend Invariants

- INV1: GET requests must not mutate state.
- INV2: the POST-only Autopilot tick command recomputes next-move suggestions and persists the ranking audit as a Move.
- INV3: Autopilot may suggest focus, but it must not silently mutate claim text, confidence, edge truth, or artifact truth.
- INV4: Claim text changes only through `claim_revised`.
- INV5: Confidence changes are suggestions until explicitly accepted through the confidence acceptance path.
- INV6: Every meaningful action creates an immutable, append-only Move.
- INV7: The core scoring engine must be deterministic and testable without a database, provider call, wall clock dependency, or random input.
- INV8: Backend graph rows are canonical; frontend state may cache display state but must not invent claims, edges, challenge state, or artifact truth.
- INV9: Challenge Briefs are derived artifacts. They do not replace claims, claim versions, edges, or moves as source of truth.
- INV10: Public MCP is out of scope until the core loop works end to end.

## 3. FocusState Semantics

`FocusState` is backend-owned navigation state for the current thinking loop. It is not truth state.

Required fields:

- `sessionId`: session whose graph is being focused.
- `mode`: `brain`, `challenge`, `verify`, `learn`, or `artifact`.
- `focusedClaimId`: active claim when the focus is claim-centered.
- `focusedEdgeId`: active edge when the focus is challenge- or dependency-centered.
- `source`: `autopilot_suggestion`, `autopilot_started`, `manual_selection`, `challenge_response`, or `none`.
- `suggestionMoveId`: latest suggestion move that produced the focus, when present.
- `manualMoveId`: latest manual override move that produced the focus, when present.
- `paused`: true when a manual override is newer than the latest accepted Autopilot focus.
- `reason`: short backend rationale for why this focus is active.
- `updatedAt`: timestamp of the move that produced the current focus.

Rules:

- FS1: A suggested focus is only a recommendation until the user clicks "Go there."
- FS2: Starting a suggested focus records `autopilot_focus_started`.
- FS3: Selecting another node records `manual_node_selected` and pauses Autopilot.
- FS4: Focus may point at an existing claim or edge, but must not create or alter claim truth by itself.
- FS5: A later explicit resume or accepted Autopilot focus may unpause Autopilot.

## 4. NextMoveCandidate Semantics

`NextMoveCandidate` is the deterministic scorer output for one possible next thinking move.

Required fields:

- `candidateId`: stable deterministic ID for this scoring pass.
- `sessionId`: session being ranked.
- `action`: one of the supported next-move actions: `resume_open_challenge`, `challenge`, `verify`, `learn`, or `clarify`.
- `mode`: `brain`, `challenge`, `verify`, `learn`, or `artifact`.
- `targetClaimId`: claim to focus, when applicable.
- `targetEdgeId`: edge to focus, when applicable.
- `score`: integer score produced by deterministic ranking.
- `rank`: 1-based position after sorting candidates.
- `reasonCodes`: short machine-readable reasons used for tests and analytics.
- `why`: concise user-facing explanation.
- `evidence`: claim, edge, move, and artifact IDs that justify the candidate.
- `blockedBy`: unmet prerequisites, if any.
- `wouldCreateMoveKinds`: move kinds created if the user accepts or completes this candidate.

Rules:

- NMC1: Candidate scoring is pure over a graph/session snapshot.
- NMC2: Candidate ordering must be stable for the same input snapshot.
- NMC3: Candidates may reference existing canonical IDs only.
- NMC4: Candidates explain priority without claiming that truth changed.
- NMC5: Exposed candidates are persisted as `next_move_candidates` rows and embedded candidate records inside the persisted `next_move_recomputed` move payload.

## 5. AutopilotTick Semantics

`AutopilotTick` is the backend command that recomputes the next highest-leverage thinking move.

Input:

- `sessionId`
- optional `resume` flag when the user explicitly resumes Autopilot after a manual override
- command idempotency fields

Output:

- current `FocusState`
- ranked `NextMoveCandidate[]`
- selected candidate
- persisted move IDs
- pause state

Write behavior:

- AT1: A tick is POST-only.
- AT2: A tick loads canonical session, claim, current claim version, edge, move, and artifact state.
- AT3: A tick persists `next_move_recomputed` with `candidateIds`, selected candidate refs, and embedded candidate records sufficient to audit the ranking.
- AT4: A tick materializes `next_move_candidates` rows and marks the selected candidate.
- AT5: A tick updates `FocusState` to `source: "autopilot_suggestion"` without creating a separate suggestion Move; accepting the suggestion is the later command that records `autopilot_focus_started`.
- AT6: If Autopilot is paused and `resume` is false, the tick returns pause state without changing focus or truth.
- AT7: If Autopilot is paused and `resume` is true, the tick may recompute suggestions and record the new suggestion moves.
- AT8: Tick persistence must be idempotent by command key.

## 6. Manual Override Behavior

Manual override happens when the user selects a graph node instead of following the suggested focus.

Rules:

- MO1: Manual node selection records `manual_node_selected`.
- MO2: The payload includes `claimId`, optional `previousSuggestionMoveId`, optional reason, and `pauseAutopilot: true`.
- MO3: Manual override pauses Autopilot until the user resumes or accepts a later Autopilot focus.
- MO4: Manual override updates `FocusState` navigation only; it does not revise claims, change confidence, or resolve challenges.
- MO5: Manual override is product signal. Later scoring may use it to learn that the user preferred another part of the graph.

## 7. Defend / Revise / Absorb Behavior

Challenges are Penny's explicit stress-test loop. A challenge is represented by `challenge_issued` plus a challenge or contradiction edge.

Defend:

- Records `user_defended`.
- Requires user reasoning.
- Leaves the target claim text and confidence unchanged.
- Keeps the critique available as history and possible shape evidence.

Revise:

- Records `claim_revised`.
- Requires revised claim text.
- Preserves the previous ClaimVersion with closed validity.
- Creates a new current ClaimVersion.
- Keeps challenge history attached to the stable Claim identity.

Absorb:

- Records `critique_absorbed`.
- Keeps the target claim text unchanged.
- Marks the challenge as an acknowledged vulnerability or unresolved risk.
- Allows Autopilot to later suggest `revisit_absorbed_risk`.

Rules:

- DRA1: Exactly one of Defend, Revise, or Absorb resolves a challenge response action.
- DRA2: Response moves reference the target claim, critique claim, and challenge edge.
- DRA3: Revise is the only challenge response path that changes claim text.
- DRA4: Confidence changes remain separate unless explicitly accepted.

## 8. Challenge Brief Behavior

The Challenge Brief is the session-ending artifact for the first Thinking Mode loop.

Required content:

- raw seed summary
- selected claims and assumptions
- dependency edges
- highest-leverage challenge and why it was chosen
- Defend / Revise / Absorb outcome
- preserved old claim version when Revise occurred
- unresolved risks and absorbed critiques
- concept nodes introduced during the session
- recommended next thinking move, if the session is not fully closed

Rules:

- CB1: A Challenge Brief is generated from claims, claim versions, edges, moves, and source spans.
- CB2: Creating the artifact records `artifact_created`.
- CB3: The artifact is a compiled view, not canonical truth.
- CB4: Autopilot may suggest `create_challenge_brief`, but artifact creation requires an explicit command or accepted focus.
- CB5: Updating the brief after new moves should create a new artifact version or a new artifact record, not edit history silently.

## 9. Acceptance Criteria

- AC1: The contract defines `FocusState`, `NextMoveCandidate`, and `AutopilotTick` semantics without requiring a database in the scorer.
- AC2: The move taxonomy includes all Thinking Mode Autopilot move kinds required for seed, candidate generation, focus suggestion, focus start, manual override, challenge response, completion, recomputation, and artifact creation.
- AC3: The TypeScript domain contract compiles under the repo TypeScript configuration.
- AC4: The YC demo graph fixture contains 6 to 8 claims, dependency edges, confidence values, one low-confidence market assumption, one high-confidence unsupported claim, and one concept node.
- AC5: The contract keeps GET read-only and all meaningful writes behind POST command semantics.
- AC6: The contract preserves backend ownership of canonical graph, focus, candidate, challenge, and artifact state.
- AC7: Manual override pause behavior is explicit and move-backed.
- AC8: Defend, Revise, and Absorb behavior is explicit, with Revise preserving old claim versions.
- AC9: Challenge Brief behavior is derived from canonical state and records `artifact_created`.
