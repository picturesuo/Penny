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
PENNY_DEPLOY_ENV=private-alpha
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<database>?sslmode=require
PENNY_AUTH_MODE=token
PENNY_API_TOKEN=<32+-character-random-token>
PENNY_SESSION_SECRET=<32+-character-random-secret>
PENNY_CORS_ORIGINS=https://<alpha-host>
PENNY_RATE_LIMIT_MAX=120
PENNY_TRUST_AUTH_HEADERS=false
PENNY_STRUCTURED_LOGS=true
PENNY_CREATE_MODEL_BACKED=false
```

Startup validation is strict when `NODE_ENV=production` or `PENNY_DEPLOY_ENV` is `staging`, `production`, or `private-alpha`. Strict startup refuses dev auth, missing/short tokens, missing/short session secrets, wildcard CORS, local/non-Postgres database URLs, disabled rate limits, trusted auth headers, and model-backed Create without `XAI_API_KEY`.

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

The Brain memory persistence migration is `drizzle/0029_add_brain_memory_persistence.sql`. Create export feedback is stored by `drizzle/0030_add_create_export_feedback.sql`.

## Auth And CORS

Private alpha should use token auth:

```sh
PENNY_AUTH_MODE=token
PENNY_API_TOKEN=<long-random-token>
PENNY_SESSION_SECRET=<long-random-secret>
```

`PENNY_TRUST_AUTH_HEADERS=true` should stay off unless a trusted reverse proxy owns user/workspace identity. In token mode, caller-supplied scope headers are ignored unless this flag is explicitly enabled.

Set `PENNY_CORS_ORIGINS` to the exact frontend origin for staging/production. Avoid `*` for private alpha.

## Observability And Privacy

Structured JSON logs are enabled by default for `PENNY_DEPLOY_ENV=staging`, `private-alpha`, or `production`, and can be forced with `PENNY_STRUCTURED_LOGS=true`.

Logged events intentionally keep raw private text out of payloads:

- `auth.failure`
- `brain.import`, `brain.retrieve`, `brain.memory_review`, `brain.source_delete`
- `create.generate`, `create.model_fallback`, `create.schema_validation_failure`, `create.prompt_export`

Operational payloads include status, ids, counts, provider mode, schema status, and export quality counts. They do not include imported source text, retrieval queries, prompt text, token values, comments, or excerpts.

Brain import dogfood limits:

- Request body text fields are capped at 2,000,000 characters.
- Normalized import text is capped at 650,000 characters.
- Imports that would create more than 450 chunks return a failed import job with guidance.
- ZIP imports inspect at most 200 files and reject a readable entry above 650,000 characters.

Post-export Create feedback is scoped and durable in `create_export_feedback`. It stores artifact/export ids, rating, reason tags, optional clipped comment, prompt completeness score, and scope columns.

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
9. Save Useful or Not useful export feedback with reason tags.
10. Confirm the exported prompt includes personal context, source/memory evidence, selected option history, acceptance tests, do-not-break list, and definition of done.
11. Confirm structured logs show the import, Create generation, prompt export, and auth failure events without raw private content.
