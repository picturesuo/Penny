# Dogfood Runbook

Use this for Penny staging/private-alpha dogfood runs. The goal is to exercise Brain -> Create -> Export with real auth, Postgres, safe logs, import limits, and feedback capture.

## Preconditions

- A hosted Postgres database with backups enabled.
- HTTPS in front of the app.
- One exact frontend origin for `PENNY_CORS_ORIGINS`.
- A private access token and session secret, both at least 32 characters.
- No OAuth/connectors or broad document-ingestion work in this run.

## Environment

Set these in the deploy environment, not in shell history:

```sh
NODE_ENV=production
PENNY_DEPLOY_ENV=private-alpha
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<database>?sslmode=require
PENNY_AUTH_MODE=token
PENNY_API_TOKEN=<32+-character-random-token>
PENNY_SESSION_SECRET=<32+-character-random-secret>
PENNY_CORS_ORIGINS=https://<dogfood-host>
PENNY_RATE_LIMIT_MAX=120
PENNY_RATE_LIMIT_WINDOW_MS=60000
PENNY_AUTH_FAILURE_RATE_LIMIT_MAX=20
PENNY_AUTH_FAILURE_RATE_LIMIT_WINDOW_MS=60000
PENNY_TRUST_AUTH_HEADERS=false
PENNY_STRUCTURED_LOGS=true
PENNY_CREATE_MODEL_BACKED=false
```

Only add `PENNY_CREATE_MODEL_BACKED=true` with `XAI_API_KEY` when intentionally testing the model-backed Create provider.

## Deploy

Run from a clean checkout:

```sh
pnpm install
DATABASE_URL=<same-postgres-url> pnpm db:migrate
pnpm test
pnpm typecheck
pnpm build
pnpm start
```

Strict startup validation should fail fast if private-alpha auth, CORS, rate limit, Postgres, session secret, or model provider settings are unsafe.

## Dogfood Script

1. Log in with the private access token.
2. Open Brain and import one small text, markdown, ChatGPT, Claude, or already-extracted PDF-text source.
3. Confirm the import job completes and the Brain profile shows source count, memory count, provenance, and `trainingUse=false` posture.
4. Review at least two memories: mark one correct or boost it, and mark one wrong or forget it if appropriate.
5. Start Create from Brain.
6. Generate the five Create directions.
7. Open one direction detail and confirm the memory/source evidence matches imported context.
8. Select two directions, add a judgment comment, and update the artifact.
9. Export the coding-agent prompt.
10. Save export feedback as Useful or Not useful with at least one reason tag.
11. Confirm logs contain `brain.import`, `brain.retrieve`, `create.generate`, and `create.prompt_export` events without raw private text.

## Import Limits

Dogfood import rejects oversized material before it can overwhelm storage:

- Request body text fields: 2,000,000 characters.
- Normalized import text: 650,000 characters.
- Chunk count: 450 chunks.
- ZIP file count: 200 readable files.
- ZIP readable entry length: 650,000 characters.

If a real export exceeds those limits, split it outside Penny and import only the smallest useful source.

## Stop Conditions

Stop the run and record the issue if:

- Startup validation can be bypassed in private-alpha mode.
- Any log includes imported source text, retrieval query text, prompt text, token values, comments, or excerpts.
- Create claims hidden Gmail/Slack/messages/OAuth/global training access.
- A deleted source still appears in Create grounding.
- Export feedback is not persisted or is visible across scopes.
- `pnpm test`, `pnpm typecheck`, or `pnpm build` fails after the run.
