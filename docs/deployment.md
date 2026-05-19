# Deployment Notes

Penny is a Vite frontend plus Node API. Private alpha deployments need the API, Postgres, auth, and static frontend assets together.

## Commands

Install:

```sh
pnpm install
```

Run local API and built frontend from one process:

```sh
pnpm dev:api
```

Run local frontend against the API:

```sh
pnpm dev:frontend
```

Build frontend assets into `packages/brain/public`:

```sh
pnpm build
```

Verify before deploy:

```sh
pnpm test
pnpm typecheck
pnpm build
```

Database migration:

```sh
pnpm db:migrate
```

## Required Environment

Development:

```sh
DATABASE_URL=postgresql://127.0.0.1:5432/penny
PENNY_AUTH_MODE=dev
PENNY_CORS_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:3000
PENNY_CREATE_MODEL_BACKED=false
```

Private alpha or production-like staging:

```sh
NODE_ENV=production
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<database>?sslmode=require
PENNY_AUTH_MODE=token
PENNY_API_TOKEN=<long-random-token>
PENNY_SESSION_SECRET=<long-random-secret>
PENNY_CORS_ORIGINS=https://<alpha-host>
PENNY_CREATE_MODEL_BACKED=false
```

Optional provider environment:

```sh
XAI_API_KEY=<xai-key>
XAI_MODEL=<optional-default-model>
XAI_CREATE_OPTION_MODEL=<optional-create-model>
```

## Model-Backed Create Flag

`PENNY_CREATE_MODEL_BACKED=false` is the private-alpha default.

Set `PENNY_CREATE_MODEL_BACKED=true` only when evaluating model-backed Create. It still requires `XAI_API_KEY`. If provider output fails, Penny falls back to deterministic Create and exposes provider mode, fallback reason, schema validation, memory/source counts, verification scores, and prompt quality signals in the Create UI/debug surfaces.

The xAI Create provider uses `store: false`. Penny must not claim Gmail, Slack, messages, OAuth, hidden memory, global training, or unsupported source access.

## Database Setup

Penny requires Postgres for private alpha. `DATABASE_URL` is required before API startup. Brain memory cannot silently use in-memory storage in production.

Run migrations against the same database URL used by the API:

```sh
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<database>?sslmode=require pnpm db:migrate
```

Startup migration behavior:

- `PENNY_AUTO_MIGRATE=true`: run migrations at API startup.
- `PENNY_AUTO_MIGRATE=false`: skip startup migrations; deploy must run `pnpm db:migrate` separately.
- Production defaults to no auto-migrate unless `PENNY_AUTO_MIGRATE=true`.
- `PENNY_SKIP_DATABASE_PREP=true` skips startup prep. Do not use it to bypass `DATABASE_URL` for private alpha.

The Brain memory persistence migration is `drizzle/0029_add_brain_memory_persistence.sql`.

## Auth And CORS

Private alpha should use token auth:

```sh
PENNY_AUTH_MODE=token
PENNY_API_TOKEN=<long-random-token>
PENNY_SESSION_SECRET=<long-random-secret>
```

`PENNY_TRUST_AUTH_HEADERS=true` should stay off unless a trusted reverse proxy owns user/workspace identity. In token mode, caller-supplied scope headers are ignored unless this flag is explicitly enabled.

Set `PENNY_CORS_ORIGINS` to the exact frontend origin for staging/production. Avoid `*` for private alpha.

## Production Blockers

Do not open a public demo until these are resolved or explicitly accepted:

- Real hosted Postgres with migrations applied.
- Token auth and rate limiting configured.
- HTTPS in front of the app.
- Backup/restore plan for Postgres.
- Durable Create storage if multiple private-alpha users need session continuity beyond the current process.
- Manual review that imported context, source previews, prompt exports, and logs do not expose another user's data.
- Clear operator access policy for logs and database.

## Smoke Check

After deploy:

1. Open the frontend and log in with the private access token.
2. Import the Penny demo fixture or a small ChatGPT export.
3. Confirm Brain profile source/memory counts and `trainingUse=false` copy.
4. Boost or mark one memory correct.
5. Start Create from Brain.
6. Generate five cards.
7. Select two or more cards, add a comment, and update the artifact.
8. Export the coding-agent prompt.
9. Confirm the exported prompt includes personal context, source/memory evidence, selected option history, acceptance tests, do-not-break list, and definition of done.
