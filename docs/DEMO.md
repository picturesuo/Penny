# Penny v0 MVP Demo Script

## Setup

```bash
pnpm install
createdb penny
cp .env.example .env.local
set -a
source .env.local
set +a
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open `http://localhost:3000/app?mode=brain`.

## Script

1. Brain: show the seeded workspace, raw founder thought, and extracted claims.
2. Graph: select the traceability claim and show the connected thought, supporting claim, dependency, contradiction marker, confidence, and recent activity in the inspector.
3. Search: open Cmd+K, search for a seeded claim, and confirm it jumps back into the workspace context.
4. Confidence: show the confidence history and the current rating for the selected claim.
5. Challenge: switch to Challenge, review or request the critique, and point out the strongest counterargument.
6. Response: choose Defend, Revise, or Absorb to record how the user handles the critique.
7. Learn: switch to Learn and show the blocker explanation tied to the same idea.
8. Return: switch back to Brain and confirm the same map and claim are still selected.

## Close

Penny's v0 loop is: capture a thought, extract claims, visualize the belief graph, inspect evidence and contradictions, rate confidence, challenge the idea, and learn the blocker without losing workspace context.

## Reset

The seed is idempotent. To reset the demo data after changing the database:

```bash
pnpm db:migrate
pnpm db:seed
```
