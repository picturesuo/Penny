# Challenge Loop Critique

Artifact ID: `CHALLENGE-LOOP-CRITIQUE`
Date: 2026-04-29
Role: CRITIC
Status: `LOOP CLOSURE PASS WITH BROWSER GAP`

## Scope

Reviewed the actual challenge loop in the current workspace:

- `packages/brain/src/services/challenge-service.ts`
- `packages/brain/src/routes/thinking-mode-routes.ts`
- `packages/brain/src/server.ts`
- `packages/brain/src/challenge-core.ts`
- `packages/brain/src/challenge-route.test.ts`
- `packages/brain/src/challenge-service.test.ts`
- `packages/brain/src/thinking-mode-routes.test.ts`
- `packages/brain/src/domain/engine.ts`
- `packages/brain/src/domain/repository.ts`
- `packages/brain/src/move-payloads.ts`
- `packages/brain/src/after-move-effects.ts`
- `packages/brain/src/artifact-core.ts`
- `test/fixtures/penny-yc-demo-graph.json`
- `docs/challenge-loop-spec.md`
- `docs/yc-demo-script.md`

## Current Re-Review

Date: 2026-04-29
Artifact ID: `CHALLENGE-LOOP-CRITIQUE`
Scope: current `origin/main` after the ChallengeRound response-contract fixes, visible frontend loop controls, focused tests, full test/lint/build verification, live isolated smoke, and source inspection of the ChallengeRound service, session cockpit DTO, frontend client, and visible frontend components.

Criterion judgments:

- `PASS WITH BROWSER GAP` `CHALLENGE-LOOP-CRITIQUE-C8`: the loop now closes through backend-owned state and visible frontend controls. The backend can persist seed -> tick -> accepted focus -> challenge issue -> challenge response -> Challenge Brief. The frontend now exposes issue, Defend / Revise / Absorb, receipt, next directive, cockpit refresh, and Challenge Brief controls. `respondToChallenge` returns a backend directive for the next move, and the frontend follows the `client_tick_required` directive with a session-scoped Thinking Mode tick instead of inventing the next state locally. Browser interaction is still not visually walked through.
- `PASS` `CHALLENGE-LOOP-CRITIQUE-C9`: user responses become durable backend signal and now run after-move effects in the ChallengeRound response path. Defend creates `user_defended`, Revise creates `claim_revised` plus a new current ClaimVersion while preserving the old one, Absorb creates `critique_absorbed` and marks the challenge edge `acknowledged_vulnerability`, every response creates `focus_completed` and updates the ChallengeRound, and the response DTO returns derived effects that the frontend renders as receipt state. Challenge Brief compilation can read those moves and versions.
- `PASS` `CHALLENGE-LOOP-CRITIQUE-C10`: frontend has enough receipt state for the response loop. The frontend client exposes `issueChallengeFromCandidate`, `respondToChallenge`, and `createChallengeBrief`; frontend types model response receipts, focus completion, before/after versions, derived effects, and next-move directives; `InsightRail` renders challenge issue/respond/brief controls plus receipt details; and `latestArtifact` is displayed in the visible UI.
- `NOT VERIFIED` `CHALLENGE-LOOP-CRITIQUE-C11`: browser-level proof of the full visible loop is not verified. This checkout has no browser E2E runner installed; current proof is focused tests plus live HTTP/API smoke.

Verification after re-review:

- `pnpm exec tsx --test packages/brain/frontend/test/brainClient.test.ts packages/brain/src/challenge-service.test.ts packages/brain/src/thinking-mode-routes.test.ts` -> `PASS`, 22 tests.
- `pnpm typecheck` -> `PASS`.
- `pnpm build:frontend` -> `PASS`.
- `pnpm test` -> `PASS`, 171 tests.
- `pnpm lint` -> `PASS`.
- `SMOKE_ISOLATED_DB=1 BASE_URL=http://localhost:3017 PORT=3017 ./scripts/smoke-thinking-mode.sh` -> `PASS`; session `72e62f84-eaaa-4d7e-911e-79fc3507b908`.

Current findings:

- `CHALLENGE-LOOP-CRITIQUE-CF8`: resolved. The product loop is no longer stopped before Defend / Revise / Absorb; the visible app can issue a challenge, capture the user response, follow the backend next directive, refresh backend-owned cockpit state, and create/display the Challenge Brief.
- `CHALLENGE-LOOP-CRITIQUE-CF9`: resolved. Durable response signal now includes Moves, ClaimVersions, ChallengeRound state, acknowledged challenge edges, `focus_completed`, and returned derived effects from the ChallengeRound response path.
- `CHALLENGE-LOOP-CRITIQUE-CF10`: resolved. Frontend receipt state now includes the full typed response data needed to show response move, focus completion, before/after version IDs, unresolved-risk state, derived effects, and latest Challenge Brief.
- `CHALLENGE-LOOP-CRITIQUE-CF11`: remaining gap. Browser-level proof is still unverified; current confidence comes from source inspection, typed frontend tests, full tests, build/lint, and live HTTP smoke.

## Original Findings (Historical)

### `CHALLENGE-LOOP-CRITIQUE-F1`: exact demo challenge is strong, but it is keyed to a claim the current fixture does not contain

`FAIL FOR ACTUAL FIXTURE; PASS FOR SPECIAL-CASED CLAIM`

The special-cased challenge for `Pre-seed founders will pay for structured thinking before traction.` is specific and founder-sharp. It attacks willingness to pay before traction, founder budget and attention pressure, and the need for an urgent artifact.

Evidence:

- `packages/brain/src/services/challenge-service.ts:441` gates the exact demo challenge on a specific claim-text substring.
- `packages/brain/src/services/challenge-service.ts:445` defines the specific critique.
- `packages/brain/src/services/challenge-service.ts:449` defines the load-bearing "why this" copy.
- `packages/brain/src/challenge-service.test.ts:6` verifies this special case.
- `docs/challenge-loop-spec.md:230` defines the exact demo challenge contract.

The actual YC fixture's top challenge target is not that claim. The fixture target is `Founders will use structured thinking guidance during ambiguous company decisions.`, so the new `ChallengeRoundService` falls through to the generic `shaky_assumption` template. I verified the current runtime path with `rankNextMoveCandidates` plus `buildTemplateChallenge`: the produced critique quotes the target claim, but says only that the assumption is load-bearing and fragile before a concrete test. That is specific enough to name a node, but not specific enough for the founder demo bar.

Evidence:

- `test/fixtures/penny-yc-demo-graph.json:49` defines the current top market assumption.
- `test/fixtures/penny-yc-demo-graph.json:57` tags it as low-confidence and load-bearing.
- `packages/brain/src/services/challenge-service.ts:463` starts the fallback template path.
- `packages/brain/src/services/challenge-service.ts:719` uses the generic `shaky_assumption` critique.
- `docs/thinking-mode-contract-critique.md:92` previously flagged the fixture/spec mismatch between adoption/usage and willingness to pay.

Impact: the backend can emit a good challenge for the exact spec claim, but the current fixture and likely demo seed path do not guarantee that challenge. The actual challenge loop can still look like "ChatGPT with a graph" if the first challenge is a quoted generic critique rather than a founder-specific pressure test.

### `CHALLENGE-LOOP-CRITIQUE-F2`: challenge selection attacks a load-bearing weakness, but challenge copy can lose the business edge

`PASS WITH COPY RISK`

The next-move engine ranks the fixture's load-bearing, low-confidence market assumption first, and the ChallengeRound service issues the challenge from that persisted candidate.

Evidence:

- `packages/brain/src/domain/engine.ts:189` creates challenge candidates.
- `packages/brain/src/domain/engine.ts:198` favors assumptions, low confidence, and `load_bearing` tags.
- `packages/brain/src/domain/engine.ts:219` explains the selected challenge as an unresolved, load-bearing risk.
- `packages/brain/src/services/challenge-service.ts:187` loads the persisted candidate by session.
- `packages/brain/src/services/challenge-service.ts:194` builds the challenge using candidate action, reason, score, and score breakdown.
- `packages/brain/src/domain-engine.test.ts:31` verifies the selected action is `challenge`.

The risk is in the fallback challenge copy. `whyThis` is just the candidate reason for non-special-cased claims, and the generic critique does not name the downstream claims, dependency edge, buyer moment, or founder job. It attacks a load-bearing node structurally, but does not always expose why the weakness matters in founder terms.

Evidence:

- `packages/brain/src/services/challenge-service.ts:467` sets fallback `whyThis` to `candidateReason`.
- `packages/brain/src/services/challenge-service.ts:703` starts generic critique templates.

Impact: the underlying target is correct; the V0 copy needs one more step of graph-specific synthesis to make the attack feel chosen, not templated.

### `CHALLENGE-LOOP-CRITIQUE-F3`: Revise preserves old selves

`PASS WITH REAL-DB GAP`

The new ChallengeRound response path preserves the stable Claim identity and old ClaimVersion. On Revise, it creates a `claim_revised` Move, marks the previous current version `isCurrent: false`, sets `validUntil`, records `supersededByVersionId`, and inserts a new current ClaimVersion with the revised text.

Evidence:

- `packages/brain/src/services/challenge-service.ts:555` starts the Revise response branch.
- `packages/brain/src/services/challenge-service.ts:559` creates the `claim_revised` Move.
- `packages/brain/src/services/challenge-service.ts:568` stores `previousClaimVersionId` in the Move payload.
- `packages/brain/src/services/challenge-service.ts:569` stores `currentClaimVersionId` in the Move payload.
- `packages/brain/src/services/challenge-service.ts:578` updates the old current ClaimVersion.
- `packages/brain/src/services/challenge-service.ts:581` marks it not current.
- `packages/brain/src/services/challenge-service.ts:582` sets `validUntil`.
- `packages/brain/src/services/challenge-service.ts:583` records `supersededByVersionId`.
- `packages/brain/src/services/challenge-service.ts:587` inserts the new ClaimVersion.
- `packages/brain/src/services/challenge-service.ts:594` stores the revised text.
- `packages/brain/src/services/challenge-service.ts:597` marks the new version current.

The remaining gap is test depth. Current tests now exercise `ChallengeRoundService.respondToChallenge` through a fake Drizzle transaction and verify the old-version update plus new-version insert. That is enough to catch the intended persistence calls, but it is not a live Postgres integration test over migrated tables.

Evidence:

- `packages/brain/src/thinking-mode-routes.test.ts:186` tests Defend/Revise/Absorb at route level through a service double.
- `packages/brain/src/challenge-service.test.ts:64` tests Revise through `ChallengeRoundService`.
- `packages/brain/src/challenge-service.test.ts:81` verifies the old version is marked not current.
- `packages/brain/src/challenge-service.test.ts:83` verifies the old version points to the new current version.
- `packages/brain/src/challenge-service.test.ts:84` verifies the new version contains the revised text.

Impact: Revise implementation is now service-tested, but not proven against a real migrated database.

### `CHALLENGE-LOOP-CRITIQUE-F4`: Absorb is meaningfully different from ignoring

`PASS`

Absorb creates a `critique_absorbed` Move, leaves the target claim version unchanged, updates the challenge edge to `acknowledged_vulnerability`, and marks the response receipt as `unresolvedRisk: true`.

Evidence:

- `packages/brain/src/services/challenge-service.ts:614` updates the challenge edge.
- `packages/brain/src/services/challenge-service.ts:617` sets `status: "acknowledged_vulnerability"`.
- `packages/brain/src/services/challenge-service.ts:627` creates `critique_absorbed`.
- `packages/brain/src/services/challenge-service.ts:632` records response `absorb`.
- `packages/brain/src/services/challenge-service.ts:638` records the acknowledged edge status in the Move payload.
- `packages/brain/src/services/challenge-service.ts:431` returns `claimTextChanged` only for Revise.
- `packages/brain/src/services/challenge-service.ts:432` returns `unresolvedRisk` for Absorb.
- `packages/brain/src/artifact-core.ts:1200` treats acknowledged challenge edges as unresolved risks.
- `packages/brain/src/artifact-core.ts:1210` gives acknowledged vulnerabilities explicit risk copy.

Impact: Absorb is not a no-op or a dismissal. It carries the critique forward into graph state and later artifact synthesis.

### `CHALLENGE-LOOP-CRITIQUE-F5`: Defend becomes a Move, but not yet a derived shape signal in the new path

`PASS AS MOVE SIGNAL; FAIL AS SHAPE SIGNAL`

Defend requires reasoning and persists it in a `user_defended` Move tied to the target claim, critique claim, and challenge edge.

Evidence:

- `packages/brain/src/routes/thinking-mode-routes.ts:59` defines Defend as its own response branch.
- `packages/brain/src/routes/thinking-mode-routes.ts:63` requires non-empty Defend reasoning.
- `packages/brain/src/services/challenge-service.ts:530` starts the Defend response branch.
- `packages/brain/src/services/challenge-service.ts:531` creates `user_defended`.
- `packages/brain/src/services/challenge-service.ts:537` stores the user's reasoning.
- `packages/brain/src/services/challenge-service.ts:538` ties the defense to the target claim.
- `packages/brain/src/services/challenge-service.ts:541` ties the defense to the challenge edge.

The gap is compounding. `after-move-effects.ts` knows how to turn `user_defended` into a shape candidate signal, but the new `ChallengeRoundService.respondToChallenge` path does not call `afterMoveEffectsInTransaction`. The older `/brain/challenge/respond` path does call it after Defend, Revise, and Absorb.

Evidence:

- `packages/brain/src/after-move-effects.ts:442` defines the `user_defended` shape signal.
- `packages/brain/src/after-move-effects.ts:445` labels it `user_defended_challenge`.
- `packages/brain/src/challenge-core.ts:498` runs after-move effects after legacy Defend.
- `packages/brain/src/challenge-core.ts:562` runs after-move effects after legacy Revise.
- `packages/brain/src/challenge-core.ts:603` runs after-move effects after legacy Absorb.
- `packages/brain/src/services/challenge-service.ts:379` persists a new ChallengeRound response, then creates only `focus_completed`.

Impact: Defend is durable signal data, but the new Thinking Mode path does not yet feed the shape/derived-effect pipeline that would make future critique visibly adapt.

### `CHALLENGE-LOOP-CRITIQUE-F6`: next move recomputes only when the client explicitly ticks again

`FAIL AUTOMATICALLY; PASS FOR EXPLICIT TICK`

The new response path completes the challenge focus, but it does not itself call the Thinking Mode scorer, persist new `next_move_candidates`, or create `next_move_recomputed`. The response output contains the response Move, `focus_completed`, and receipt, but no recomputed candidate list or selected next move.

Evidence:

- `packages/brain/src/services/challenge-service.ts:380` creates `focus_completed`.
- `packages/brain/src/services/challenge-service.ts:398` marks the ChallengeRound responded.
- `packages/brain/src/services/challenge-service.ts:415` returns the response payload.
- `packages/brain/src/services/challenge-service.ts:422` returns the response Move.
- `packages/brain/src/services/challenge-service.ts:423` returns the `focus_completed` Move.
- `packages/brain/src/services/challenge-service.ts:424` returns only the response receipt.
- `packages/brain/src/services/challenge-service.ts:156` defines `RespondToChallengeResponse` with no recomputed next-move fields.
- `packages/brain/src/routes/thinking-mode-routes.ts:327` returns `service.respondToChallenge(input)` directly.

The separate tick route can recompute when explicitly called, and the graph snapshot includes moves and current claim versions. Current tests now assert the explicit sequence: respond to the challenge, then call tick, then receive `next_move_recomputed`. That proves the two-command path, but the actual ChallengeRound response still does not close the loop by itself.

Evidence:

- `packages/brain/src/routes/thinking-mode-routes.ts:138` handles the separate tick route.
- `packages/brain/src/thinking-mode-routes.test.ts:239` tests explicit tick after a ChallengeRound response.
- `packages/brain/src/thinking-mode-routes.test.ts:262` calls the tick route after the response route.
- `packages/brain/src/thinking-mode-routes.test.ts:276` asserts `next_move_recomputed`.
- `packages/brain/src/thinking-mode-routes.test.ts:278` confirms the operations are two separate events.
- `packages/brain/src/domain/repository.ts:380` loads graph snapshots from current claims, versions, edges, moves, artifacts, and FocusState.
- `packages/brain/src/domain/engine.ts:112` ranks candidates from a graph snapshot.
- `docs/yc-demo-script.md:141` says the demo should trigger tick again after the challenge response.

Impact: this remains a loop-closure risk. Penny can recompute after the response, but only if the caller chains the tick. Without that visible follow-up in the product surface, the loop feels like form submission plus history rather than a thinking instrument.

### `CHALLENGE-LOOP-CRITIQUE-F7`: the current frontend does not expose the actual Defend/Revise/Absorb loop

`FAIL FOR DEMO SURFACE`

The React frontend displays the initial `firstChallenge` in the insight rail, but it does not call the new ChallengeRound issue/respond routes and does not expose Defend, Revise, or Absorb controls.

Evidence:

- `packages/brain/frontend/src/App.tsx:129` passes only `data?.firstChallenge` into the rail.
- `packages/brain/frontend/src/components/InsightRail.tsx:12` renders a static rail from the challenge suggestion.
- `packages/brain/frontend/src/components/InsightRail.tsx:15` uses challenge text as display copy.
- `packages/brain/frontend/src/components/InsightRail.tsx:50` renders thinking history, not response controls.

Impact: backend critique may be reviewable through tests and direct API calls, but the visible demo still cannot show the challenge response loop end to end.

## Criteria Judgment

1. Is the challenge specific?
   `FAIL FOR ACTUAL FIXTURE; PASS FOR SPECIAL-CASED CLAIM` for `CHALLENGE-LOOP-CRITIQUE`. The exact spec challenge is specific, but the current fixture's selected claim misses that special case and falls back to generic copy.

2. Does it attack a load-bearing weakness?
   `PASS WITH COPY RISK` for `CHALLENGE-LOOP-CRITIQUE`. The engine and selected candidate target a low-confidence load-bearing assumption; fallback challenge copy does not always explain the downstream business consequence sharply.

3. Does Revise preserve old selves?
   `PASS WITH REAL-DB GAP` for `CHALLENGE-LOOP-CRITIQUE`. The transaction preserves previous ClaimVersion state and creates a new current version, and a fake-transaction service test now covers the intended writes; no live Postgres test proves it end to end.

4. Is Absorb different from ignoring?
   `PASS` for `CHALLENGE-LOOP-CRITIQUE`. Absorb creates `critique_absorbed`, marks the edge `acknowledged_vulnerability`, returns an unresolved-risk receipt, and feeds artifact unresolved-risk logic.

5. Does Defend become signal?
   `PASS AS MOVE SIGNAL; FAIL AS SHAPE SIGNAL` for `CHALLENGE-LOOP-CRITIQUE`. Defend persists user reasoning as `user_defended`, but the new ChallengeRound path does not run after-move effects, so the shape signal is not materialized there.

6. Does next move recompute after response?
   `FAIL AUTOMATICALLY; PASS FOR EXPLICIT TICK` for `CHALLENGE-LOOP-CRITIQUE`. Response creates `focus_completed` but does not return the next suggestion; an explicit tick after response does recompute and persist `next_move_recomputed`.

## Verification

- `PASS`: `pnpm exec tsx --test packages/brain/src/challenge-service.test.ts packages/brain/src/thinking-mode-routes.test.ts packages/brain/src/challenge-route.test.ts packages/brain/src/domain-engine.test.ts`
- `FAIL`: `pnpm typecheck` currently fails on unrelated untracked `packages/brain/src/services/challenge-brief-service.ts` with `TS2322: Type 'BriefClaim | undefined' is not assignable to type 'BriefClaim'.`
- `PASS`: runtime snapshot of `rankNextMoveCandidates` plus `buildTemplateChallenge` on `test/fixtures/penny-yc-demo-graph.json` showed the actual fixture uses the generic fallback challenge for claim `00000000-0000-4000-8000-000000000202`.
- `PASS`: service-level fake-transaction coverage for `ChallengeRoundService.issueChallengeFromCandidate`, Defend, Revise, Absorb, and already-responded conflict handling.
- `NOT VERIFIED`: live Postgres/migrated-table execution of the ChallengeRound service transactions.

## Debugger Guidance

1. Align the YC fixture with the exact demo challenge or make the template specialize the actual fixture claim about founders using structured thinking during ambiguous company decisions.
2. Upgrade the fake-transaction service tests to a real Postgres integration smoke for Issue, Defend, Revise, Absorb, old ClaimVersion preservation, absorbed edge status, and duplicate response conflicts.
3. In the new ChallengeRound response path, run the same after-move effects used by the legacy challenge path so Defend/Revise/Absorb become shape and derived-effect signals.
4. After `focus_completed`, recompute Thinking Mode candidates or return an explicit instruction that the client must call tick; the stronger product behavior is to persist and return the new next move in the response transaction or an immediately chained command.
5. Add frontend controls for Defend, Revise, and Absorb only after the backend response path returns enough state to render the receipt and next suggestion.
