# Knowledge

## User-Provided Knowledge
- Read `AGENTS.md` at the start of each session and follow it unless the user explicitly overrides it.
- Use `/Users/bensuo/.codex/penny-shared-context.md` as the durable task artifact when it exists. Keep current-task state there, not in this file.
- Keep repo-visible changes small, path-limited, committed on `main`, and pushed to `origin/main` immediately after each coherent change.
- Challenge weak assumptions, ambiguous scope, and missing tradeoffs instead of accepting prompts or stale context at face value.

## Project Facts
- Project name: Penny.
- `docs/queue.md` is the lightweight task queue. `docs/knowledge.md` is only for durable, reusable project knowledge.
- Shared context sections owned by the active role may be updated directly, but historical logs and unrelated role-owned sections should not be rewritten.
- The repo-local operating model favors small reversible changes and one-file commits when work moves across files.
- Backend rule: PostgreSQL is the source of truth; Supabase is infrastructure, not product logic.
- Backend rule: Brain, Challenge, and Learn are projections over the same workspace state, not separate sources of truth.
- Backend rule: all meaningful writes go through server-side command handlers and record domain events.
- Backend rule: AI outputs must be typed, validated, versioned, and logged before they affect core truth.
- Backend rule: stable IDs are mandatory for core entities: `userId`, `sphereId`, `mapId`, `claimId`, `conceptId`, and `roundId`.
- Backend rule: do not introduce microservices, a graph database as the primary store, separate core tables per mode, or core truth stored only in JSON blobs.
- Frontend rule: the frontend must not invent canonical workspace context, breadcrumb, mode identity, or backend-derived state.
- Durable project fact: request rate limiting should be centralized in a shared server helper so server actions and route handlers cannot bypass the same abuse guard.
- Durable project fact: export has an open JSON, Markdown, and CSV schema with a portability guarantee for user-owned data.

## Retrieval Hints
- Search this file, the shared context file, and nearby repo docs with `rg` before broader search.
- Label each note by source when useful: `user`, `repo`, or `external`.
