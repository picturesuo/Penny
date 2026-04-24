# Challenge + Learn UI

Terminal 3 owns the MVP Challenge and Learn mode experience in:

- `apps/web/components/challenge/**`
- `apps/web/components/learn/**`
- `apps/web/lib/viewmodels/challenge/**`
- `apps/web/lib/viewmodels/learn/**`
- `tests/ui/challenge/**`
- `tests/ui/learn/**`

## Challenge

Challenge mode reads the existing workspace challenge projection and shapes it into:

- explicit state card for no round yet, round started with no critique, critique pending, critique loaded, and critique failed
- selected claim card
- strongest counterargument card
- key weakness summary
- what is at stake section
- critique transparency card for status, round, provider, model, prompt, and response state
- dependency cascade summary from assumptions, likely failure modes, and follow-up questions
- response actions for `Defend`, `Revise`, and `Absorb`

The mode keeps the stronger amber/orange accent locally in the Challenge component CSS module. Recording a response still uses the existing `POST /api/commands/challenge/respond` route and stores the selected response action as `responsePath`.

Endpoint integration:

- Challenge reads `GET /api/workspace/challenge`.
- Learn reads `GET /api/workspace/learn`.
- Starting a Challenge round posts to `POST /api/commands/challenge/start-round`.
- Requesting critique posts to `POST /api/commands/challenge/request-critique`.
- Recording Defend / Revise / Absorb responses posts to `POST /api/commands/challenge/respond`.

Mocked adapters are not used for this slice because the required Challenge and Learn endpoints are mounted. The UI still has local placeholder and error states for incomplete data or unavailable projection responses.

Challenge state mapping:

- `no_round_yet`: selected claim may exist, but there is no active round.
- `round_started`: an active round exists and no critique has been requested.
- `critique_pending`: a critique request exists and is waiting on generated output.
- `critique_loaded`: generated critique content is ready for response.
- `critique_failed`: critique generation failed, so the user can retry or record a manual response.

## Learn

Learn mode reads the existing workspace Learn projection and builds a muted green teach-back surface:

- explicit Learn state card for placeholder, active concept, feedback shown, loading, and error states
- concept title derived from the selected claim
- concept explanation grounded in the selected claim body
- teach-back writing area
- Penny feedback card with draft-sensitive local guidance
- related ideas list
- "where this lives in your brain" mini-map
- disabled `Switch concept` placeholder button
- three-step practice path: Explain, Example, Edge case
- retrieval checks for recall, evidence, and remembered challenge
- learning state card with selected map, selected claim, placeholder status, and local draft length

Learn is intentionally local-only for this slice. It does not add backend schema, provider calls, command writes, or real concept switching yet.

Learn state mapping:

- `placeholder`: no active concept has been selected.
- `active_concept`: a selected claim is available as the current concept.
- `feedback_shown`: local teach-back text exists and the feedback card is responding to it.
- `loading`: a loading projection status is present.
- `error`: an error projection status is present.

## Boundaries

- No provider wrapper changes.
- No backend schema changes.
- No global shell redesign.
- `apps/web/components/penny-shell.tsx` only delegates the existing Challenge and Learn mode branches to the new owned components.

## Verification

Targeted checks run on 2026-04-24:

```bash
pnpm exec tsx --test tests/ui/challenge/challenge-endpoints.test.ts tests/ui/challenge/challenge-experience.test.ts tests/ui/learn/learn-experience.test.ts
pnpm exec eslint apps/web/components/penny-shell.tsx apps/web/components/challenge/challenge-experience.tsx apps/web/components/learn/learn-experience.tsx apps/web/lib/viewmodels/challenge/challenge-experience.ts apps/web/lib/viewmodels/learn/learn-experience.ts tests/ui/challenge/challenge-experience.test.ts tests/ui/learn/learn-experience.test.ts
```

`pnpm --dir apps/web typecheck` still fails in existing non-Terminal-3 paths on `.ts` import suffix handling and backend projection/command typing issues. No new touched-file type errors were reported before those existing failures.
