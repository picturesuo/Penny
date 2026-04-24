# API

Penny's MVP API surface lives in the Next.js app under `apps/web/app/api`. The legacy Fastify service in `apps/api` only exposes the health endpoint and is not the domain write path.

All workspace command and projection routes require a UUID-valued `x-user-id` or `x-penny-user-id` header. Missing or invalid user headers return `401`.

## Read Projections

These routes return backend-shaped workspace views. The frontend should consume these projections instead of assembling canonical workspace state itself.

| Method | Route | Builder | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/workspace/shell` | `buildShellView` | Current workspace mode, selected map/claim IDs, and breadcrumb items. |
| `GET` | `/api/workspace/brain` | `buildBrainView` | Brain mode claim list, map summary, selected claim, and current workspace context. |
| `GET` | `/api/workspace/challenge` | `buildChallengeView` | Active claim, latest challenge round, and current critique state. |
| `GET` | `/api/workspace/learn` | `buildLearnView` | Learn mode context and selected claim with the current placeholder learn state. |

## Write Commands

These routes are the current server-side write surface for the MVP. Meaningful writes should go through these command handlers and emit durable `moves_events` rows.

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/commands/maps/create` | Create a map and establish workspace context. |
| `POST` | `/api/commands/claims/create` | Create a claim in an owned map. |
| `POST` | `/api/commands/challenge/request-critique` | Create or replay a challenge critique request for a challenge round. |
| `POST` | `/api/commands/challenge/respond` | Record the user's response to a challenge round. |

Command routes accept JSON request bodies. Idempotent commands can use an idempotency key from the route helper surface; duplicate-key behavior should preserve one logical write and replay the existing result.

## Boundaries

- PostgreSQL is the source of truth through the Drizzle schema and migrations.
- `apps/api` is retained for the health check only.
- AI provider execution is still early; provider-backed critique setup depends on the environment variables documented in `docs/setup.md`.
- Supabase auth is not implemented yet; request identity currently comes from the UUID request header.
