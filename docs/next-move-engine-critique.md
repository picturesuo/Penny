# Next Move Engine Critique

Status: Wave 2 delayed CRITIC review  
Date: 2026-04-29  
Scope: pure scoring engine only

Reviewed:

- `packages/brain/src/next-move-engine.ts`
- `test/brain/nextMoveEngine.test.ts`
- `test/fixtures/penny-yc-demo-graph.json`
- `packages/brain/src/domain/types.ts`
- `docs/thinking-mode-autopilot-spec.md`
- `docs/move-taxonomy.md`

Verification:

- `pnpm exec tsx --test test/brain/nextMoveEngine.test.ts`: `PASS` with 10 passing tests.
- Ranking snapshot on `test/fixtures/penny-yc-demo-graph.json`: selected `challenge_claim` for the low-confidence founder adoption assumption with score `1362`.
- Ranking snapshot with an added open challenge: selected `resume_open_challenge` with score `1522`.

## 1. Does It Rank Leverage Over Difficulty?

Judgment: `PASS WITH RISK`

The engine mostly ranks leverage over difficulty. There is no explicit "easy task" bonus. The top candidate in the YC fixture is the low-confidence founder adoption assumption because it has assumption kind weight, low confidence, market-risk tags, unsupported status, and multiple active connected edges. With an open challenge present, `resume_open_challenge` outranks fresh exploration.

That is the right direction for Thinking Mode. It rewards unresolved challenge work and load-bearing assumptions rather than simple navigation.

Risk:

- `dependencyPressure()` counts all active connected structural edges in both directions, including `clarifies`, `questions`, and `supports`. That can overstate leverage for a node with many weak or merely explanatory connections.
- There is no explicit distinction between "hard but load-bearing" and "easy but low value." Difficulty is absent rather than modeled. That is acceptable for now, but future engine behavior should not accidentally add convenience bonuses without tests.

## 2. Is The Reason Human-Readable?

Judgment: `PASS`

The candidate reason is understandable in a demo:

- `Challenge "Founders will use structured thinking guidance during ambiguous company decisions." because it is a load-bearing assumption with 42% confidence.`
- `Resume the open challenge on "..." before starting new exploration.`
- `Verify "..." because it is high-confidence without supporting evidence.`

The engine also returns `exitCriteria`, `reasonCodes`, and `scoreBreakdown`. That gives the UI enough material to show both human rationale and machine-testable reasons.

Risk:

- The reason explains why the candidate matters, but not why it beat the next-best candidate. In a founder demo, the user should see something like "this outranks the generic-chat claim because two major claims depend on it and confidence is only 42%."

## 3. Is Scoring Deterministic?

Judgment: `PASS`

The engine is deterministic:

- It is pure over `ThinkingGraphSnapshot`.
- It does not call a provider, database, wall clock, or random source.
- It uses stable hashing and stable stringify.
- Ties are broken by action priority, claim ID, then edge ID.
- The test suite verifies stable fingerprint and no input mutation.

This is suitable for focused unit tests and demo fixtures.

## 4. Could It Select Dumb Nodes?

Judgment: `FAIL`

Yes. The top YC fixture result is reasonable, but the candidate set still includes weak choices that could become selected in sparse or later-session states.

Failure modes:

- It emits fallback `explore_claim` candidates for claims that already have stronger candidates in the same ranking pass, including the selected low-confidence assumption and high-confidence unsupported claim.
- It emits `learn` for every concept node without checking whether the user is actually blocked by that concept.
- It does not implement `create_challenge_brief`, even though the action exists in the pure action union. After a challenge response, the engine may keep selecting more claim work instead of recognizing the artifact boundary.
- It does not appear to use `focusState` to avoid suggesting the node the user is already focused on.
- It does not suppress resolved recent work except for challenge edges with response moves.

Required fix before demo use:

- Suppress fallback candidates for claims that already have a higher-specificity candidate.
- Add artifact-boundary candidates after a challenge response when no blocking challenge remains.
- Gate `learn` behind a real confusion signal or a candidate reason that proves why learning is currently more valuable than challenge/verify.
- Use `focusState` and recent Moves to avoid reselecting the same node immediately.

## 5. Are Penalties Preventing Repeated Harassment?

Judgment: `FAIL`

No. The engine currently has no meaningful anti-harassment or cooldown logic.

Missing penalties:

- No penalty for recently suggested candidates.
- No penalty for `autopilot_focus_started`.
- No penalty for `manual_node_selected`.
- No penalty for `focus_completed`.
- No penalty for recent `verify_run`.
- No penalty for recent `learning_triggered`.
- No penalty for a user manually overriding away from the same suggestion.
- No pause handling from `focusState.paused`.

The only repeat-prevention behavior is that an active challenge edge with a response Move is no longer treated as open. That is necessary, but far too narrow.

Required fix before demo use:

- Add deterministic penalties from recent Moves and `focusState`.
- Penalize or suppress candidates the user manually bypassed.
- Suppress a claim after `focus_completed` unless new graph evidence appears.
- Penalize repeated verify/learn suggestions until the graph hash or relevant claim version changes.

## 6. Would This Be Understandable In A Demo?

Judgment: `PASS WITH DEMO RISK`

The selected YC fixture candidate is understandable. The demo can say: Penny chose the founder adoption assumption because it is low confidence, market-related, and load-bearing. The score breakdown supports that explanation.

Demo risk:

- If the UI shows the full candidate list, fallback duplicates and concept Learn candidates may make the engine look noisy.
- The reason does not yet explain comparative ranking.
- Without harassment penalties, rerunning the engine after user actions could make Penny look stubborn rather than controllable.
- The pure engine is not yet wired into `POST /autopilot/tick`, so passing pure-engine behavior is not proof of product behavior.

## Overall Findings

- `PASS`: deterministic, DB-free, provider-free scoring.
- `PASS`: human-readable candidate reasons and exit criteria.
- `PASS WITH RISK`: leverage is the dominant scoring idea.
- `FAIL`: dumb-node suppression is incomplete.
- `FAIL`: repeat/harassment penalties are absent.
- `NOT VERIFIED`: integration with the live Autopilot tick route, because the route still uses the older scorer.

## Required Before Demo Integration

1. Add recent-Move penalties for repeated suggestions, accepted focus, manual override, completed focus, Verify, and Learn.
2. Suppress fallback candidates when a stronger action exists for the same claim.
3. Add artifact-boundary scoring for Challenge Brief creation after a challenge response.
4. Make comparative rationale visible for the selected candidate.
5. Wire or explicitly map the pure engine into the Autopilot route before claiming product behavior.

BLOCKED FOR DEMO INTEGRATION
