# Thinking Mode Move Taxonomy

Status: Wave 1 backend contract  
Date: 2026-04-29

Moves are immutable, append-only records of meaningful thinking actions. Current state is derived from claims, claim versions, edges, artifacts, and moves; moves are never edited in place.

Canonical Thinking Mode move names use snake_case. Existing legacy dotted names may be read for compatibility, but new Thinking Mode contract work should prefer the canonical names below.

## Required Move Kinds

| Move kind | Actor | Meaning | Truth mutation |
| --- | --- | --- | --- |
| `source_recorded` | user/backend | Raw user input was recorded as a source. | Creates source provenance only. |
| `seed_claim_created` | backend | The seed idea produced the stable root claim or primary claim set. | Creates claim identity and initial claim versions. |
| `assumptions_extracted` | backend/AI | Penny extracted assumptions from the seed and connected them to the graph. | Creates assumption claims, claim versions, and dependency edges after validation. |
| `autopilot_candidate_generated` | backend | The scorer produced one candidate next move for the current graph snapshot. | None. Candidate only. |
| `autopilot_focus_suggested` | backend | Autopilot selected the highest-leverage candidate and exposed it as the suggested focus. | None. Suggestion only. |
| `autopilot_focus_started` | user | The user clicked "Go there" on an Autopilot suggestion. | Updates focus/navigation state only. |
| `manual_node_selected` | user | The user selected another graph node instead of following Autopilot. | Updates focus/navigation state only and pauses Autopilot. |
| `challenge_issued` | backend/AI | Penny issued a challenge against a target claim. | Creates critique claim and challenge/contradiction edge after validation. |
| `user_defended` | user | The user defended the target claim against the critique. | None. Records reasoning and override signal. |
| `claim_revised` | user | The user revised the claim in response to critique. | Creates a new current ClaimVersion and closes the previous version. |
| `critique_absorbed` | user | The user accepted the critique as an unresolved risk without revising yet. | Marks the challenge edge or risk state as acknowledged. |
| `focus_completed` | user/backend | The active focus reached a natural stopping point. | None unless paired with another explicit write. |
| `next_move_recomputed` | backend | Autopilot recomputed the ranked candidate set after graph or focus changes. | None. Ranking audit only. |
| `artifact_created` | backend/AI | Penny created a derived artifact such as a Challenge Brief. | Creates artifact row; does not alter claim truth. |

## Payload Requirements

### `source_recorded`

- `sourceId`
- `sessionId`
- `rawTextHash`
- `sourceKind`
- optional `sourceSpanIds`

### `seed_claim_created`

- `sourceId`
- `claimIds`
- `claimVersionIds`
- optional `edgeIds`
- `seedText`

### `assumptions_extracted`

- `sourceId`
- `brainRunId`
- `claimIds`
- `claimVersionIds`
- `edgeIds`
- `assumptionCount`

### `autopilot_candidate_generated`

- `candidateId`
- `sessionId`
- `action`
- `mode`
- `targetClaimId`
- `targetEdgeId`
- `score`
- `rank`
- `reasonCodes`
- `why`
- `evidence`

### `autopilot_focus_suggested`

- `suggestionId`
- `selectedCandidateId`
- `sessionId`
- `mode`
- `targetClaimId`
- `targetEdgeId`
- `score`
- `why`
- `reasonCodes`
- `candidateMoveIds` or embedded candidate score list
- `goThere`

### `autopilot_focus_started`

- `suggestionMoveId`
- `candidateId`
- `sessionId`
- `mode`
- `focusedClaimId`
- `focusedEdgeId`
- `startedByUserId`

### `manual_node_selected`

- `claimId`
- optional `previousSuggestionMoveId`
- optional `reason`
- `pauseAutopilot: true`
- `claimIds`
- `edgeIds`
- `artifactIds`

### `challenge_issued`

- `targetClaimId`
- `targetClaimVersionId`
- `critiqueClaimId`
- `critiqueClaimVersionId`
- `challengeEdgeId`
- `brainRunId`
- `failureType`
- `strength`
- `provenanceTag`

### `user_defended`

- `response: "defend"`
- `reasoning`
- `targetClaimId`
- `targetClaimVersionId`
- `critiqueClaimId`
- `challengeEdgeId`

### `claim_revised`

- `response: "revise"`
- `reasoning`
- `targetClaimId`
- `previousClaimVersionId`
- `currentClaimVersionId`
- `critiqueClaimId`
- `challengeEdgeId`

### `critique_absorbed`

- `response: "absorb"`
- `reasoning`
- `targetClaimId`
- `targetClaimVersionId`
- `critiqueClaimId`
- `challengeEdgeId`
- `edgeStatus`

### `focus_completed`

- `sessionId`
- `completedFocusMoveId`
- `focusedClaimId`
- `focusedEdgeId`
- `outcome`
- optional `nextMoveRequired`

### `next_move_recomputed`

- `sessionId`
- `triggerMoveId`
- `rankingVersion`
- `candidateCount`
- `selectedCandidateId`
- `candidateIds`
- `paused`

### `artifact_created`

- `artifactId`
- `artifactKind`
- `brainRunId`
- `claimIds`
- `claimVersionIds`
- `edgeIds`
- `artifactIds`

## Expected First-Loop Move Order

1. `source_recorded`
2. `seed_claim_created`
3. `assumptions_extracted`
4. `next_move_recomputed`
5. `autopilot_candidate_generated`
6. `autopilot_focus_suggested`
7. `autopilot_focus_started` or `manual_node_selected`
8. `challenge_issued`
9. `user_defended`, `claim_revised`, or `critique_absorbed`
10. `focus_completed`
11. `next_move_recomputed`
12. `artifact_created`

## Compatibility Notes

- Current backend rows may still contain `source.recorded`; contract-facing code should map that to `source_recorded`.
- Current backend rows may still contain `autopilot_suggested`; contract-facing code should map that to `autopilot_focus_suggested` until the schema is migrated.
- Current backend challenge response compatibility names such as `challenge.response.revised` should map to `claim_revised`.
- New Thinking Mode work should not introduce additional dotted move names.
