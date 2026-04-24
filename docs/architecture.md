# Architecture

Penny has been restarted as a minimal monorepo.

## Apps

- `apps/web`: a Next.js App Router frontend with a minimal homepage and a backend health checker UI.
- `apps/api`: a Fastify backend exposing `GET /health`.

## Shared package

- `packages/shared`: shared TypeScript types used by both apps.

## Current boundaries

- Database-backed backend foundation via Drizzle + Postgres
- No real auth
- Local challenge critique generation only; no external AI provider integration yet
- No billing
- No background jobs
- No legacy code imports

This restart is intentionally small so install, dev, build, lint, and typecheck can all work from a blank machine.
