# Penny

Penny is a Turbo monorepo in transition. The active backend foundation lives in `apps/web` and `server`: Drizzle migrations, PostgreSQL-backed command handlers, event emission, workspace projections, and the first challenge-critique AI plumbing all live there today.

Use this README as the top-level repo artifact. If it conflicts with older restart docs or archived files, trust this file and the live tree.

## What is active

- `apps/web`: Next.js App Router app with the active command and workspace routes under `app/api`
- `server`: shared backend logic for commands, projections, auth, AI operations, idempotency, events, and DB access
- `drizzle`: checked-in PostgreSQL migrations and metadata for the current backend tables
- `tests`: command, projection, AI, and integration coverage for the active backend slice
- `packages/shared`: shared TypeScript package used by both apps
- `apps/api`: legacy Fastify service that currently exposes only `GET /health`
- `_archive_old_restart/`: historical reference only; not part of the active implementation surface

## Requirements

- Node.js 20+
- `pnpm` 10+
- PostgreSQL reachable through `DATABASE_URL` or `DATABASE_DIRECT_URL`
- Local Postgres CLI tools if you want to run the integration tests as written: `initdb`, `pg_ctl`, and `createdb`

## Quick start

1. Install dependencies.

   ```bash
   pnpm install
   ```

2. Point the backend at Postgres.

   ```bash
   export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/penny
   export DATABASE_DIRECT_URL="$DATABASE_URL"
   ```

3. Apply the checked-in Drizzle migrations.

   ```bash
   pnpm db:migrate
   ```

4. Seed the local demo workspace.

   ```bash
   pnpm db:seed
   ```

5. Start the workspace.

   ```bash
   pnpm dev
   ```

6. Open the local surfaces.

- Next.js app: `http://localhost:3000`
- Fastify health endpoint: `http://localhost:3001/health`

## Local demo path

For the MVP demo, run the migrations and seed before starting the app:

```bash
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Then open `http://localhost:3000/app?mode=brain`.

The seed creates the local demo user used by the frontend workspace headers: `00000000-0000-4000-8000-000000000001`. No manual API headers or database edits are needed after the seed.

Suggested demo flow:

1. Start in Brain and inspect the seeded Penny workspace.
2. Use the selected claim as the bridge into Challenge.
3. Request critique and respond with Defend, Revise, or Absorb.
4. Switch to Learn to review the concept/blocker surface.
5. Return to Brain to show the same claim and map context carrying through.

If the database is empty instead of seeded, Brain shows a guided first-run state with sample prompts rather than hardcoded production demo data.

## Environment notes

- The active backend requires a Postgres URL with a `postgres://` or `postgresql://` scheme.
- Command and workspace routes require a UUID user header: send `x-user-id` or `x-penny-user-id`.
- There is no anonymous fallback user in the current route auth helper.
- Optional provider and tracing env vars are only needed for the live AI path or provider-focused work:
  - `ANTHROPIC_API_KEY`
  - `XAI_API_KEY`
  - `LANGFUSE_PUBLIC_KEY`
  - `LANGFUSE_SECRET_KEY`
  - Optional base URL overrides: `ANTHROPIC_BASE_URL`, `XAI_BASE_URL`, `LANGFUSE_BASE_URL`

## Current backend surface

The domain write path lives in the Next.js app, not the legacy Fastify service.

- Command routes:
  - `POST /api/commands/maps/create`
  - `POST /api/commands/claims/create`
  - `POST /api/commands/workspace/select`
  - `POST /api/commands/challenge/request-critique`
  - `POST /api/commands/challenge/respond`
- Workspace projection routes:
  - `GET /api/workspace/shell`
  - `GET /api/workspace/brain`
  - `GET /api/workspace/challenge`
  - `GET /api/workspace/learn`
- Core tables defined in `server/db/schema.ts` and migrated from `drizzle/`:
  - `maps`
  - `claims`
  - `workspace_contexts`
  - `challenge_rounds`
  - `challenge_critiques`
  - `moves_events`

## Useful commands

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm db:typecheck
pnpm test:integration
pnpm test:mvp
pnpm test:mvp-verification
```

## Verification

For a doc-only check on this artifact, run:

```bash
git diff --check -- README.md
```

For a minimal backend sanity pass, run:

```bash
pnpm db:typecheck
pnpm test:integration
```

For a broader repo pass, run:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

As of 2026-04-24, `pnpm typecheck` is still expected to fail in `@penny/web` on `.ts` import suffix handling and one challenge critique state typing mismatch. Keep the command in the broader pass, but do not treat this README as claiming the repo-wide typecheck is green yet.

Run `pnpm test:mvp-verification` when you want the longer command, projection, route, and AI-contract suite rather than the smaller integration-only pass.

## Final MVP checklist

Use this as the last pre-demo pass after install, migrations, seed, and app startup:

- Onboarding loads and the Brain card opens Brain mode.
- A user can capture a thought, see it appear, and extract claims from it.
- The graph updates after claim extraction, a graph node can be selected, and the inspector reflects the selected node.
- Confidence can be rated and confidence history remains visible.
- Cmd+K opens the command palette, and search finds the captured thought or claim.
- Challenge mode can request critique for the selected claim.
- Learn mode can explain a blocker or missing concept.
- Switching Brain -> Challenge -> Learn -> Brain preserves the selected claim and map context.
- Console output is limited to useful CLI, request, and failure logs.
- No obvious dead code or duplicate component remains in the MVP path.

## Current boundaries

This repo is not yet a finished single-app deployment shape. The current state is:

- The active product/backend slice lives in `apps/web` and `server`, while `apps/api` remains a thin legacy health service.
- Database access is wired through Drizzle and Postgres, but full production auth and Supabase integration are not complete.
- The AI path has provider adapters, routing policy, schemas, and prompt code, but the overall product flow is still an early backend foundation rather than a finished user experience.
- Some older docs still reflect the earlier restart shell. When they disagree with the live code, prefer this README and the active tree over `_archive_old_restart/`.
