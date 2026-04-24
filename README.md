# Penny

Penny is a minimal monorepo restart with a Next.js web app, a Fastify API, and a shared TypeScript package. The current goal is a clean baseline that installs, runs, and verifies from a blank machine without any database, auth, AI, billing, or job-system dependencies.

## What is in this repo

- `apps/web`: Next.js App Router frontend with a simple restart landing page and backend health-check UI.
- `apps/api`: Fastify API exposing `GET /health`.
- `packages/shared`: shared TypeScript types used by both apps.
- `docs/architecture.md`: current system boundaries and restart scope.
- `docs/setup.md`: short local setup and verification notes.

## Requirements

- Node.js 20+
- `pnpm` 10+

## Quick start

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Copy the example environment file if you want explicit local values:

   ```bash
   cp .env.example .env
   ```

3. Start the workspace:

   ```bash
   pnpm dev
   ```

4. Open the local apps:

- Web: `http://localhost:3000`
- API health endpoint: `http://localhost:3001/health`

## Environment

The repo ships with a small `.env.example`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
API_HOST=0.0.0.0
API_PORT=3001
```

`apps/web` uses `NEXT_PUBLIC_API_BASE_URL` for the browser health-check request. `apps/api` uses `API_HOST` and `API_PORT` when starting the Fastify server.

## Workspace commands

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
```

These fan out through Turborepo to the web app, API, and shared package.

## Verification

After `pnpm dev` starts:

1. Visit `http://localhost:3000`.
2. Click `Check backend health`.
3. Confirm the UI shows this payload:

   ```json
   {
     "ok": true,
     "service": "penny-api"
   }
   ```

For non-interactive verification, run:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## Current boundaries

This restart is intentionally small. It does not currently include:

- a database
- authentication
- AI integrations
- billing
- background jobs
- legacy code imports
