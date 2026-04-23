# Challenge Analytics Events

Backend-owned PostHog analytics for Penny's challenge flow live in [`src/server/posthog-challenge-analytics.ts`](../src/server/posthog-challenge-analytics.ts).

## Constraints

- Emit from backend request/render paths only.
- Never mutate core challenge behavior or block domain writes.
- Use `after()` for route/page integrations so analytics stays off the critical path.
- Send to PostHog with `source=penny_backend`, `ownership=backend`, and `feature=challenge_flow`.

## Event Catalog

### `challenge_critique_requested`

- Meaning: the backend accepted a request to generate the next critique for a claim.
- Integration point: [`src/app/api/maps/[id]/claims/[claimId]/challenge/route.ts`](../src/app/api/maps/%5Bid%5D/claims/%5BclaimId%5D/challenge/route.ts)
- Properties:
  - `claimId`
  - `mapId`
  - `critiqueMode`
  - `critiqueIntensity`
  - `forceRegenerate`
  - `selectedVoice`

### `challenge_critique_generated`

- Meaning: the backend returned a critique payload for the requested challenge round.
- Integration point: [`src/app/api/maps/[id]/claims/[claimId]/challenge/route.ts`](../src/app/api/maps/%5Bid%5D/claims/%5BclaimId%5D/challenge/route.ts)
- Properties:
  - `claimId`
  - `mapId`
  - `roundId`
  - `roundNumber`
  - `critiqueMode`
  - `generationStatus`
  - `generationProvider`

### `challenge_critique_failed`

- Meaning: the backend failed to produce a critique payload after a valid critique request entered the generation path.
- Integration point: [`src/app/api/maps/[id]/claims/[claimId]/challenge/route.ts`](../src/app/api/maps/%5Bid%5D/claims/%5BclaimId%5D/challenge/route.ts)
- Properties:
  - `claimId`
  - `mapId`
  - `critiqueMode`
  - `critiqueIntensity`
  - `forceRegenerate`
  - `selectedVoice`
  - `reason`

### `challenge_round_started`

- Meaning: a challenge round was created successfully and returned to the caller.
- Integration point: [`src/app/api/maps/[id]/claims/[claimId]/challenge/route.ts`](../src/app/api/maps/%5Bid%5D/claims/%5BclaimId%5D/challenge/route.ts)
- Properties:
  - `claimId`
  - `mapId`
  - `roundId`
  - `roundNumber`
  - `critiqueMode`
  - `generationStatus`

### `challenge_view_loaded`

- Meaning: the backend rendered a challenge-focused map surface.
- Integration points:
  - [`src/app/maps/[id]/page.tsx`](../src/app/maps/%5Bid%5D/page.tsx)
  - [`src/app/app/maps/[id]/page.tsx`](../src/app/app/maps/%5Bid%5D/page.tsx)
- Emission rule: only when the request is explicitly challenge-oriented (`launcher=challenge`, `nextAction=challenge_dependency`, or `nextAction=run_another_round`).
- Properties:
  - `mapId`
  - `claimId`
  - `route`
  - `source`

## Environment

- `POSTHOG_API_KEY`
- `POSTHOG_HOST` optional, defaults to `https://app.posthog.com`

## Notes

- This catalog intentionally does not replace the repo's older mixed client/server analytics events.
- These challenge-flow events are separate and backend-owned by design.
