# Challenge Brief Critique

Status: `BACKEND ARTIFACT PASS; VISIBLE OUTPUT PASS WITH COPY RISK`
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

- `PASS` `CHALLENGE-BRIEF-CRITIQUE-C6`: the visible product now renders a usable Challenge Brief output. `POST /api/sessions/:sessionId/challenge-brief` returns the 11-section `challenge_brief` payload, the frontend type models that payload, and `InsightRail` renders original idea, current claim, assumptions, pressure point, challenge, response, what changed, open risks, recommended next move, and move timeline instead of only title/summary.
- `PASS` `CHALLENGE-BRIEF-CRITIQUE-C7`: the Challenge Brief is a compiled view, not canonical truth. Generation loads persisted session, source, source span, claim, ClaimVersion, edge, Move, ChallengeRound, FocusState, selected candidate, and artifact rows; inserts an artifact row; records an `artifact_created` Move; includes `sourceSpanIds` in refs; and focused tests assert the generation path does not insert or update Claim or ClaimVersion rows.
- `PASS WITH BROWSER GAP` `CHALLENGE-BRIEF-CRITIQUE-C8`: the demo path is now API-honest and product-honest at source/test level. The runbook labels the full smoke as mutating, the isolated smoke proves seed -> graph/state reads -> tick -> focus -> manual focus -> challenge issue -> Defend/Revise/Absorb -> graph reads -> Challenge Brief creation, and the React surface renders the structured brief sections. A browser-level walkthrough of the rendered brief remains unverified.

Verification after re-review:

- `pnpm exec tsx --test packages/brain/src/challenge-brief-service.test.ts packages/brain/src/challenge-brief-routes.test.ts packages/brain/frontend/test/brainClient.test.ts packages/brain/src/session-cockpit-routes.test.ts` -> `PASS`, 15 tests.
- `pnpm typecheck` -> `PASS`.
- `SMOKE_ISOLATED_DB=1 BASE_URL=http://127.0.0.1:3019 PORT=3019 ./scripts/smoke-thinking-mode.sh` -> `PASS`; session `ab570e7f-bc0c-43fd-b2c6-028385cc77be`.
- Post-smoke listener checks on ports `55439` and `3019` -> `PASS`, no listeners remained.

Current findings:

- `CHALLENGE-BRIEF-CRITIQUE-CF6`: resolved. The frontend renders `brief.sections` in a compact panel instead of only showing artifact title and summary.
- `CHALLENGE-BRIEF-CRITIQUE-CF7`: resolved for provenance refs and still passing for the compiled-view invariant. Do not copy artifact text into claims or treat artifacts as graph truth.
- `CHALLENGE-BRIEF-CRITIQUE-CF8`: resolved at source/API-smoke level. The remaining proof gap is a browser-level walkthrough of the rendered brief.

## Original Criterion Judgments (Historical)

| Criterion | Judgment | Artifact mapping |
| --- | --- | --- |
| 1. Would a founder use this after a session? | FAIL | `CHALLENGE-BRIEF-CRITIQUE-C1` |
| 2. Does it show transformation? | FAIL | `CHALLENGE-BRIEF-CRITIQUE-C2` |
| 3. Is it too generic? | PASS | `CHALLENGE-BRIEF-CRITIQUE-C3` |
| 4. Is it short enough for demo? | NOT VERIFIED | `CHALLENGE-BRIEF-CRITIQUE-C4` |
| 5. Does it make next move obvious? | FAIL | `CHALLENGE-BRIEF-CRITIQUE-C5` |

Overall: historical `BLOCKED FOR DEMO`; current re-review above supersedes this after the frontend section renderer, source-span refs, and runbook cleanup landed.

## Historical Findings

### `CHALLENGE-BRIEF-CRITIQUE-F1`: founder-facing Challenge Brief surface

Maps to: `CHALLENGE-BRIEF-CRITIQUE-C1`

Resolved in the current implementation. The frontend calls `POST /api/sessions/:sessionId/challenge-brief`, stores the returned artifact, types the `challenge_brief` payload, and renders the structured sections in `InsightRail`.

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

### `CHALLENGE-BRIEF-CRITIQUE-F5`: source spans in the brief payload

Maps to: `CHALLENGE-BRIEF-CRITIQUE-C1`

Resolved in the current implementation. The service loads source spans into the compiled state and includes `sourceSpanIds` in the Challenge Brief refs.

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

`VISIBLE OUTPUT PASS WITH COPY RISK`

The backend persistence path and visible section renderer can support the demo. Remaining risk is copy polish, especially before/after wording for Revise and browser-level proof of rendered scanability.
