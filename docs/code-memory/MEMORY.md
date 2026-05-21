# Penny Code Memory

This file is human-readable repo memory for Penny's Codebase Brain. It is source material for the DB index, so keep entries concise, factual, and easy for an agent to verify against code.

## Current System Shape

- Primary app code lives in `packages/brain`.
- Backend source is in `packages/brain/src` and uses a custom Node `Request`/`Response` router in `packages/brain/src/server.ts`.
- Frontend source is in `packages/brain/frontend/src` and uses React/Vite.
- Drizzle schema source is `packages/brain/src/db/schema.ts`; SQL migrations live in `drizzle`.
- Brain, Create, and Learn operate over the same persisted thinking graph and must keep working while Codebase Brain evolves.

## Codebase Brain Notes

- Codebase Brain scans tracked repo files with `git ls-files`, then applies Penny-specific source filters.
- Generated public assets, lockfiles, `node_modules`, build output, large binaries, and dependency noise are not source of truth for retrieval.
- The DB source of truth is the `codebase_scan_runs`, `code_files`, `code_chunks`, `code_symbols`, `code_imports`, `code_routes`, `code_tests`, `code_docs`, `code_findings`, and `code_memory_notes` tables.
- Use `/api/codebase/context` before broad edits so agents can retrieve the smallest useful files, chunks, routes, tests, and docs for a task.
- Update this memory file after major architectural changes that future agents should know before editing.
