# Thinking Mode Autopilot Test Plan

## Purpose

This plan tracks the Wave 1 DEBUGGER skeletons for proving the Thinking Mode Autopilot loop without broadening the product into a chatbot, note app, wiki, or generic AI wrapper.

The backend remains the source of canonical thinking state. Tests should verify Moves, ClaimVersions, graph focus, candidates, challenges, and artifacts through backend-owned contracts.

## Current Verification Surface

- Test framework: Node built-in test runner through `tsx --test`.
- Current suite: `pnpm test`, which runs `tsx --test packages/brain/src/*.test.ts`.
- Typecheck: `pnpm typecheck`.
- Local API: `pnpm dev:api`, serving `http://localhost:3000`.
- DB setup: `DATABASE_URL` must be exported before `pnpm db:migrate` or DB-backed API smoke tests.
- Current gap: the new `test/brain/*.test.ts` skeletons are not part of `pnpm test` until the package script is expanded.

## Planned Skeleton Coverage

| Case | Skeleton file | Expected assertion |
| --- | --- | --- |
| Ranking chooses the founder willingness-to-pay assumption | `test/brain/nextMoveEngine.test.ts` | The pure engine ranks the willingness-to-pay assumption above lower-leverage nodes for a founder seed. |
| Open challenge returns `resume_open_challenge` | `test/brain/nextMoveEngine.test.ts` | An unanswered challenge outranks fresh exploration and returns the resume action. |
| GET routes do not mutate | `test/brain/thinkingModeService.test.ts` | GET handlers reject or read only, and no Move/ClaimVersion rows are created. |
| `POST /autopilot/tick` creates candidate | `test/brain/thinkingModeService.test.ts` | Tick recomputes and persists an Autopilot candidate without mutating claim truth. |
| Start focus creates `autopilot_focus_started` | `test/brain/thinkingModeService.test.ts` | Accepting a suggested focus records an explicit focus-start Move. |
| Manual node click creates `manual_node_selected` | `test/brain/thinkingModeService.test.ts` | Manual selection pauses Autopilot and records the selected claim. |
| Defend creates `user_defended` | `test/brain/challengeRespond.test.ts` | Defend stores the reasoning and emits the correct Move kind. |
| Revise creates new ClaimVersion and `claim_revised` | `test/brain/challengeRespond.test.ts` | Revise preserves the old version and appends a new current version. |
| Absorb creates `critique_absorbed` | `test/brain/challengeRespond.test.ts` | Absorb marks the challenge as acknowledged without rewriting the claim. |
| Challenge Brief includes what changed | `test/brain/challengeRespond.test.ts` | The final Challenge Brief summarizes Defend, Revise, and Absorb outcomes. |

## Promotion Path

1. Replace each `test.todo` with a deterministic unit or service test using in-memory fixtures where possible.
2. Keep the next-move engine tests database-free.
3. Add DB-backed service tests only after a stable test database bootstrap exists.
4. Expand `pnpm test` or add a targeted script so `test/brain/*.test.ts` runs in CI and local verification.
5. Promote the smoke script from guard probes to a full happy-path smoke once `autopilot_focus_started` and test DB setup are implemented.

## Demo Gate

Before a demo, run:

```sh
pnpm typecheck
pnpm test
pnpm exec tsx --test test/brain/*.test.ts
./scripts/smoke-thinking-mode.sh
```

The skeleton suite is expected to report TODOs until later waves implement the missing assertions.
