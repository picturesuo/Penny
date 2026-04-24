# Challenge Launch Sheet

- Status: active
- Date: 2026-04-23
- Owner: backend
- Purpose: show which parts of the challenge plan are already incorporated, which are only partial, and how to split the remaining work into one spine lane plus parallel lanes that can run safely at the same time

## Status Key

- `incorporated`: repo-visible and aligned closely enough with the intended boundary
- `partial`: repo-visible, but the boundary, schema, or delivery shape is not fully where it should be
- `not yet`: not incorporated in a repo-visible way
- `dirty-only`: present only in an uncommitted local artifact and should not be treated as incorporated yet

## Current Audit

### Spine

| Item | Status | Notes |
| --- | --- | --- |
| Spine 1. Database and migrations | `partial` | `challenge_rounds`, `challenge_critiques`, and `moves_events` exist in [`src/db/schema.ts`](../src/db/schema.ts), but there is still no first-class `ai_runs` table or migration-backed execution ledger. |
| Spine 2. Domain events | `partial` | Challenge events are being written through current command and workflow code, but there is no dedicated typed event module, event factory layer, or explicit `causation_id` / `correlation_id` event contract yet. |
| Spine 3. Canonical critique schema | `partial` | A canonical Zod schema exists at [`src/server/ai/schemas/challengeCritique.ts`](../src/server/ai/schemas/challengeCritique.ts), but it does not yet match the newer compact output shape requested in this plan. |
| Spine 4. Operation folder and interfaces | `partial` | The operation exists in one file at [`src/server/ai/operations/generateChallengeCritique.ts`](../src/server/ai/operations/generateChallengeCritique.ts), not yet split into `input.ts`, `output.ts`, `prompt.ts`, `policy.ts`, and `execute.ts`. |
| Spine 5. Provider adapters and runtime | `partial` | Anthropic and xAI adapters exist, but provider selection and runtime orchestration are not yet separated into the requested capability registry and runtime files. |
| Spine 6. Validation and repair pass | `partial` | The live path already validates output and runs one repair pass, but the validation result model and error classification remain too embedded in the operation code. |
| Spine 7. Command handler | `partial` | The write path is split across [`src/server/workspace-commands.ts`](../src/server/workspace-commands.ts) and [`src/server/challenge-critique-workflow.ts`](../src/server/challenge-critique-workflow.ts), but it still lacks the cleaner `ai_runs`-backed command boundary described here. |
| Spine 8. Projection builder | `incorporated` | [`buildChallengeView`](../src/server/workspace-projections.ts) already exists and handles pending, ready, failed, and validation-failed challenge states from persisted backend state. |
| Spine 9. Route wiring | `partial` | Thin routes exist through generic command and workspace endpoints, but not yet as the dedicated challenge route surfaces named in this plan. |
| Spine 10. Observability on the spine | `partial` | Langfuse and structured logging are already attached to the operation path, but metadata propagation is not yet centered on a first-class execution ledger. |
| Spine 11. Idempotency and duplicate safety | `partial` | The current workflow already uses the requested critique idempotency key shape and duplicate protections, but the retry state still lacks a first-class `ai_runs` table. |
| Spine 12. Tests | `not yet` | Focused backend tests for the challenge spine are still missing from the repo. |

### Parallel

| Item | Status | Notes |
| --- | --- | --- |
| Parallel A1. Sentry integration | `not yet` | No repo-visible Sentry integration is present in the backend challenge path. |
| Parallel A2. Structured backend logging | `partial` | The core path already has challenge-flow logging, but it is not yet documented or packaged as a standalone support track with stable field guarantees. |
| Parallel A3. Release and environment metadata | `partial` | Release and environment metadata exist in parts of the AI path, but not yet as a dedicated reusable support boundary. |
| Parallel B1. PostHog backend analytics | `incorporated` | Backend-owned challenge analytics are implemented and documented. See [`docs/challenge-analytics-events.md`](./challenge-analytics-events.md). |
| Parallel B2. Analytics taxonomy doc | `incorporated` | The analytics taxonomy is documented in ADR-style form. |
| Parallel C1. Admin API for `ai_runs` | `incorporated` | Internal API route and query helper are in place for operator inspection. |
| Parallel C2. Admin UI for `ai_runs` | `incorporated` | The internal admin page exists, with explicit caveats about unsupported failure states in the current source of truth. |
| Parallel C3. Queue and job visibility | `partial` | A job-monitor slice exists in the workspace, but this support surface is not yet documented as a stable incorporated track and should be treated carefully until fully locked. |
| Parallel D1. Golden dataset structure | `incorporated` | Offline dataset schema and example dataset exist under [`evals/generateChallengeCritique`](../evals/generateChallengeCritique). |
| Parallel D2. Replay script | `incorporated` | Replay CLI exists at [`src/scripts/replay-generate-challenge-critique.ts`](../src/scripts/replay-generate-challenge-critique.ts). |
| Parallel D3. Scoring framework | `incorporated` | Offline scoring schema and example scored output exist under `evals/`. |
| Parallel E1. Seed scripts | `dirty-only` | Seed artifacts are present locally but are not yet repo-visible or stable enough to count as incorporated. |
| Parallel E2. Provider mocks for tests | `incorporated` | Deterministic Anthropic and xAI test doubles exist under [`src/server/ai/testing`](../src/server/ai/testing). |
| Parallel E3. Architecture docs and ADRs | `incorporated` | Architecture overview and ADRs are already in `docs/`. |

## Spine Category

Run only one spine item at a time. These tasks define or constrain canonical behavior, so they should not be split across multiple uncoordinated threads.

### Spine Lane

1. Spine 1. Promote `ai_runs` from support read model to migration-backed execution ledger.
2. Spine 2. Extract a typed challenge event model with factories and persistence helpers.
3. Spine 3. Lock the canonical critique output schema to the compact domain-facing shape.
4. Spine 4. Split the critique operation into `input`, `output`, `prompt`, `policy`, and `execute` files.
5. Spine 5. Extract capability-based provider selection and runtime orchestration.
6. Spine 6. Centralize validation, one repair pass, and normalized error classification.
7. Spine 7. Tighten the command handler around idempotency, event writes, and `ai_runs`.
8. Spine 8. Recheck `buildChallengeView` against the finalized spine shapes after the upstream changes land.
9. Spine 9. Add the dedicated challenge API routes after the command and projection contracts are stable.
10. Spine 10. Re-anchor observability to the finalized execution ledger and metadata flow.
11. Spine 11. Recheck duplicate safety and retry state transitions after the ledger exists.
12. Spine 12. Add focused backend tests once the canonical surfaces stop moving.

### Why This Order

- Spine 1 through Spine 7 define what the system considers real backend truth.
- Spine 8 and Spine 9 should sit on top of that truth instead of forcing it.
- Spine 10 and Spine 11 should instrument and harden a stable path, not a moving one.
- Spine 12 comes last because the most valuable tests are the ones written against the final boundaries instead of a temporary file layout.

## Parallel Category

These tasks are intentionally more granular than the spine so two or three can run at once without redefining product truth.

### Parallel A. Error And Runtime Support

1. A1. Add Sentry to the backend challenge path.
2. A2. Tighten structured challenge-flow logging into a stable support contract.
3. A3. Normalize release and environment metadata propagation across logs, traces, and support surfaces.

### Parallel B. Analytics

1. B1. Keep backend-owned PostHog analytics aligned to the event catalog.
2. B2. Extend the analytics taxonomy only when a new backend-owned event has a clear source of truth.

### Parallel C. Operator Tooling

1. C1. Keep the internal `ai_runs` API aligned to the backend source of truth.
2. C2. Keep the internal `ai_runs` page aligned to the API and failure-state caveats.
3. C3. Promote job and queue visibility into a clearly documented operator surface if it becomes repo-visible and stable.

### Parallel D. Evaluation Harness

1. D1. Expand the golden dataset only after the canonical output schema is locked.
2. D2. Keep the replay harness aligned to provider and prompt changes.
3. D3. Keep the offline scoring framework external to the production write path.

### Parallel E. Enablement

1. E1. Land seed scripts as a deliberate support track, not as stray local artifacts.
2. E2. Keep provider mocks aligned to the provider-neutral runtime interfaces.
3. E3. Keep architecture docs and ADRs current as the spine changes.

## Best 3-At-Once Setup

If you want one main lane plus two side lanes, use this pattern:

- Main lane: the current spine item
- Side lane 1: one item from Parallel A, B, or C
- Side lane 2: one item from Parallel D or E

### Good Combinations

- Main: Spine 1. Database and migrations
- Side 1: A1. Sentry integration
- Side 2: E3. Architecture doc updates

- Main: Spine 4. Operation folder and interfaces
- Side 1: C3. Queue and job visibility
- Side 2: E2. Provider mocks maintenance

- Main: Spine 7. Command handler
- Side 1: C1. Admin API refinements
- Side 2: D2. Replay harness updates

## Now / Next / Parallel Now

### Now

- Spine 1. Add the first-class `ai_runs` table, migration, and indexes.
- Keep the rest of the write path unchanged while the ledger lands.

### Next

- Spine 2. Extract typed domain events.
- Spine 3. Lock the critique output schema.
- Spine 4. Split the operation file into its boundary-owned subfiles.

### Parallel Now

- A1. Sentry integration
- C3. Queue and job visibility
- E1. Seed scripts, but only after they are promoted out of dirty local artifacts and into deliberate repo-visible files

## Notes

- The biggest remaining gap is not analytics, admin tooling, or evals. It is that the core spine still does not have a first-class `ai_runs` ledger and still keeps too much typed domain behavior embedded in broad workflow files.
- The most complete support tracks today are analytics, operator `ai_runs` inspection, eval replay/scoring, provider mocks, and architecture docs.
- The least incorporated tracks today are focused spine tests and Sentry.
