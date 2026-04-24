# ADR: Challenge Provider And Observability Boundaries

- Status: active
- Date: 2026-04-23
- Owner: backend
- Scope: provider abstraction, `ai_runs`, analytics, tracing, job monitoring

## Decision

Penny's provider layer and observability layer are support boundaries around the challenge spine, not alternative sources of truth.

- provider adapters own vendor transport details only
- `ai_runs` is a support read model for operators
- tracing, analytics, and job monitoring are observational or operational layers
- none of these layers may redefine canonical challenge state

## Provider Abstraction Rules

Provider adapters may own:

- request formatting
- vendor authentication headers
- response parsing
- normalized usage/cost extraction
- vendor-specific error wording

Provider adapters may not own:

- challenge round creation
- critique persistence
- domain event writes
- workspace context changes
- projection semantics
- support/admin query semantics

Current provider boundary:

- [`src/server/ai/providers/anthropic.ts`](../src/server/ai/providers/anthropic.ts)
- [`src/server/ai/providers/xai.ts`](../src/server/ai/providers/xai.ts)
- orchestrated by [`src/server/ai/operations/generateChallengeCritique.ts`](../src/server/ai/operations/generateChallengeCritique.ts)

## `ai_runs` Purpose

Penny does not currently have a first-class `ai_runs` table.

Instead, `ai_runs` exists as an operator-facing support model:

- generated runs from `challenge_critiques`
- requested-only runs from `moves_events`
- trace metadata from `_aiRun` embedded in `challenge_critiques.validated_output`

This means `ai_runs` is for:

- debugging provider behavior
- operator inspection
- filtering by provider/model/prompt version
- support/admin workflows

This means `ai_runs` is not for:

- canonical workflow coordination
- deciding whether a critique exists in product truth
- replacing `challenge_rounds` or `challenge_critiques`

## Observability Boundaries

### Tracing

Langfuse traces and observations may capture:

- route tier
- provider
- model
- prompt version
- usage/cost
- repair-pass metadata

But trace ids and observation ids are metadata only. They are not canonical product ids.

### Analytics

Challenge analytics are backend-owned observations of backend-confirmed events.

They must:

- fire from server surfaces only
- stay best-effort
- never change write ordering or response semantics

They must not:

- become the only record of a challenge event
- stand in for domain events
- drive canonical retry or repair logic

### Job Monitoring

`challenge_critique_job_attempts` is operational state for queued/running/succeeded/failed/validation_failed execution attempts.

It is useful for:

- retry visibility
- failure diagnosis
- support tooling

It is not the canonical record of the challenge critique itself. The critique becomes product truth only when the workflow updates the core round/critique state.

## Rules

1. If removing a support surface would change the product's understanding of the round, that surface is too deep into the spine.
2. Provider code should return normalized structured output or throw; it should not perform domain writes.
3. Observability surfaces may explain a state, but they may not invent a state.
4. `ai_runs` and job monitors may lag or be partial; projections and domain tables remain authoritative.

## Consequences

### Positive

- providers stay swappable without moving business logic
- admin tooling can grow without rewriting core domain behavior
- observability failures remain survivable
- contributors have a clear rule for where metadata stops and product truth begins

### Negative

- some support surfaces duplicate identifiers already present elsewhere
- contributors must trace the difference between domain state and operational state carefully
- the current `ai_runs` model intentionally remains incomplete compared with a full execution ledger

## Rejected Alternatives

### Put retry/job state directly into provider adapters

Rejected because retries and persistence are workflow responsibilities, not transport responsibilities.

### Make `ai_runs` the canonical execution ledger first

Rejected because the current need is support inspection, not another authoritative write path.

### Use analytics/tracing as proof that the product state changed

Rejected because observational delivery is intentionally best-effort and non-canonical.
