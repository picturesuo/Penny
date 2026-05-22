# Gmail Staging Runbook

This runbook moves the implemented Gmail connector from unit-tested core to a staged account check. Gmail remains a restricted Google scope and must not be enabled for public production use until Google app verification, domain ownership, privacy documentation, and any required security assessment are complete.

## Scope And Gate

Penny requests only:

```text
https://www.googleapis.com/auth/gmail.readonly
```

Do not add `gmail.modify`, `gmail.compose`, `gmail.send`, or `https://mail.google.com/`.

Production and private-alpha deployments must keep Gmail disabled unless both gates are explicitly true:

```text
ENABLE_GMAIL_CONNECTOR=true
ENABLE_RESTRICTED_GOOGLE_SCOPES=true
```

If the Gmail env is incomplete, the API and UI must report `Gmail not configured.`

## Google Cloud Setup

1. Create or select a Google Cloud project for Penny staging.
2. Enable the Gmail API.
3. Configure the OAuth consent screen:
   - App type: External for a normal Gmail test account, or Internal for a Google Workspace-only staging account.
   - App name: Penny Staging.
   - User support email: a monitored team address.
   - Developer contact email: a monitored team address.
   - Add the Gmail readonly scope: `https://www.googleapis.com/auth/gmail.readonly`.
   - Add test users for every staged Gmail account that will connect before verification.
4. Create an OAuth client:
   - Application type: Web application.
   - Authorized redirect URI for Nango Cloud: `https://api.nango.dev/oauth/callback`.
   - If using a custom Nango callback domain, register the callback URL displayed in the Nango integration settings instead.
5. Save the Google client ID and client secret in the Nango integration, not in Penny source control.

References:
- Nango Google integration setup: https://docs.nango.dev/integrations/all/google
- Nango integration setup guide: https://docs.nango.dev/implementation-guides/api-auth/configure-integration

## Nango Setup

1. In Nango, create a dedicated Gmail integration for staging.
2. Provider: Google.
3. Unique key: choose a stable value such as `google-gmail-staging`.
4. Client ID and client secret: use the Google OAuth client from the previous section.
5. Scopes: exactly `https://www.googleapis.com/auth/gmail.readonly`.
6. Verify the callback URL shown in the Nango settings is also listed on the Google OAuth client.
7. Configure the Nango environment auth webhook URL to Penny:

   ```text
   https://<penny-staging-host>/api/connectors/google/nango-webhook
   ```

   For a local OAuth smoke, expose the local Penny API with a secure tunnel and use the tunnel URL for this webhook. Plain `localhost` will not receive Nango Cloud webhooks.
8. Keep the Nango webhook signing secret aligned with Penny's `NANGO_SECRET_KEY`. Penny verifies the `x-nango-hmac-sha256` signature before accepting auth webhooks.
9. Use Nango's test connection flow once with the staged Gmail account before testing Penny.
10. Confirm the Nango connection has the expected integration key and read-only Gmail scope.
11. After a Penny-initiated OAuth completion, confirm Nango delivered an `auth` webhook with `operation=creation` or `operation=override`, `success=true`, the Gmail integration key, and tags or end-user data for the same Penny user/workspace scope.

## Penny Env

Local `.env.local` or staging secret store:

```bash
ENABLE_GOOGLE_CONNECTOR=true
ENABLE_GMAIL_CONNECTOR=true
ENABLE_RESTRICTED_GOOGLE_SCOPES=true
NANGO_SECRET_KEY=<nango-secret-key>
NANGO_PUBLIC_KEY=<nango-public-key>
NANGO_BASE_URL=https://api.nango.dev
NANGO_GMAIL_INTEGRATION_ID=google-gmail-staging
PENNY_AUTH_MODE=dev
PENNY_CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

For DB-backed staging, also set:

```bash
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<database>?sslmode=require
PENNY_AUTH_MODE=token
PENNY_API_TOKEN=<32+-character-random-token>
PENNY_SESSION_SECRET=<32+-character-random-secret>
PENNY_CORS_ORIGINS=https://<staging-host>
PENNY_TRUST_AUTH_HEADERS=false
PENNY_RATE_LIMIT_MAX=120
```

Do not set `PENNY_SKIP_DATABASE_PREP=true` in staging or production.

## Staging Readiness Check

Before opening OAuth, run the sanitized readiness checker against the same API instance and same user/workspace scope that will perform the Gmail smoke:

```bash
BASE_URL=https://<staging-host> \
GMAIL_READINESS_ENV_FILE=.env.local \
GMAIL_READINESS_REQUIRE_STAGING=true \
GMAIL_READINESS_EVIDENCE_FILE=tmp/gmail-readiness-evidence.json \
GMAIL_READINESS_USER_ID=<same-user-id> \
GMAIL_READINESS_WORKSPACE_ID=<same-workspace-id> \
GMAIL_READINESS_PROJECT_ID=<same-project-id> \
GMAIL_READINESS_SPHERE_ID=<same-sphere-id> \
node scripts/check-gmail-staging-readiness.mjs
```

Use `GMAIL_READINESS_ENV_FILE=.env.local` for local or staged hosts where Penny env is stored in a file. Existing shell environment variables still win over values from the file. The checker reports only whether required secrets are present, never their values.

Use `GMAIL_READINESS_EVIDENCE_FILE=tmp/gmail-readiness-evidence.json` to save the same sanitized JSON that the checker prints. Keep this file with the later smoke evidence so setup failures and successful connect-session preflight results are auditable without raw secrets.

The checker verifies:

- `ENABLE_GOOGLE_CONNECTOR`, `ENABLE_GMAIL_CONNECTOR`, and `ENABLE_RESTRICTED_GOOGLE_SCOPES` are true.
- `NANGO_SECRET_KEY`, `NANGO_PUBLIC_KEY`, `NANGO_BASE_URL`, and `NANGO_GMAIL_INTEGRATION_ID` are present, with no placeholder values.
- `PENNY_SKIP_DATABASE_PREP` is not true.
- In strict staging mode, `BASE_URL` is HTTPS unless loopback, `DATABASE_URL` is present, `PENNY_AUTH_MODE=token`, `PENNY_API_TOKEN` and `PENNY_SESSION_SECRET` are long enough, `PENNY_CORS_ORIGINS` includes the exact `BASE_URL` origin without wildcards, `PENNY_RATE_LIMIT_MAX` is bounded, and `PENNY_TRUST_AUTH_HEADERS=false`.
- `/api/connectors/google` and `/api/connectors/google/gmail/status` are configured, expose exactly `gmail.readonly`, report restricted/private/gated state, and do not leak connector internals or raw email-shaped fields.

To also prove Penny can create a Gmail-only Nango connect session before the browser OAuth step, add:

```bash
GMAIL_READINESS_CONNECT_PREFLIGHT=true
```

The connect-session readiness output records only sanitized facts such as `connectLinkHost`, `connectLinkPresent`, `tokenPresent`, and `expiresAtPresent`. It must not contain the raw connect link, session token, Nango secret, API token, or email body text.

Verify readiness evidence before treating it as setup proof:

```bash
node --check scripts/verify-gmail-readiness-evidence.mjs
node scripts/verify-gmail-readiness-evidence.mjs tmp/gmail-readiness-evidence.json --strict-staging
```

If the readiness run included `GMAIL_READINESS_CONNECT_PREFLIGHT=true`, require that evidence too:

```bash
node scripts/verify-gmail-readiness-evidence.mjs tmp/gmail-readiness-evidence.json --strict-staging --connect-preflight
```

For a failed setup gate that you need to attach as blocker evidence, verify only the sanitizer and failure shape:

```bash
node scripts/verify-gmail-readiness-evidence.mjs tmp/gmail-readiness-evidence.json --allow-failure
```

## Local Staging Run

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

Open `http://localhost:3000`. If the API is on a different port, set `PENNY_API_ORIGIN` before starting the frontend dev server.

Quick API readiness check:

```bash
curl -sS http://localhost:3000/api/connectors/google/gmail/status | jq .
```

Expected when configured: `configured=true`, `scopes=["https://www.googleapis.com/auth/gmail.readonly"]`, `restrictedScope=true`, `gated=true`, `private=true`, `privacy.trainingUse=false`, `privacy.rawRetentionDefault=false`, and `privacy.noHumanReview=true`.

Expected when env is incomplete: `Gmail not configured.`

## Manual Browser Smoke Checklist

Use a staged Gmail account with safe test messages. Include at least:

- One message with exact phrase `launch partner evidence`.
- One message from `alice@example.com`.
- One message with subject `Launch plan`.
- One message with an attachment.
- One oversized disposable message, if available, to confirm Penny reports a partial failure instead of importing it.
- One spam or trash message that should not appear in default sync.
- One message that contradicts or rejects a product direction, for Create Critical evidence.

Checklist:

1. Open Brain.
2. Find the Gmail panel.
3. Verify the privacy copy is visible: `Penny reads Gmail only after consent. No human review. trainingUse=false. Delete/revoke removes retrieval access.`
4. Click `Connect Gmail`.
5. Complete Google OAuth for the staged test user.
6. Confirm the Nango auth webhook was delivered to `/api/connectors/google/nango-webhook`; Penny should persist the connection and start `google-gmail-messages`.
7. Return to Penny and verify Gmail status is connected with only the `gmail.readonly` scope.
8. If multiple Google accounts are connected in the same workspace, select the staged Gmail account before sync, search, revoke, or delete.
9. Click `Sync now`.
10. Verify message count and Gmail source count increase.
11. Verify spam/trash test messages are not imported by default.
12. If the staged mailbox includes an oversized disposable message, verify sync reports it in `partialFailures` with `stage=message_oversized` and does not create a Gmail source or Brain memory for that message.
13. Run keyword search for `launch partner evidence`.
14. Run keyword search using `from`, `to`, `subject`, `label`, `after`, `before`, and `hasAttachment`.
15. Verify keyword results show refs/snippets and do not create Brain memory unless `sync=true` is explicitly tested.
16. Run semantic search for the staged concept.
17. Verify semantic results come only from synced Gmail memory and show subject, sender, date, snippet, messageId, threadId, sourceRef, memoryRef, grounded/inferred label, and scoreReason.
18. Start Create with an idea that should use the staged email evidence.
19. Select Personal and Critical options when relevant.
20. Open the evidence/details drawer and verify Gmail source refs appear only when actually used.
21. Export the prompt and verify Gmail-derived personal context appears only when the selected Create result used that Gmail evidence.
22. Click `Revoke`.
23. Verify Sync and Search return revoked/not connected behavior.
24. Delete the Gmail source.
25. Verify Gmail memory no longer appears in Brain retrieval, Create evidence, or prompt export.

Record the smoke result with:

- Date and environment.
- Staged Gmail account alias, not the real email if unnecessary.
- Nango integration key.
- Nango auth webhook delivery id/status, if available.
- Message count synced.
- Keyword query used.
- Semantic query used.
- Create rough idea used.
- Revoke/delete result.
- Any failures or screenshots.

## Local UI Preflight Without OAuth

When a real Gmail account is not available, run a browser preflight before changing staging code so the UI path stays visible and honest. This does not replace the staged OAuth proof.

Start Penny with Gmail configured but without real Nango credentials. This preflight still needs a migrated local or staging database because the first screen loads session, Brain, and Create routes before the Gmail card is inspected.

If the local database has not been migrated yet, run:

```bash
DATABASE_URL=<local-or-staging-postgres-url> pnpm db:migrate
```

Then start the app:

```bash
DATABASE_URL=<local-or-staging-postgres-url> \
PENNY_DEPLOY_ENV=local \
ENABLE_GOOGLE_CONNECTOR=true \
ENABLE_GMAIL_CONNECTOR=true \
ENABLE_RESTRICTED_GOOGLE_SCOPES=true \
NANGO_SECRET_KEY=nango-secret \
NANGO_PUBLIC_KEY=nango-public \
NANGO_BASE_URL=https://api.nango.test \
NANGO_GMAIL_INTEGRATION_ID=google-gmail \
PENNY_AUTH_MODE=dev \
PORT=3011 \
pnpm dev
```

Do not set `DATABASE_URL=` or `PENNY_SKIP_DATABASE_PREP=true` for this browser preflight. Those are useful for isolated route tests, but the real UI preflight should fail fast if the local database schema is missing. If the browser shows `DATABASE_URL is required` or a failed query against tables such as `sessions`, fix `DATABASE_URL` or run migrations before recording UI evidence.

Before opening the browser, run the API readiness check against the same app:

```bash
BASE_URL=http://localhost:3011 \
GMAIL_UI_PREFLIGHT_USER_ID=<same-user-id> \
GMAIL_UI_PREFLIGHT_WORKSPACE_ID=<same-workspace-id> \
GMAIL_UI_PREFLIGHT_PROJECT_ID=<same-project-id> \
GMAIL_UI_PREFLIGHT_SPHERE_ID=<same-sphere-id> \
node scripts/check-gmail-ui-preflight.mjs
```

The checker verifies that the Brain documents, Brain memory profile, Brain recents, Google provider, and Gmail status routes all load with the same scoped headers the browser will use. It fails fast if the local database is missing, if the Gmail connector is not configured, if Gmail does not expose exactly `gmail.readonly`, or if status/provider state exposes unsafe connector internals.

Open `http://localhost:3011` in a browser and verify:

- Brain opens and the Gmail card renders as configured/available.
- The Gmail card shows `gmail.readonly`, restricted scope, private, and the consent/privacy copy.
- Keyword search, semantic search, Sync now, Revoke, and Delete Gmail source are disabled until a Gmail account is connected.
- The keyword filter disclosure opens and shows `from`, `to`, `subject`, `label`, `after`, `before`, and `hasAttachment`.
- Google source coverage is visible and clearly marks the selected account state.
- Create opens from the top nav, shows context-light when no Brain memory exists, generates the five directions from a safe rough idea, renders Details buttons, artifact, verification, and enables Export prompt.

Record this as a UI preflight only. The actual staging proof still requires OAuth, sync, keyword search, semantic search, Gmail evidence in Create, export, revoke, and delete against a staged Gmail account.

## Automated Staging Smoke

Before or after OAuth, run the optional connect-session preflight to prove Penny can ask Nango for a Gmail-only connect session. This creates a Nango connect session but does not complete OAuth:

```bash
BASE_URL=http://localhost:3000 \
GMAIL_SMOKE_USER_ID=<same-user-id> \
GMAIL_SMOKE_WORKSPACE_ID=<same-workspace-id> \
GMAIL_SMOKE_PROJECT_ID=<same-project-id> \
GMAIL_SMOKE_SPHERE_ID=<same-sphere-id> \
GMAIL_SMOKE_CONNECT_PREFLIGHT_ONLY=true \
GMAIL_SMOKE_EVIDENCE_FILE=tmp/gmail-connect-preflight-evidence.json \
node scripts/smoke-gmail-staging.mjs
```

The preflight requires the Gmail status endpoint to be configured, then checks that `/api/connectors/google/gmail/connect` returns a Nango session with exactly `https://www.googleapis.com/auth/gmail.readonly`, `google_gmail` as the requested/requestable surface, `restrictedScope=true`, `gated=true`, `private=true`, and the Gmail scope audit reason. Smoke evidence records `connectLinkPresent`, `connectLinkHost`, `tokenPresent`, and `expiresAtPresent`; it must not record the raw connect link or session token.

Use `GMAIL_SMOKE_CONNECT_PREFLIGHT_ONLY=true` for a standalone pre-OAuth check. Use `GMAIL_SMOKE_CONNECT_PREFLIGHT=true` after OAuth if you want the full smoke to also verify that creating another connect session still returns Gmail-only scope metadata.

Verify standalone pre-OAuth evidence before treating it as setup evidence:

```bash
node --check scripts/verify-gmail-smoke-evidence.mjs
node scripts/verify-gmail-smoke-evidence.mjs tmp/gmail-connect-preflight-evidence.json --connect-preflight-only
```

After completing OAuth in the browser, run the non-destructive smoke against the same user/workspace scope:

```bash
BASE_URL=http://localhost:3000 \
GMAIL_SMOKE_USER_ID=<same-user-id> \
GMAIL_SMOKE_WORKSPACE_ID=<same-workspace-id> \
GMAIL_SMOKE_PROJECT_ID=<same-project-id> \
GMAIL_SMOKE_SPHERE_ID=<same-sphere-id> \
GMAIL_SMOKE_KEYWORD_TEXT="launch partner evidence" \
GMAIL_SMOKE_SEMANTIC_QUERY="launch partner evidence" \
GMAIL_SMOKE_EXPECT_CREATE_TEXT="launch partner evidence" \
GMAIL_SMOKE_EVIDENCE_FILE=tmp/gmail-smoke-evidence.json \
node scripts/smoke-gmail-staging.mjs
```

To prove Gmail query filters against the staged mailbox, add any of these to the same command:

```bash
GMAIL_SMOKE_KEYWORD_FROM=alice@example.com \
GMAIL_SMOKE_KEYWORD_TO=bob@example.com \
GMAIL_SMOKE_KEYWORD_SUBJECT="Launch plan" \
GMAIL_SMOKE_KEYWORD_LABEL=inbox \
GMAIL_SMOKE_KEYWORD_AFTER=2026-05-01 \
GMAIL_SMOKE_KEYWORD_BEFORE=2026-05-22 \
GMAIL_SMOKE_KEYWORD_HAS_ATTACHMENT=true
```

To prove an oversized-message skip or another expected partial failure against a staged mailbox that still imports at least one safe message, add the expected sanitized failure stage:

```bash
GMAIL_SMOKE_EXPECT_PARTIAL_FAILURE_STAGE=message_oversized
```

Without this opt-in, the smoke treats any sync partial failure as unexpected and fails. With this opt-in, both the first sync and repeated sync must report at least one sanitized partial failure with that exact `stage`; the evidence records only count/stage-match/sanitizer facts, not message bodies or raw failure payloads.

The automated smoke also uses the keyword text and filters for the initial sync, so the run imports only the staged safe-message slice rather than the first arbitrary mailbox page. The evidence file records the Gmail `q` string, the sync filters, and the keyword filters used, while checking both that keyword results are not stored by default and that `sync=true` explicitly stores through the same safe, duplicate-free import path.
Smoke evidence intentionally omits raw HTTP response bodies and raw email content; failure records use route/status/error-code summaries so the evidence file can be shared without exposing mailbox text. The smoke also checks the Gmail status endpoint and the general Google provider endpoint that the Brain UI loads; their state views must expose only connection selectors, minimal sync job fields, and source ids/URIs, not Gmail metadata, provenance, credential refs, cursor internals, or raw-retention fields.

Verify the non-destructive evidence file before treating it as acceptance evidence:

```bash
node --check scripts/verify-gmail-smoke-evidence.mjs
node scripts/verify-gmail-smoke-evidence.mjs tmp/gmail-smoke-evidence.json --min-messages=1
```

If the run included `GMAIL_SMOKE_CONNECT_PREFLIGHT=true`, require that evidence too:

```bash
node scripts/verify-gmail-smoke-evidence.mjs tmp/gmail-smoke-evidence.json --connect-preflight --min-messages=1
```

If staging uses token auth, also pass:

```bash
GMAIL_SMOKE_API_TOKEN=<penny-api-token>
```

If there are multiple Gmail connections in the same user/workspace scope, target one explicitly:

```bash
GMAIL_SMOKE_CONNECTION_ID=<nango-connection-id>
GMAIL_SMOKE_PROVIDER_CONFIG_KEY=<nango-gmail-integration-id>
```

When a selector is provided, the automated smoke uses it for sync, keyword search, semantic search, revoke, and delete checks. If multiple connected Gmail accounts are present and no selector is provided, the smoke fails instead of mixing evidence across accounts.

The default smoke verifies:

- Gmail status is configured, connected, restricted-scope gated, private, `gmail.readonly`, `trainingUse=false`, `rawRetentionDefault=false`, and `noHumanReview=true`.
- Gmail status and Google provider page-load state views do not expose Gmail message metadata, provenance, credential refs, cursor internals, raw body fields, or per-source training/raw-retention flags.
- Sync imports at least one message from the staged safe-message query/filter set and returns cursor/history evidence.
- By default, sync has zero partial failures. When `GMAIL_SMOKE_EXPECT_PARTIAL_FAILURE_STAGE=message_oversized` is set, sync proves the oversized message was skipped through a sanitized `stage=message_oversized` partial-failure summary while still importing the safe message slice.
- Repeating the same scoped sync does not change the Gmail source count or create duplicate source refs.
- Keyword search uses the Gmail API, does not store results without `sync=true`, and explicitly stores safely with `sync=true`.
- Semantic search returns only synced Gmail memory and hides raw numeric scores.
- Create uses the synced Gmail evidence.
- Prompt export includes the Gmail-derived context only after Create uses it.

The default smoke does not revoke or delete, because those are destructive for the staged connection. To run the full destructive end of the staging proof:

```bash
BASE_URL=http://localhost:3000 \
GMAIL_SMOKE_USER_ID=<same-user-id> \
GMAIL_SMOKE_WORKSPACE_ID=<same-workspace-id> \
GMAIL_SMOKE_PROJECT_ID=<same-project-id> \
GMAIL_SMOKE_SPHERE_ID=<same-sphere-id> \
GMAIL_SMOKE_KEYWORD_TEXT="launch partner evidence" \
GMAIL_SMOKE_SEMANTIC_QUERY="launch partner evidence" \
GMAIL_SMOKE_EXPECT_CREATE_TEXT="launch partner evidence" \
GMAIL_SMOKE_CONFIRM_MUTATIONS=true \
GMAIL_SMOKE_CONFIRM_DELETE=true \
GMAIL_SMOKE_EVIDENCE_FILE=tmp/gmail-smoke-evidence-full.json \
node scripts/smoke-gmail-staging.mjs
```

That destructive smoke revokes the Gmail connection, verifies sync, keyword search, and semantic search stop, deletes a synced Gmail source that appeared in semantic results, verifies Brain profile, `/api/brain/retrieve`, semantic search, and Create no longer reference the deleted source, and records a safe evidence summary without raw email body text. If the delete target cannot be tied to semantic Gmail memory, the destructive smoke fails instead of certifying a weaker delete.

Verify destructive evidence with:

```bash
node scripts/verify-gmail-smoke-evidence.mjs tmp/gmail-smoke-evidence-full.json --destructive --min-messages=1
```

The verifier fails if required smoke steps are missing, if repeated sync/source counts are unstable, if keyword search stores without `sync=true`, if semantic search exposes raw scores, if Create/export do not include the expected Gmail evidence, if revoke/delete postconditions are missing for destructive runs, or if the evidence JSON contains unsafe raw fields such as tokens, credential refs, metadata/provenance, raw bodies, or raw connect links.

After verifying individual files, verify the full staging evidence bundle so readiness and smoke files are from the same API and user/workspace/project/sphere scope:

```bash
node --check scripts/verify-gmail-staging-bundle.mjs
node scripts/verify-gmail-staging-bundle.mjs \
  --readiness=tmp/gmail-readiness-evidence.json \
  --smoke=tmp/gmail-smoke-evidence.json \
  --readiness-connect-preflight \
  --min-messages=1
```

When certifying the destructive end-to-end path, require the destructive evidence too:

```bash
node scripts/verify-gmail-staging-bundle.mjs \
  --readiness=tmp/gmail-readiness-evidence.json \
  --smoke=tmp/gmail-smoke-evidence.json \
  --destructive-smoke=tmp/gmail-smoke-evidence-full.json \
  --readiness-connect-preflight \
  --require-destructive \
  --min-messages=1
```

## Acceptance Evidence

Before marking Gmail staging ready, attach or record:

- `pnpm typecheck`, `pnpm test`, and `pnpm build` output.
- `node --check scripts/smoke-gmail-staging.mjs`.
- `node --check scripts/verify-gmail-smoke-evidence.mjs`.
- `node --check scripts/check-gmail-staging-readiness.mjs`.
- `node --check scripts/verify-gmail-readiness-evidence.mjs`.
- `node --check scripts/verify-gmail-staging-bundle.mjs`.
- `scripts/check-gmail-staging-readiness.mjs` output and `tmp/gmail-readiness-evidence.json` with `GMAIL_READINESS_REQUIRE_STAGING=true`, `GMAIL_READINESS_ENV_FILE=.env.local` when env is file-backed, and optional `GMAIL_READINESS_CONNECT_PREFLIGHT=true` output when certifying connect-session setup.
- `scripts/verify-gmail-readiness-evidence.mjs tmp/gmail-readiness-evidence.json --strict-staging`, plus `--connect-preflight` when the readiness run created a Nango connect session.
- `scripts/verify-gmail-smoke-evidence.mjs` output for every accepted non-destructive or destructive evidence file.
- `scripts/verify-gmail-staging-bundle.mjs --readiness=tmp/gmail-readiness-evidence.json --smoke=tmp/gmail-smoke-evidence.json`, plus `--destructive-smoke=tmp/gmail-smoke-evidence-full.json --require-destructive` when certifying revoke/delete.
- Optional `GMAIL_SMOKE_CONNECT_PREFLIGHT_ONLY=true` output plus `scripts/verify-gmail-smoke-evidence.mjs tmp/gmail-connect-preflight-evidence.json --connect-preflight-only` output proving connect-session creation with only sanitized connect-link evidence.
- Optional full-smoke `GMAIL_SMOKE_CONNECT_PREFLIGHT=true` output plus `scripts/verify-gmail-smoke-evidence.mjs tmp/gmail-smoke-evidence.json --connect-preflight --min-messages=1` output.
- Non-destructive `scripts/smoke-gmail-staging.mjs` output.
- Destructive `scripts/smoke-gmail-staging.mjs` output from a disposable staged Gmail account, when revoke/delete are being certified.
- Nango auth webhook delivery record showing Penny accepted the Gmail connection and started `google-gmail-messages`.
- Smoke evidence showing `statusStatePrivacySafe=true` and `providerStatePrivacySafe=true`.
- Gmail status response before and after OAuth.
- Sync and repeated-sync responses showing imported count, cursor/historyId, stable source counts, and no duplicate source refs.
- Keyword search responses proving Gmail `q` search, default no-store behavior, and explicit `sync=true` storage.
- Semantic search response proving synced Penny memory retrieval and no raw numeric score in normal UI.
- Create export prompt showing real Gmail evidence only when selected and used.
- Revoke response and post-revoke sync, keyword search, and semantic search failure.
- Source delete result and post-delete Brain profile, `/api/brain/retrieve`, semantic search, and Create retrieval absence.
