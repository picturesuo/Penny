# Challenge Brief Critique

Status: `BACKEND ARTIFACT PASS; VISIBLE OUTPUT BLOCKED`
Date: 2026-04-29  
Artifact ID: `CHALLENGE-BRIEF-CRITIQUE`

## Scope

Reviewed the V0 Challenge Brief contract, backend service, route, tests, demo script, and current frontend surface:

- `docs/challenge-brief-spec.md`
- `docs/thinking-mode-autopilot-spec.md`
- `docs/yc-demo-script.md`
- `packages/brain/src/services/challenge-brief-service.ts`
- `packages/brain/src/routes/challenge-brief-routes.ts`
- `packages/brain/src/challenge-brief-service.test.ts`
- `packages/brain/src/challenge-brief-routes.test.ts`
- `packages/brain/frontend/src/api/brainClient.ts`
- `packages/brain/frontend/src/App.tsx`
- `packages/brain/frontend/src/components/InsightRail.tsx`
- `packages/brain/frontend/src/components/CurrentExploration.tsx`
- `scripts/smoke-thinking-mode.sh`
- `docs/demo-runbook.md`

## Current Re-Review

Date: 2026-04-29
Artifact ID: `CHALLENGE-BRIEF-CRITIQUE`
Scope: reviewed current `origin/main` for whether the session produces usable output, whether the artifact remains a compiled view instead of canonical truth, and whether the demo path is honest end to end.

Criterion judgments:

- `FAIL` `CHALLENGE-BRIEF-CRITIQUE-C6`: the backend session can produce a structured Challenge Brief artifact, but the visible product still does not produce a usable founder-facing output. `POST /api/sessions/:sessionId/challenge-brief` returns an 11-section payload, creates a `challenge_brief` artifact, and records `artifact_created`. The React surface only displays `latestArtifact.title` and `latestArtifact.summary`, and the frontend type leaves `brief` as `unknown`, so the user cannot scan original idea, pressure point, response, before/after change, open risks, or move timeline inside the app. API JSON is not a usable session output for the demo bar.
- `PASS WITH PROVENANCE GAP` `CHALLENGE-BRIEF-CRITIQUE-C7`: the Challenge Brief is a compiled view, not canonical truth. Generation loads persisted session, source, claim, ClaimVersion, edge, Move, ChallengeRound, FocusState, selected candidate, and artifact rows; inserts an artifact row; records an `artifact_created` Move; and focused tests assert the generation path does not insert or update Claim or ClaimVersion rows. The remaining gap is provenance depth: the Challenge Brief refs include `sourceIds` but not `sourceSpanIds`, while the broader contract names source spans as part of artifact provenance.
- `FAIL` `CHALLENGE-BRIEF-CRITIQUE-C8`: the demo path is API-honest but not product-honest end to end. The isolated smoke proves seed -> graph/state reads -> tick -> focus -> manual focus -> challenge issue -> Defend/Revise/Absorb -> graph reads -> Challenge Brief creation. However, the demo/runbook story implies the founder sees a compact Challenge Brief and a concrete post-brief next move in the product. Current UI renders only the artifact title/summary, the runbook's "non-mutating guard smoke" label points at a mutating full smoke, and the optional runbook commands stop before challenge response/brief creation. The actual API path exists; the visible demo claim is still overstated.

Verification after re-review:

- `pnpm exec tsx --test packages/brain/src/challenge-brief-service.test.ts packages/brain/src/challenge-brief-routes.test.ts packages/brain/frontend/test/brainClient.test.ts packages/brain/src/session-cockpit-routes.test.ts` -> `PASS`, 15 tests.
- `pnpm typecheck` -> `PASS`.
- `SMOKE_ISOLATED_DB=1 BASE_URL=http://127.0.0.1:3019 PORT=3019 ./scripts/smoke-thinking-mode.sh` -> `PASS`; session `ab570e7f-bc0c-43fd-b2c6-028385cc77be`.
- Post-smoke listener checks on ports `55439` and `3019` -> `PASS`, no listeners remained.

Current findings:

- `CHALLENGE-BRIEF-CRITIQUE-CF6`: visible output is the blocker. The next implementation slice should render the `brief.sections` payload in a compact panel instead of only showing artifact title and summary.
- `CHALLENGE-BRIEF-CRITIQUE-CF7`: compiled-view invariant holds. Do not fix the visible-output gap by copying artifact text into claims or treating artifacts as graph truth.
- `CHALLENGE-BRIEF-CRITIQUE-CF8`: demo honesty needs a cleanup pass. The runbook should either point to the full smoke honestly as mutating or split a real guard smoke from the mutating demo smoke, and the scripted demo should not claim a readable product artifact until the UI renders it.

## Original Criterion Judgments (Historical)

| Criterion | Judgment | Artifact mapping |
| --- | --- | --- |
| 1. Would a founder use this after a session? | FAIL | `CHALLENGE-BRIEF-CRITIQUE-C1` |
| 2. Does it show transformation? | FAIL | `CHALLENGE-BRIEF-CRITIQUE-C2` |
| 3. Is it too generic? | PASS | `CHALLENGE-BRIEF-CRITIQUE-C3` |
| 4. Is it short enough for demo? | NOT VERIFIED | `CHALLENGE-BRIEF-CRITIQUE-C4` |
| 5. Does it make next move obvious? | FAIL | `CHALLENGE-BRIEF-CRITIQUE-C5` |

Overall: `BLOCKED FOR DEMO`. The backend can persist a Challenge Brief, but the artifact is not yet reliably founder-usable in the actual demo path.

## Findings

### `CHALLENGE-BRIEF-CRITIQUE-F1`: no founder-facing Challenge Brief surface

Maps to: `CHALLENGE-BRIEF-CRITIQUE-C1`

The new route creates and returns a structured artifact through `POST /api/sessions/:sessionId/challenge-brief`, and the route tests cover status, section count, artifact kind, and `artifact_created`. That is necessary backend work.

The current frontend does not call or render that route. `packages/brain/frontend/src/api/brainClient.ts` exposes seed, session moves, Autopilot tick, and manual node selection, but no Challenge Brief command. `packages/brain/frontend/src/components/CurrentExploration.tsx` renders the Autopilot suggestion card and exploration rows only. A repo search found no frontend `challenge-brief` or `Challenge Brief` rendering surface.

Impact: in the demo, the founder cannot naturally leave the session with a readable Challenge Brief. Showing the raw JSON response would make Penny look like an API wrapper rather than a finished thinking instrument.

Required before demo: add a thin frontend command and artifact panel that renders the 11 sections as a compact receipt, hiding backend IDs by default while keeping them available for audit/debug.

### `CHALLENGE-BRIEF-CRITIQUE-F2`: Revise does not show a readable before/after

Maps to: `CHALLENGE-BRIEF-CRITIQUE-C2`

`whatChanged` preserves the previous and current ClaimVersion IDs for `Revise`, but the founder-readable text only says `Revised claim is now: ...`. It does not include the previous claim text. The focused service test asserts the previous/current IDs, not a before/after text pair.

Impact: the old self is preserved in backend state, but the artifact does not visibly show transformation. A founder should be able to scan the brief and see: "I started with X, Penny challenged Y, I revised it into Z." IDs are audit metadata; they are not transformation copy.

Required before demo: include `previousClaimText` and `currentClaimText` in `whatChanged` for `Revise`, with display copy that reads as a before/after.

### `CHALLENGE-BRIEF-CRITIQUE-F3`: the recommended next move can point back to creating the current brief

Maps to: `CHALLENGE-BRIEF-CRITIQUE-C5`

`recommendedNextMove` mirrors `state.latestSelectedCandidate` whenever there is no open challenge. Separately, the Autopilot scorer can select `create_challenge_brief` after a challenge response when no fresh brief exists. That is the expected Wave 6 demo path: recompute after response, accept artifact creation, then generate the Challenge Brief.

In that path, the Challenge Brief can recommend `create_challenge_brief` as the next move while the user is already reading the newly created Challenge Brief.

Impact: the session-ending artifact may end with a self-referential next action. That makes the loop feel mechanically stitched together and weakens the "clean ending" demo moment.

Required before demo: while compiling a Challenge Brief, ignore a selected candidate whose action is `create_challenge_brief` for the current artifact boundary, or recompute a post-artifact next move from unresolved risks after the new artifact is considered created.

### `CHALLENGE-BRIEF-CRITIQUE-F4`: length is bounded structurally but not verified as demo copy

Maps to: `CHALLENGE-BRIEF-CRITIQUE-C4`

The service limits several list sections: up to 5 assumptions, 3 reasons, 5 risks, and 8 moves. That helps.

The spec asks for 400 to 700 words and scanability under two minutes, but no test checks rendered word count or section length. Seed text, claim text, challenge text, user reasoning, and risk text are effectively unbounded. The route returns the full JSON payload, including refs, inputs, IDs, and generated metadata.

Impact: the backend shape is likely manageable for the seeded YC fixture, but demo scanability is not proven. A long seed or verbose user response could make the artifact too dense unless the frontend applies display limits.

Required before demo: add a fixture-based rendering/word-count check or snapshot against the YC demo seed, and clamp or collapse long fields in the UI.

### `CHALLENGE-BRIEF-CRITIQUE-F5`: source spans are omitted from the new brief payload

Maps to: `CHALLENGE-BRIEF-CRITIQUE-C1`

The Thinking Mode spec and Challenge Brief spec both name source spans as part of the source of truth. The new service loads `sources`, claims, versions, edges, moves, challenge rounds, FocusState, candidates, and artifacts, but it does not load `source_spans` or include `sourceSpanIds` in refs.

Impact: the brief is derived from backend rows, but its provenance is weaker than the contract says. This matters if the demo needs to prove claims came from the original seed text rather than Penny inventing them.

Required before demo only if provenance is shown: load source spans and include `sourceSpanIds` in refs or per-section provenance.

## Positive Findings

### `CHALLENGE-BRIEF-CRITIQUE-P1`: artifact creation is backend-owned and move-backed

Maps to: `CHALLENGE-BRIEF-CRITIQUE-C1`

`generateChallengeBrief` runs inside a transaction, reads persisted state, creates a `brain_run`, inserts a `challenge_brief` artifact, records an `artifact_created` Move, and returns the artifact, move, brain run, and payload. Focused route tests pass for POST-only creation, error mapping, and `artifact_created` visibility.

### `CHALLENGE-BRIEF-CRITIQUE-P2`: normal seeded content is not generic

Maps to: `CHALLENGE-BRIEF-CRITIQUE-C3`

The sections are compiled from actual seed, claim, assumption, challenge, response, candidate, and move text. The focused test fixture is founder-specific: Penny, pre-seed founders, willingness to pay, fundraising urgency, and founder artifact pressure are all present in the compiled sections.

Risk remains: fallback copy such as "No challenge issued yet" or "No unresolved challenge..." is acceptable for incomplete sessions but should not be the demo path.

## Verification

- `PASS`: `pnpm exec tsx --test packages/brain/src/challenge-brief-service.test.ts packages/brain/src/challenge-brief-routes.test.ts`
- `PASS`: code inspection confirms the route rejects non-POST requests before service calls.
- `NOT VERIFIED`: live browser/demo flow for seed -> challenge response -> accepted Challenge Brief -> rendered artifact.
- `NOT VERIFIED`: rendered Challenge Brief word count and scan time.

## Status

`BLOCKED FOR DEMO`

The backend persistence path can proceed as a foundation, but the demo should not depend on this artifact until the frontend renders it, Revise shows before/after text, and the post-artifact next move cannot recommend creating the same brief again.
