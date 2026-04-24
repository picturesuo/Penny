# Setup

## Requirements

- Node.js 20+ recommended
- pnpm 10+

## Install

```bash
pnpm install
```

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
