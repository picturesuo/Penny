# AI Backend Contract

This document defines the backend-to-AI boundary for `generateChallengeCritique`.
It is a handoff contract, not a database or route design. Backend code owns loading
trusted workspace state, persistence, idempotency, and event emission. AI code owns
turning that trusted input into a validated critique artifact plus provider metadata.

## Operation

- Name: `generateChallengeCritique`
- Contract module: `server/ai/contracts/generateChallengeCritique.ts`
- Implementation module: `server/ai/operations/generateChallengeCritique.ts`
- Backend caller status: backend command handlers may call this operation after they
  have already authorized the user and loaded the critique, round, map, and claim.

## Backend Input

The backend must pass only server-loaded, ownership-checked state. The AI operation
must not trust client-provided map, claim, round, or user context.

Required backend fields:

- `userId`: owner of the workspace state.
- `mapId`: map that contains the challenged claim.
- `claimId`: claim being challenged.
- `roundId`: challenge round requesting the critique.
- `critiqueId`: durable critique placeholder that will receive the result.
- `claimText`: current persisted claim text.
- `claimConfidence`: integer confidence value from `0` to `100`.

Optional backend fields:

- `requestId`: idempotency key or event correlation key.
- `mapTitle`: persisted map title.
- `critiqueMode`: `direct`, `socratic`, or `red_team`; defaults to `direct`.
- `neighboringClaims`: nearby persisted claims with optional confidence, kind, and relationship.
- `previousRounds`: prior challenge rounds with critique summary, response path, and confidence delta.
- `steelmanText`: existing steelman or strongest supporting context.
- `userGoal`: short backend-supplied goal/context string.

## AI Output

`generateChallengeCritique` returns a validated object with:

- `output.conciseCritiqueSummary`: short summary of the core pressure point.
- `output.strongestCounterargument`: strongest counterargument to the claim.
- `output.assumptions`: list of assumptions the claim depends on.
- `output.likelyFailureModes`: list of ways the claim could fail.
- `output.followUpQuestions`: list of next questions to ask the user.
- `output.suggestedConfidenceDelta`: integer suggested delta from `-100` to `100`.
- `output.uncertaintyNote`: concise uncertainty note.
- `meta.provider`: provider that produced the accepted output.
- `meta.model`: model that produced the accepted output.
- `meta.promptVersion`: prompt/schema version used.
- `meta.routeTier`: selected route tier.
- `meta.fallbackHopCount`: number of failed routes before success.
- `meta.repairAttempted`: whether one repair pass was used.
- `meta.validationResult`: `valid` or `repaired_valid`.
- `meta.traceId` and `meta.observationId`: tracing identifiers when available.
- `meta.usage` and `meta.cost`: normalized provider usage and cost fields.
- `meta.environment`, `meta.release`, and `meta.latencyMs`: operational metadata.

## Persistence Fields

The backend should store generated critiques on the durable critique placeholder and
emit a domain event from the command path. A successful generation should persist:

- `status`: `ready`.
- `body`: human-readable formatted critique text for projections and fallback display.
- `critiqueJson`: the validated structured `output` object.
- `provider`: accepted provider name.
- `model`: accepted model name.
- `promptVersion`: accepted prompt/schema version.
- `traceId`: trace identifier when available.
- `observationId`: observation identifier when available.
- `usage`: normalized token usage when available.
- `cost`: normalized cost when available.

The corresponding event payload should include at least:

- `roundId`
- `mapId`
- `claimId`
- `status`
- `body`
- `critiqueJson`
- `provider`
- `model`
- `promptVersion`

## Failure States

The backend should treat failures as explicit states, never silent success.

- `input_validation_error`: AI input was missing, malformed, or out of bounds. Do not call a provider.
- `provider_failure`: a provider route failed. The operation may try the next configured route.
- `output_validation_error`: a provider returned malformed structured output. The operation may attempt one repair pass.
- `generation_failed`: all configured routes failed, or repaired output still failed validation.

When final generation fails, backend persistence should set:

- `status`: `failed`.
- `body`: `null`.
- `critiqueJson`: `null`.
- `errorMessage`: concise failure message safe for internal event logs.

The backend command path remains responsible for whether failed attempts are retried,
how idempotency keys replay, and which failure details are exposed publicly.

## Backend Integration Instructions

These instructions are for the later backend bridge pass. Do not move AI invocation
into request-acceptance code. `requestChallengeCritique` should remain responsible
for accepting the request and creating or reusing the pending critique placeholder.

### Where To Call

Call `generateChallengeCritique` from the generation step that owns completion of a
pending critique, after the backend has:

- loaded the pending `challenge_critiques` row by `critiqueId`
- verified the requesting user owns the critique, round, map, and claim
- loaded the persisted claim text and current confidence
- loaded optional map title, neighboring claims, prior rounds, and steelman context
- resolved the idempotency or event correlation key for the generation attempt

The generation step should pass backend-loaded state into:

```ts
await generateChallengeCritique(
  {
    claimId,
    claimText,
    claimConfidence,
    mapTitle,
    critiqueMode,
    neighboringClaims,
    previousRounds,
    steelmanText,
    userGoal,
  },
  {
    userId,
    mapId,
    claimId,
    roundId,
    requestId,
  },
);
```

Then convert the operation result to `ChallengeCritiqueResult` from
`server/ai/contracts/challengeCritiqueResult.ts` before persistence. Keep `roundId`
either in that envelope or as an external persistence key, but do not require the AI
operation to own round persistence.

### What To Persist

On success, update the existing durable critique placeholder rather than inserting a
new critique row. Persist:

- `status`: backend status `ready`; bridge-envelope status `succeeded`
- `body`: formatted readable critique text derived from `critiqueJson`
- `critiqueJson`: validated structured critique output
- `provider`: accepted provider, nullable if unavailable
- `model`: accepted model, nullable if unavailable
- `promptVersion`: accepted prompt/schema version
- `errorCode`: `null`
- `errorMessage`: `null`
- `metadata`: JSON-safe object containing trace, observation, usage, cost, route tier, fallback count, repair flag, validation result, environment, release, and latency where available
- `updatedAt`: backend timestamp from the command or job runner

On final failure, update the same critique placeholder:

- `status`: backend status `failed`; bridge-envelope status `failed`
- `body`: `null`
- `critiqueJson`: `null`
- `provider`: nullable provider if the failing route is known, otherwise `null`
- `model`: nullable model if the failing route is known, otherwise `null`
- `promptVersion`: prompt/schema version attempted
- `errorCode`: stable internal code such as `AI_OPERATION_FAILED`, `AI_OUTPUT_INVALID`, or `AI_PROVIDER_FAILED`
- `errorMessage`: concise internal failure message
- `metadata`: JSON-safe trace, provider-attempt, fallback, usage, and latency details when available
- `updatedAt`: backend timestamp from the command or job runner

### What Events To Emit

Emit events from the backend command or job boundary after the durable critique row
is updated. The AI operation itself should not write events.

On success, emit one `challenge.critique.generated` event with:

- `roundId`
- `mapId`
- `claimId`
- `status: "ready"`
- `body`
- `critiqueJson`
- `provider`
- `model`
- `promptVersion`
- `metadata`

On final failure, emit one `challenge.critique.failed` event with:

- `roundId`
- `mapId`
- `claimId`
- `status: "failed"`
- `errorCode`
- `errorMessage`
- `provider`
- `model`
- `promptVersion`
- `metadata`

Use the generation `requestId` or event correlation key for idempotency. Replaying
the same generation request must not create a second critique row or a second
generated/failed event for the same logical attempt.
