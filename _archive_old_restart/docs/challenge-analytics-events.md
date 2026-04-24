# ADR: Challenge Analytics Taxonomy

- Status: active
- Date: 2026-04-23
- Owner: backend
- Scope: Penny challenge flow only

## Decision

Penny's challenge-flow analytics must use a backend-owned taxonomy before broader analytics expands. Event emission belongs to server-rendered pages and server route handlers only. These events are observational, best-effort, and must never change challenge domain behavior, write ordering, or response semantics.

## Global Rules

### Event naming

- Use `challenge_*` names for challenge-flow analytics only.
- Name events after a user-meaningful state transition, not an implementation detail.
- Prefer one event per durable semantic moment instead of many near-duplicates.

### Ownership

- Source of truth is backend execution, not client UI state.
- If the client shows a state that the backend did not confirm, do not emit a backend analytics event for it.
- If multiple server surfaces can emit the same event, they must share the same semantic rule.

### Delivery

- Events are sent through [`src/server/posthog-challenge-analytics.ts`](../src/server/posthog-challenge-analytics.ts).
- Route/page integrations should schedule analytics with `after()` when possible so network latency to PostHog does not block the main response.
- Analytics failures must be swallowed after logging; they are not product failures.

### Shared event context

These fields are not part of every event's required property list below because they are attached by the helper:

- `source=penny_backend`
- `ownership=backend`
- `feature=challenge_flow`
- `userId`

## Event Catalog

### `challenge_round_started`

- Description: a challenge round was successfully created and returned to the caller.
- Required properties:
  - `claimId`
  - `mapId`
  - `roundId`
  - `roundNumber`
  - `critiqueMode`
  - `generationStatus`
- Optional properties:
  - none
- Source of truth:
  - The successful backend response from [`src/app/api/maps/[id]/claims/[claimId]/challenge/route.ts`](../src/app/api/maps/%5Bid%5D/claims/%5BclaimId%5D/challenge/route.ts) after `createChallengeDraftRound()` returns a round.
- When event fires:
  - After the round exists and the route is about to return `201`.
  - Only for the start-round path, not for response submission or client-side optimistic state.
- Anti-patterns to avoid:
  - Do not fire when critique generation is merely requested.
  - Do not fire on client button click.
  - Do not fire twice for the same round because both client and server observed it.

### `challenge_critique_requested`

- Description: the backend accepted a valid request to generate the next critique for a claim.
- Required properties:
  - `claimId`
  - `mapId`
  - `critiqueMode`
  - `critiqueIntensity`
  - `forceRegenerate`
  - `selectedVoice`
- Optional properties:
  - none
- Source of truth:
  - The validated backend request body in [`src/app/api/maps/[id]/claims/[claimId]/challenge/route.ts`](../src/app/api/maps/%5Bid%5D/claims/%5BclaimId%5D/challenge/route.ts).
- When event fires:
  - After request validation passes and before challenge generation is attempted.
  - Only for requests that enter the real critique-generation path.
- Anti-patterns to avoid:
  - Do not fire for malformed or rejected requests.
  - Do not fire for response submission payloads that happen to hit the same route.
  - Do not rename this to a generic "started" event; it means request accepted, not round created.

### `challenge_critique_generated`

- Description: the backend produced a critique payload for the requested challenge round.
- Required properties:
  - `claimId`
  - `mapId`
  - `roundId`
  - `roundNumber`
  - `critiqueMode`
  - `generationStatus`
  - `generationProvider`
- Optional properties:
  - none
- Source of truth:
  - The returned round from `createChallengeDraftRound()` in [`src/app/api/maps/[id]/claims/[claimId]/challenge/route.ts`](../src/app/api/maps/%5Bid%5D/claims/%5BclaimId%5D/challenge/route.ts).
- When event fires:
  - After critique generation succeeds and the round object exists.
  - Fires for both fully generated and fallback-generated rounds; `generationStatus` carries the difference.
- Anti-patterns to avoid:
  - Do not suppress this event just because generation used fallback logic.
  - Do not fire before `roundId` exists.
  - Do not overload this event to mean the user read or accepted the critique.

### `challenge_critique_failed`

- Description: the backend failed to produce a critique payload after a valid critique request entered generation.
- Required properties:
  - `claimId`
  - `mapId`
  - `critiqueMode`
  - `critiqueIntensity`
  - `forceRegenerate`
  - `selectedVoice`
  - `reason`
- Optional properties:
  - none
- Source of truth:
  - The caught backend error in [`src/app/api/maps/[id]/claims/[claimId]/challenge/route.ts`](../src/app/api/maps/%5Bid%5D/claims/%5BclaimId%5D/challenge/route.ts), but only when the request had already entered the critique-generation path.
- When event fires:
  - After a validated critique request fails during generation or round creation.
  - Does not fire for validation-only failures before the generation path begins.
- Anti-patterns to avoid:
  - Do not emit for every `400` on the route.
  - Do not emit both a backend failure event and a client submission failure event for the same root failure unless they represent different layers.
  - Do not strip the failure reason down to `"internal_error"` if a more specific backend message exists.

### `challenge_view_loaded`

- Description: the backend rendered a challenge-focused map surface.
- Required properties:
  - `mapId`
  - `claimId`
  - `route`
  - `source`
- Optional properties:
  - none
- Source of truth:
  - The server-rendered map pages:
    - [`src/app/maps/[id]/page.tsx`](../src/app/maps/%5Bid%5D/page.tsx)
    - [`src/app/app/maps/[id]/page.tsx`](../src/app/app/maps/%5Bid%5D/page.tsx)
- When event fires:
  - During backend page render when the request is explicitly challenge-oriented.
  - Current rule: emit only when `launcher=challenge`, `nextAction=challenge_dependency`, or `nextAction=run_another_round`.
- Anti-patterns to avoid:
  - Do not treat every map page load as a challenge view.
  - Do not emit from client hydration or tab switching if the backend request was not challenge-oriented.
  - Do not use this event as a proxy for "user saw a critique"; it means challenge entry surface loaded.

## Taxonomy Boundaries

### What this catalog covers

- Challenge critique generation requests and outcomes.
- Challenge round creation.
- Backend-rendered challenge entry surfaces.

### What this catalog does not cover

- Client-only UI interactions such as button hover, tab switch, or optimistic state.
- Response submission success/failure events already tracked elsewhere.
- Broader Brain or Learn analytics.

## Anti-Sprawl Rules

- Do not create synonyms like `challenge_started`, `challenge_generated`, or `challenge_loaded` for the same semantic moments.
- Do not add optional properties until there is a real analysis question that needs them.
- Do not promote transient implementation details such as retry counters, internal provider fallbacks, or logger field names into required analytics properties without a taxonomy update.
- If a new challenge event is needed, add it here first with firing semantics before shipping instrumentation.

## Integration Points

- Helper: [`src/server/posthog-challenge-analytics.ts`](../src/server/posthog-challenge-analytics.ts)
- Start/generate route: [`src/app/api/maps/[id]/claims/[claimId]/challenge/route.ts`](../src/app/api/maps/%5Bid%5D/claims/%5BclaimId%5D/challenge/route.ts)
- Challenge-focused map entry pages:
  - [`src/app/maps/[id]/page.tsx`](../src/app/maps/%5Bid%5D/page.tsx)
  - [`src/app/app/maps/[id]/page.tsx`](../src/app/app/maps/%5Bid%5D/page.tsx)

## Environment

- `POSTHOG_API_KEY`
- `POSTHOG_HOST` optional, defaults to `https://app.posthog.com`
