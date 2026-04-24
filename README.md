# Penny

Penny turns messy founder thinking into traceable product judgment. The v0 MVP lets a user capture a thought, extract claims, visualize the graph around those claims, inspect a selected node, rate confidence, search with Cmd+K, challenge an idea, and review the blocker surfaced by the challenge loop.

The active product surface is the Next.js app in `apps/web`. The active backend foundation lives in `server`: Drizzle migrations, PostgreSQL-backed command handlers, event emission, workspace projections, graph data, confidence ratings, search, and challenge/learn AI plumbing live there today.

Use this README as the top-level repo artifact. If it conflicts with older restart docs or archived files, trust this file and the live tree.

## Task artifact

- Artifact ID: `README-INIT-001`
- Queue item: `Initialize the first real task artifact.`
- Owner role: `BACKEND`
- Scope: keep this README as the durable restart contract for the active Penny tree, including setup, verification, backend surface, and active-vs-archive boundaries.
- Completion signal: a new role can start from this file, `AGENTS.md`, the shared context, `docs/queue.md`, and `docs/knowledge.md` without relying on stale restart notes.

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
- PostgreSQL 15+ reachable through `DATABASE_URL` or `DATABASE_DIRECT_URL`
- Local Postgres CLI tools for integration tests: `initdb`, `pg_ctl`, and `createdb`

## Quick start

1. Install dependencies.

   ```bash
   pnpm install
   ```

2. Create a local database.

   ```bash
   createdb penny
   ```

3. Copy and export local environment variables.

   ```bash
   cp .env.example .env.local
   set -a
   source .env.local
   set +a
   ```

   Drizzle commands read shell environment variables directly. Export `.env.local` in each new shell before running `pnpm db:migrate`, `pnpm db:seed`, or other database commands.

4. Apply the checked-in Drizzle migrations.

   ```bash
   pnpm db:migrate
   ```

5. Seed the local demo workspace.

   ```bash
   pnpm db:seed
   ```

6. Start the workspace.

   ```bash
   pnpm dev
   ```

7. Open the local surfaces.

- Next.js app: `http://localhost:3000/app?mode=brain`
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

1. Start in Brain and show the captured raw thought plus extracted claims.
2. Select the traceability claim and inspect its graph context, confidence, dependencies, contradiction marker, and recent activity.
3. Use Cmd+K to search for a claim or workspace item.
4. Switch to Challenge and request or review the critique.
5. Respond with Defend, Revise, or Absorb.
6. Switch to Learn to review the blocker explanation.
7. Return to Brain to show the same claim and map context carrying through.

The prepared walkthrough is in `docs/DEMO.md`.

If the database is empty instead of seeded, Brain shows a guided first-run state with sample prompts rather than hardcoded production demo data.

## Environment notes

- The active backend requires a Postgres URL with a `postgres://` or `postgresql://` scheme.
- Command and workspace routes require a UUID user header: send `x-user-id` or `x-penny-user-id`.
- There is no anonymous fallback user in the current route auth helper.
- Optional seed override env vars are only needed when changing the demo identity:
  - `PENNY_SEED_USER_ID`
  - `PENNY_SEED_USER_EMAIL`
  - `PENNY_SEED_USER_NAME`
- Optional provider and tracing env vars are only needed for live AI/provider-focused work:
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL`
  - `OPENAI_CAPTURE_MODEL`
  - `OPENAI_CHALLENGE_MODEL`
  - `OPENAI_EXTRACT_CLAIMS_MODEL`
  - `OPENAI_BASE_URL`
  - `MOCK_AI_MODEL`
  - `ANTHROPIC_API_KEY`
  - `ANTHROPIC_CHALLENGE_MODEL`
  - `ANTHROPIC_BASE_URL`
  - `XAI_API_KEY`
  - `XAI_CHALLENGE_MODEL`
  - `XAI_BASE_URL`
  - `LANGFUSE_PUBLIC_KEY`
  - `LANGFUSE_SECRET_KEY`
  - `LANGFUSE_BASE_URL`
  - `PENNY_AUTO_GENERATE_CHALLENGE_CRITIQUE`
  - `PENNY_USE_PROVIDER_CHALLENGE_CRITIQUE`

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
  - `GET /api/graph`
  - `GET /api/search?q=`
  - `GET /api/confidence/:targetType/:targetId/history`
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

The locked MVP verification pass is:

```bash
pnpm typecheck
pnpm test:mvp
pnpm test:mvp-verification
```

As of 2026-04-24, those commands pass in the current workspace:

- `pnpm typecheck`: 3 packages passed
- `pnpm test:mvp`: 14 tests passed
- `pnpm test:mvp-verification`: 106 tests passed

The PostgreSQL `57P01` shutdown warnings in passing integration runs come from intentionally stopping temporary test clusters.

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
- The MVP checklist and freeze policy are in `docs/MVP.md`. New feature work is frozen for v0 MVP; only blocker fixes should land until the `v0-mvp` tag is created from a clean, verified commit.
- The AI path has provider adapters, routing policy, schemas, and prompt code; the v0 MVP demo does not require live provider credentials.
- Some older docs still reflect the earlier restart shell. When they disagree with the live code, prefer this README and the active tree over `_archive_old_restart/`.
