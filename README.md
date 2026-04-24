# Penny

Penny is currently a Turbo workspace in transition. The older restart shell is still present, but the repo now also contains the first backend foundation slice: Drizzle migrations, PostgreSQL-backed command handlers, event emission, and workspace projection routes.

Use this README as the current top-level artifact for the repo. If it conflicts with older restart docs, trust this file and the live tree.

## Current layout

- `apps/web`: Next.js App Router app with the current command and workspace API routes under `app/api`
- `server`: backend logic shared by the web routes, including `commands`, `events`, `projections`, `db`, and `auth`
- `drizzle`: checked-in PostgreSQL migrations and metadata for the Phase 1 backend tables
- `tests`: command, projection, and integration coverage for the backend slice
- `apps/api`: legacy Fastify health-check service still wired into the workspace
- `packages/shared`: shared TypeScript package
- `_archive_old_restart/`: historical reference only, not part of the active implementation surface

## Requirements

- Node.js 20+
- `pnpm` 10+
- PostgreSQL available through `DATABASE_URL` or `DATABASE_DIRECT_URL`
- Local Postgres CLI tools if you want to run the integration tests as written (`initdb`, `pg_ctl`, `createdb`)

## Quick start

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Set a Postgres connection string for the backend slice:

   ```bash
   export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/penny
   export DATABASE_DIRECT_URL="$DATABASE_URL"
   ```

3. Apply the checked-in migrations:

   ```bash
   pnpm db:migrate
   ```

4. Start the workspace:

   ```bash
   pnpm dev
   ```

5. Open the local surfaces:

- Next.js app: `http://localhost:3000`
- Fastify health endpoint: `http://localhost:3001/health`

## Current backend surface

The domain write path lives in the Next.js app, not the legacy Fastify service.

- Command routes:
  - `POST /api/commands/maps/create`
  - `POST /api/commands/claims/create`
  - `POST /api/commands/challenge/request-critique`
- Workspace projection routes:
  - `GET /api/workspace/shell`
  - `GET /api/workspace/brain`
  - `GET /api/workspace/challenge`
  - `GET /api/workspace/learn`
- Core tables in `server/db/schema.ts` and `drizzle/`:
  - `maps`
  - `claims`
  - `workspace_contexts`
  - `challenge_rounds`
  - `challenge_critiques`
  - `moves_events`

Requests can supply `x-user-id` or `x-penny-user-id`; if neither header is present, the current auth helper falls back to a fixed placeholder UUID for local development.

## Workspace commands

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm db:generate
pnpm db:migrate
pnpm db:typecheck
pnpm test:integration
```

## Verification

For a minimal backend sanity pass, run:

```bash
pnpm db:typecheck
pnpm test:integration
```

For a broader workspace pass, run:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## Current boundaries

This repo is not yet a finished single-app deployment shape. The current state is:

- the active backend logic lives in `apps/web` and `server`, while `apps/api` still exists from the earlier restart shell
- database access is wired through Drizzle and Postgres, but real Supabase auth is not implemented yet
- AI behavior and job orchestration are placeholders only
- the homepage and older docs still reflect the earlier restart and have not all caught up to the backend foundation
