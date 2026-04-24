# API

Penny's MVP API surface lives in the Next.js app under `apps/web/app/api`. The legacy Fastify service in `apps/api` only exposes the health endpoint and is not the domain write path.

All workspace command, projection, and AI helper routes require a UUID-valued `x-user-id` or `x-penny-user-id` header. Missing or invalid user headers return `401`.

## Read Projections

These routes return backend-shaped workspace views. The frontend should consume these projections instead of assembling canonical workspace state itself.

| Method | Route | Builder | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/workspace/shell` | `buildShellView` | Current workspace mode, selected map/claim IDs, and breadcrumb items. |
| `GET` | `/api/workspace/brain` | `buildBrainView` | Brain mode claim list, map summary, selected claim, and current workspace context. |
| `GET` | `/api/workspace/challenge` | `buildChallengeView` | Current context, active claim, latest challenge round, critique state/payload, and recorded response state. |
| `GET` | `/api/workspace/learn` | `buildLearnView` | Learn mode context, selected claim, and the MVP placeholder status/message. |
| `GET` | `/api/graph` | `graph_nodes` + `graph_edges` | Persisted graph payload as `{ nodes, edges }` for the authenticated user, with optional `sessionId`, `mapId`, and `type` query filters. |
| `GET` | `/api/graph/nodes/:id/detail` | `graph_nodes` + `graph_edges` + `confidence_ratings` | Authenticated graph node detail with the node, incoming/outgoing edges, and confidence ratings. |
| `GET` | `/api/search?q=` | `maps` + `claims` + `thoughts` + `sessions` | Authenticated global search for command-palette results across owned workspace records. Each result has `id`, `type`, `title`, `subtitle`, `confidence`, and `href`. |
| `GET` | `/api/confidence/:targetType/:targetId/history` | `confidence_ratings` | Authenticated confidence history for one owned thought, claim, or graph node. |

## Write Commands

These routes are the current server-side write surface for the MVP. Meaningful writes should go through these command handlers and emit durable `moves_events` rows.

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/commands/maps/create` | Create a map and establish workspace context. |
| `POST` | `/api/commands/claims/create` | Create a claim in an owned map. |
| `POST` | `/api/commands/workspace/select` | Update the current workspace mode and selected map/claim context. |
| `POST` | `/api/commands/challenge/request-critique` | Create or replay a challenge critique request for a challenge round. |
| `POST` | `/api/commands/challenge/respond` | Record the user's response to a challenge round. |
| `POST` | `/api/confidence` | Record a confidence rating for one owned thought, claim, or graph node. |
| `POST` | `/api/graph/edges` | Create or replay a persisted graph edge between two owned graph nodes. |
| `PATCH` | `/api/graph/edges/:id` | Update mutable fields on an owned persisted graph edge. |
| `DELETE` | `/api/graph/edges/:id` | Delete an owned persisted graph edge. |

Command routes accept JSON request bodies. Idempotent commands can use an idempotency key from the route helper surface; duplicate-key behavior should preserve one logical write and replay the existing result.
`POST /api/confidence` accepts exactly one target ID (`thoughtId`, `claimId`, or `graphNodeId`) plus exactly one rating field (`confidence` as `0..100` percent or `ratingBps` as `0..10000` basis points).
`GET /api/confidence/:targetType/:targetId/history` accepts `thought`, `claim`, or `graphNode` target types and returns `{ target, history }` with newest ratings first.

## AI Helpers

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/ai/challenge-idea` | Return a compact challenge/learn response for `{ thoughtId?, claimId?, text? }`: strongest objection, hidden assumption, counterexample, better version, and confidence question. Successful calls are logged to `ai_jobs` and `activity_events`. |
| `POST` | `/ai/explain-blocker` | Return a compact Learn response for `{ text, sessionId? }`: likely blocker, missing concept, simpler explanation, and next exercise. Successful calls are logged to `ai_jobs` and `activity_events`. |
| `POST` | `/ai/summarize-map` | Return a compact map summary for `{ mapId }`: summary, key claims, tensions, and next questions. Successful calls are logged to `ai_jobs` and `activity_events`. |

## Boundaries

- PostgreSQL is the source of truth through the Drizzle schema and migrations.
- `apps/api` is retained for the health check only.
- AI provider execution is still early; provider-backed critique setup depends on the environment variables documented in `docs/setup.md`.
- Supabase auth is not implemented yet; request identity currently comes from the UUID request header.
