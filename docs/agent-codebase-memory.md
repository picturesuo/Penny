# Agent Codebase Memory

Penny's Codebase Brain is a DB-backed repo index for agent context. It is not a product mode and it does not replace reading the exact file you are about to edit.

## Workflow

1. Run `POST /api/codebase/ingest` before large tasks, after pulling new code, or after meaningful repo-visible changes.
2. Use `POST /api/codebase/context` before editing. Ask with the task you are about to do, plus filters when useful.
3. Read the returned files and chunks before changing code. Treat retrieved tests, docs, routes, imports, and symbols as the starting context.
4. Use `POST /api/codebase/search` for narrower follow-up questions about files, routes, components, tests, docs, or symbols.
5. Use `POST /api/codebase/audit` to inspect the last scan, changed files, stale files, and top findings.

## Rules

- Never assume generated public assets are source of truth.
- Do not rely on `node_modules`, lockfile noise, build output, or large binary assets for source understanding.
- Prefer retrieved tests, docs, and route metadata before changing backend or frontend behavior.
- Keep graph and persistence invariants from `AGENTS.md` intact; Codebase Brain helps agents find context, it does not create Penny thinking-graph edges.
- Update `docs/code-memory/MEMORY.md` after major changes that future agents should know before a scan.
- If `docs/code-memory/MEMORY.md` changes, run ingest again so the DB index reflects the human-readable memory.

## Useful Requests

```http
POST /api/codebase/ingest
{}
```

```http
POST /api/codebase/context
{
  "query": "change Learn session route validation",
  "task": "Update Learn session route validation without breaking Create or Brain",
  "maxChunks": 10
}
```

```http
POST /api/codebase/search
{
  "query": "handleLearnSessionRequest tests",
  "filters": {
    "sourceKinds": ["backend_source", "test"]
  },
  "includeDependencies": true
}
```
