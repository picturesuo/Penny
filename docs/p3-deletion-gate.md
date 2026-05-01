# P3 Deletion Gate

Status: safe deletion plan, no broad deletion yet  
Owner: Terminal 4 Integration / Tests / Merge Captain  
Date: 2026-05-01

## Deletion Matrix

| Item | Judgment | Rationale | Safe instruction |
| --- | --- | --- | --- |
| Visible Search placeholder | DELETE NOW | Top-level `Search` is already absent from `navItems`; search now exists as Brain/Learn/Verify capability through `/api/brain/search` and related panels. | Remove only leftover top-level Search placeholder code or copy. Do not remove `BrainWorkspace` Research, Learn related Brain search, Verify search trace, or `/api/brain/search`. |
| Visible Settings placeholder | DELETE NOW | Top-level `Settings` is already absent from `navItems` and has no MVP route contract. | Remove only leftover visible Settings placeholder code/copy if found. Do not add a replacement settings surface in P3. |
| Old Cents naming | DEPRECATE ONLY | `Makes Cents` remains visible in `InsightRail`; product context says Cents is Learn, but this is user-facing copy, not dead code. | Do not delete the panel. Rename to Learn only in a focused copy pass with UI tests proving the Learn surface still works. |
| Unused challenge props | UNSURE | `CheckWorkspace` still passes challenge handlers into `InsightRail`, and `ChallengeLoop` uses them. Some `CheckWorkspaceProps` such as `status` and `onSeed` appear unused, but deleting them is frontend-only cleanup, not a route gate. | Terminal 2 may remove unused frontend props after `pnpm typecheck` and focused frontend tests. Do not touch backend challenge contracts. |
| Unused autopilot props | KEEP | `autopilotSuggestion`, candidates, focused claim, Go There, and mode routing are still product-critical. | Keep Autopilot props unless a local component proves a prop is unused by TypeScript and tests. |
| Duplicate cockpit refresh | KEEP | `runAutopilotGoThere` already has a regression test proving exactly one cockpit refresh after Go There. Other refreshes occur after distinct writes: seed, issue challenge, challenge response, brief, verify, manual focus. | Do not remove refreshes without a focused test proving the same state is updated after the write. |
| Legacy `/autopilot` aliases | DEPRECATE ONLY | They are compatibility-only and not the active demo path, but existing tests still cover them. | Keep until active clients and smoke scripts are confirmed off them; then delete `autopilot-route.ts`, its server registrations, and compatibility tests in one PR. |
| Legacy `/api/brains` aliases | DEPRECATE ONLY | Session-scoped routes are the active frontend path; brain-scoped aliases remain public compatibility and have tests. | Preserve for this sprint. If deleting later, replace with explicit 410 or migration notes and keep session route tests green. |
| Legacy LLM `/brain/challenge` path | DEPRECATE ONLY | New candidate challenge routes exist, but `/brain/challenge` and `/brain/challenge/respond` still have direct route tests and can be useful compatibility. | Do not delete until all callers use `/api/sessions/:sessionId/next-move-candidates/:candidateId/challenge` and `/api/challenges/:challengeId/respond`. |
| Legacy artifact compiler | DEPRECATE ONLY | `/api/sessions/:sessionId/challenge-brief` is the active route, but `/brain/artifact` and `/brain/session/:sessionId/artifact` still have coverage and share artifact-core code. | Keep artifact-core and the legacy route wrappers until challenge-brief service fully replaces them and route tests are migrated. |

## Route Preservation List

Protect these routes during P3 cleanup:

- `GET /api/brain/search`
- `GET /api/sessions/:sessionId/canvas`
- `GET /api/sessions/:sessionId/cockpit`
- `GET /api/sessions/:sessionId/autopilot/state`
- `POST /api/sessions/:sessionId/autopilot/tick`
- `POST /api/sessions/:sessionId/next-move-candidates/:candidateId/start`
- `POST /api/sessions/:sessionId/next-move-candidates/:candidateId/challenge`
- `POST /api/sessions/:sessionId/focus/manual`
- `POST /api/challenges/:challengeId/respond`
- `POST /api/sessions/:sessionId/challenge-brief`
- Compatibility until explicit deletion: `POST /autopilot/tick`, `POST /autopilot/select-node`, `GET /api/brains/:brainId/autopilot/state`, `POST /api/brains/:brainId/autopilot/tick`, `POST /api/brains/:brainId/focus/manual`, `POST /brain/challenge`, `POST /brain/challenge/respond`, `POST /brain/artifact`, and `POST /brain/session/:sessionId/artifact`.

## Terminal Instructions

- Terminal 1: do not remove backend route registrations unless `packages/brain/src/p3-route-preservation.test.ts` is updated with the replacement route and all affected route tests pass.
- Terminal 2: safe frontend-only deletions are limited to top-level Search/Settings placeholder remnants and provably unused props. Keep Learn, Brain, Check, Brain search, Verify search trace, and Autopilot Go There intact.
- Terminal 3: keep canvas and Brain search routes stable while removing visual placeholders. Do not replace backend-owned graph/canvas/search state with frontend mock data.
- Terminal 4: rerun route preservation, focused route tests, frontend tests, `pnpm typecheck`, and `pnpm test` before approving deletion merges.
