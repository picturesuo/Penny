# Setup

## Requirements

- Node.js 20+
- pnpm 10+
- PostgreSQL 15+
- Postgres CLI tools for integration tests: `initdb`, `pg_ctl`, and `createdb`

## Install

```bash
pnpm install
```

## Environment

Copy the template and export it into the shell before running database commands:

```bash
cp .env.example .env.local
set -a
source .env.local
set +a
```

Required for local database-backed app work:

- `DATABASE_URL`
- `DATABASE_DIRECT_URL`

Local service defaults:

- `NEXT_PUBLIC_API_BASE_URL`
- `API_HOST`
- `API_PORT`

Optional seed overrides:

- `PENNY_SEED_USER_ID`
- `PENNY_SEED_USER_EMAIL`
- `PENNY_SEED_USER_NAME`

Optional AI and tracing variables:

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

The v0 MVP demo does not require live AI credentials.

## Database

For a local Postgres database:

```bash
createdb penny
pnpm db:migrate
pnpm db:seed
```

For Supabase, use the pooled connection string for `DATABASE_URL` and the direct connection string for `DATABASE_DIRECT_URL`. Include `?sslmode=require` on both URLs.

## Run Locally

```bash
pnpm dev
```

Open:

- `http://localhost:3000/app?mode=brain`
- `http://localhost:3001/health`

The seed creates the default demo user:

```txt
00000000-0000-4000-8000-000000000001
```

The frontend workspace uses that user for the local demo path, so no manual headers are needed in the browser.

## Verify

```bash
pnpm typecheck
pnpm test:mvp
pnpm test:mvp-verification
```

`pnpm test:mvp` and `pnpm test:mvp-verification` start temporary local Postgres clusters. The `57P01` shutdown warnings in passing runs are expected.
