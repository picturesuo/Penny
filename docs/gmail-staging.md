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
7. Use Nango's test connection flow once with the staged Gmail account before testing Penny.
8. Confirm the Nango connection has the expected integration key and read-only Gmail scope.

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

Expected when configured: `configured=true`, `scopes=["https://www.googleapis.com/auth/gmail.readonly"]`, `private=true`, `privacy.trainingUse=false`.

Expected when env is incomplete: `Gmail not configured.`

## Manual Browser Smoke Checklist

Use a staged Gmail account with safe test messages. Include at least:

- One message with exact phrase `launch partner evidence`.
- One message from `alice@example.com`.
- One message with subject `Launch plan`.
- One message with an attachment.
- One spam or trash message that should not appear in default sync.
- One message that contradicts or rejects a product direction, for Create Critical evidence.

Checklist:

1. Open Brain.
2. Find the Gmail panel.
3. Verify the privacy copy is visible: `Penny reads Gmail only after consent. No human review. trainingUse=false. Delete/revoke removes retrieval access.`
4. Click `Connect Gmail`.
5. Complete Google OAuth for the staged test user.
6. Return to Penny and verify Gmail status is connected with only the `gmail.readonly` scope.
7. Click `Sync now`.
8. Verify message count and Gmail source count increase.
9. Verify spam/trash test messages are not imported by default.
10. Run keyword search for `launch partner evidence`.
11. Run keyword search using `from`, `to`, `subject`, `label`, `after`, `before`, and `hasAttachment`.
12. Verify keyword results show refs/snippets and do not create Brain memory unless `sync=true` is explicitly tested.
13. Run semantic search for the staged concept.
14. Verify semantic results come only from synced Gmail memory and show subject, sender, date, snippet, messageId, threadId, sourceRef, memoryRef, grounded/inferred label, and scoreReason.
15. Start Create with an idea that should use the staged email evidence.
16. Select Personal and Critical options when relevant.
17. Open the evidence/details drawer and verify Gmail source refs appear only when actually used.
18. Export the prompt and verify Gmail-derived personal context appears only when the selected Create result used that Gmail evidence.
19. Click `Revoke`.
20. Verify Sync and Search return revoked/not connected behavior.
21. Delete the Gmail source.
22. Verify Gmail memory no longer appears in Brain retrieval, Create evidence, or prompt export.

Record the smoke result with:

- Date and environment.
- Staged Gmail account alias, not the real email if unnecessary.
- Nango integration key.
- Message count synced.
- Keyword query used.
- Semantic query used.
- Create rough idea used.
- Revoke/delete result.
- Any failures or screenshots.

## Acceptance Evidence

Before marking Gmail staging ready, attach or record:

- `pnpm typecheck`, `pnpm test`, and `pnpm build` output.
- Gmail status response before and after OAuth.
- Sync response showing imported count and cursor/historyId.
- Keyword search response proving Gmail `q` search.
- Semantic search response proving synced Penny memory retrieval and no raw numeric score in normal UI.
- Create export prompt showing real Gmail evidence only when selected and used.
- Revoke response and post-revoke search/sync failure.
- Source delete result and post-delete Brain/Create retrieval absence.

