# ADR: Challenge Spine Boundaries

- Status: active
- Date: 2026-04-23
- Owner: backend
- Scope: challenge spine, workspace projections, support surfaces

## Decision

Penny's challenge architecture is split into:

- a **challenge spine** that owns canonical writes
- **support systems** that observe or enrich the spine without replacing it

Canonical challenge state belongs only to backend-owned command/workflow code and persisted core tables.

## Spine Ownership

The spine owns:

- command validation and acceptance
- round creation and response persistence
- challenge critique persistence
- domain event writes
- workspace context persistence

Primary owners:

- [`src/server/workspace-commands.ts`](../src/server/workspace-commands.ts)
- [`src/server/challenge-critique-workflow.ts`](../src/server/challenge-critique-workflow.ts)
- `challenge_rounds`
- `challenge_critiques`
- `moves_events`
- `workspace_contexts`

## Projection Ownership

Projections are backend-owned read models. They may:

- shape Brain / Challenge / Learn payloads
- summarize persisted domain state
- expose persisted workflow status

Projections may not:

- accept canonical writes
- invent challenge state
- reconstruct missing domain decisions from heuristics
- become a second workflow engine

Primary owner:

- [`src/server/workspace-projections.ts`](../src/server/workspace-projections.ts)

## Support Systems

The following are explicitly outside the spine:

- analytics
- Langfuse tracing
- internal `ai_runs` inspection
- job-attempt monitoring
- offline replay and evaluation
- admin/support pages

These systems may read spine state or append support-only data, but they must not become the canonical record of what happened in a challenge round.

## Rules

1. If the feature changes what Penny believes happened, it belongs in the spine.
2. If the feature only helps observe, score, inspect, or debug that state, it belongs outside the spine.
3. Frontend code must never assemble canonical challenge state from raw fragments when a projection should own that shape.
4. Support tables and support read models must remain reconstructible from canonical state or clearly marked as operational-only.

## Consequences

### Positive

- contributors have a clear place to put domain logic
- projections stay predictable and backend-owned
- admin tooling can evolve without redefining product truth
- support failures do not automatically become product failures

### Negative

- some support surfaces will feel redundant because they intentionally mirror, not own, core state
- contributors cannot shortcut by putting business logic into admin/read paths
- new async features must explicitly decide whether they are canonical or support-only

## Rejected Alternatives

### Let projections infer canonical challenge state

Rejected because it makes read code responsible for missing or ambiguous writes.

### Let admin/read models become the main AI execution ledger

Rejected because the current `ai_runs` shape is a support read model over core data, not the authoritative product record.

### Let the client own workspace challenge context

Rejected because mode identity, breadcrumbs, and selected entities must remain backend-owned for consistent Brain / Challenge / Learn projections.
