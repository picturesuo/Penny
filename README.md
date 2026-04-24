# Penny

Penny is being rebuilt as a small, PostgreSQL-backed Next.js app. The current tracked baseline is intentionally narrow: a default Next app shell, a Drizzle event-store table, and the first command handlers for map creation and workspace selection.

This README is the restart artifact for the active tree. Treat untracked restart/archive directories as historical or local context unless they are deliberately promoted into tracked source.

## Current Surface

- `app/`: Next.js App Router shell. The home page is still the generated starter page.
- `server/db/schema.ts`: Drizzle schema for `moves_events`, the append-only domain event table.
- `drizzle/`: generated SQL migration artifacts for the current schema.
- `server/commands/create-map.ts`: validates and records a map creation command plus a `map.created` event through a repository boundary.
- `server/commands/set-workspace-selection.ts`: validates Brain / Challenge / Learn workspace selection, checks map and claim ownership through a repository boundary, upserts context, and emits `workspace.selection.changed`.
- `tests/commands/`: node:test coverage for the current command contracts.

There are no tracked HTTP API command routes yet in this baseline. Command behavior is currently exercised as server modules.

## Requirements

- Node.js 20 or newer.
- npm, using the tracked `package-lock.json`.
- PostgreSQL only when running Drizzle migration commands against a real database.

## Setup

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Database

Drizzle commands require `DATABASE_DIRECT_URL` or `DATABASE_URL`.

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/penny npm run db:migrate
```

Useful database commands:

```bash
npm run db:typecheck
npm run db:generate
npm run db:migrate
```

`db:typecheck` does not require a database connection. `db:generate` and `db:migrate` load `drizzle.config.ts`, so they fail fast when no database URL is configured.

## Verification

Run the current command test suite:

```bash
npm run test:commands
```

Run focused database type checking:

```bash
npm run db:typecheck
```

Run the standard Next checks:

```bash
npm run lint
npm run build
```

## Boundaries

- PostgreSQL-backed Drizzle schema and migrations are the persistence contract.
- Command handlers own meaningful writes and emit domain events.
- Brain, Challenge, and Learn are represented today by the `setWorkspaceSelection` command contract, not by separate source-of-truth stores.
- AI providers, projections, jobs, auth, and HTTP route wiring are scaffold areas unless a tracked implementation is added.
