# Setup

## Requirements

- Node.js 20+ recommended
- pnpm 10+

## Install

```bash
pnpm install
```

## Environment

Set these before running the backend or AI verification suite:

- `DATABASE_URL`
- `DATABASE_DIRECT_URL`
- `ANTHROPIC_API_KEY`
- `XAI_API_KEY`
- `LANGFUSE_PUBLIC_KEY`
- `LANGFUSE_SECRET_KEY`

Optional local overrides:

- `ANTHROPIC_BASE_URL`
- `XAI_BASE_URL`
- `LANGFUSE_BASE_URL`

## Run locally

```bash
pnpm dev
```

This starts:

- `apps/web` on `http://localhost:3000`
- `apps/api` on `http://localhost:3001`

## Verify

- Visit `http://localhost:3000`
- Click the health check button
- Confirm the UI shows:

```json
{ "ok": true, "service": "penny-api" }
```
