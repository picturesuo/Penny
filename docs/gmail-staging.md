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
GMAIL_STAGING_RUN_ID=<shared-run-id> \
node scripts/check-gmail-staging-readiness.mjs
```

Use `GMAIL_READINESS_ENV_FILE=.env.local` for local or staged hosts where Penny env is stored in a file. Existing shell environment variables still win over values from the file. The checker reports only whether required secrets are present, never their values.

Use one `GMAIL_STAGING_RUN_ID` value for the readiness check, UI preflight, non-destructive smoke, destructive smoke, and full browser evidence JSON. The value must be a safe opaque slug, 3-80 characters, using only letters, numbers, dots, underscores, or hyphens, such as `gmail-staging-2026-05-22-a`. Do not use an email address, URL, account id, token, secret, or raw Nango value. The readiness, UI preflight, and smoke scripts reject unsafe run ids before API calls and omit unsafe values from failure evidence. The standalone readiness, smoke, and full browser evidence verifiers also reject unsafe run ids. The final staging bundle rejects mixed artifacts when this run id is missing, unsafe, or does not match.

Use `GMAIL_READINESS_EVIDENCE_FILE=tmp/gmail-readiness-evidence.json` to save the same sanitized JSON that the checker prints. Keep this file with the later smoke evidence so setup failures and successful connect-session preflight results are auditable without raw secrets.

Every readiness run starts by recording an `env.requiredPresence` check. This check is intentionally limited to booleans such as `nangoPublicPresent`, `nangoGmailIntegrationIdPresent`, `databaseUrlPresent`, `sessionSecretPresent`, `corsOriginsPresent`, and `rateLimitPresent`, so failed setup evidence can identify missing staging requirements before any API call without exposing secret values.

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
11. Verify imported Gmail source privacy is private, `trainingUse=false`, `rawContentStored=false`, and Brain profile `rawRetention=false`.
12. Verify spam/trash test messages are not imported by default.
13. If the staged mailbox includes an oversized disposable message, verify sync reports it in `partialFailures` with `stage=message_oversized` and does not create a Gmail source or Brain memory for that message.
14. Run keyword search for `launch partner evidence`.
15. Run keyword search using `from`, `to`, `subject`, `label`, `after`, `before`, and `hasAttachment`.
16. Verify keyword results show refs/snippets and do not create Brain memory unless `sync=true` is explicitly tested.
17. Run semantic search for the staged concept.
18. Verify semantic results come only from synced Gmail memory and show subject, sender, date, snippet, messageId, threadId, sourceRef, memoryRef, grounded/inferred label, and scoreReason.
19. Start Create with an idea that should use the staged email evidence.
20. Select Personal and Critical options when relevant.
21. Open the evidence/details drawer and verify Gmail source refs appear only when actually used.
22. Export the prompt and verify Gmail-derived personal context appears only when the selected Create result used that Gmail evidence.
23. Click `Revoke`.
24. Verify Sync and Search return revoked/not connected behavior.
25. Delete the Gmail source.
26. Verify Gmail memory no longer appears in Brain retrieval, Create evidence, or prompt export.

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
GMAIL_STAGING_RUN_ID=<shared-run-id> \
GMAIL_UI_PREFLIGHT_EVIDENCE_FILE=tmp/gmail-ui-preflight-evidence.json \
node scripts/check-gmail-ui-preflight.mjs
```

The checker verifies that the Brain documents, Brain memory profile, Brain recents, Google provider, and Gmail status routes all load with the same scoped headers the browser will use. It fails fast if the local database is missing, if the Gmail connector is not configured, if Gmail does not expose exactly `gmail.readonly`, or if status/provider state exposes unsafe connector internals.
When `GMAIL_UI_PREFLIGHT_EVIDENCE_FILE` is set, the checker writes the same sanitized success or failure JSON that it prints. Keep this file with manual browser screenshots or notes so UI preflight evidence records the exact API host and user/workspace/project/sphere scope without raw connect links, tokens, credential refs, or email body text.

Open `http://localhost:3011` in a browser and verify:

- Brain opens and the Gmail card renders as configured/available.
- The Gmail card shows `gmail.readonly`, restricted scope, private, and the consent/privacy copy.
- Keyword search, semantic search, Sync now, Revoke, and Delete Gmail source are disabled until a Gmail account is connected.
- The keyword filter disclosure opens and shows `from`, `to`, `subject`, `label`, `after`, `before`, and `hasAttachment`.
- Google source coverage is visible and clearly marks the selected account state.
- Create opens from the top nav, shows context-light when no Brain memory exists, generates the five directions from a safe rough idea, renders Details buttons, artifact, verification, and enables Export prompt.

The UI exposes stable browser-smoke selectors for this proof. Prefer these selectors in automation, and mention them in manual evidence when browser devtools or test output confirms them:

- Gmail: `gmail-connector-card`, `gmail-connect-button`, `gmail-privacy-copy`, `gmail-keyword-search-form`, `gmail-keyword-filters`, `gmail-filter-from`, `gmail-filter-to`, `gmail-filter-subject`, `gmail-filter-label`, `gmail-filter-after`, `gmail-filter-before`, `gmail-filter-has-attachment`, `gmail-keyword-search-button`, `gmail-semantic-search-form`, `gmail-semantic-search-button`, `gmail-sync-button`, `gmail-revoke-button`, `gmail-delete-source-button`, `gmail-keyword-results`, `gmail-keyword-result`, `gmail-semantic-results`, and `gmail-semantic-result`.
- Create: `create-workspace`, `create-brain-context`, `create-option-board`, `create-option-card`, `create-option-details-button`, `create-evidence-drawer`, `create-artifact-panel`, `create-export-panel`, and `create-export-prompt`.

Browser evidence is acceptable only when the notes or screenshots prove the visible UI state, not just route responses. Capture or describe:

- The Brain Gmail card with `gmail.readonly`, restricted/private copy, message count, and disabled Sync/Search/Revoke/Delete controls before OAuth.
- The keyword filter disclosure open with `from`, `to`, `subject`, `label`, `after`, `before`, and `hasAttachment`.
- After OAuth and sync, the connected Gmail card with message/source counts, enabled Sync/Revoke/Delete controls, explicit OAuth-completed evidence for the staged account, staged account alias, selected-account state, Nango Gmail integration key, Nango auth webhook delivery/acceptance status, proof that `Sync now` completed, proof that keyword search ran, and a keyword result row showing a safe snippet plus message/thread/source refs that match the selected staged Gmail source.
- Proof that semantic search ran, plus a semantic result row showing the grounded/inferred label, score reason, Gmail source ref, and Brain memory ref that match the selected staged Gmail source without any raw numeric score.
- Proof that a Create run completed with Gmail memory available, and that the Create details/evidence drawer was opened showing the Gmail-backed Personal and Critical options, selected-option Gmail evidence, and real Gmail source or memory refs only when the selected option used synced Gmail evidence.
- Proof that the prompt export was generated, with selected option history, personal-context, and source/memory evidence sections visible, Gmail-derived context visible inside the personal-context and source/memory evidence sections only when the selected option used it, and no claims of global training, hidden memory, background Gmail access, unrestricted mailbox scans, or access before consent.
- Proof that revoke and Gmail source delete completed, plus visible revoked-connection state, zero Gmail source count after delete, and Brain retrieval/Create/export no longer surfacing the deleted Gmail source.

Reject the browser evidence if a screenshot, note, console log, or copied row includes raw email body text, `plainTextBody`, `rawBody`, `payload`, `credentialRef`, access/refresh tokens, raw Nango connect links, raw numeric scores, global-training claims, or human-review claims beyond the approved privacy copy.

Record manual browser proof as sanitized JSON when it is part of the staging bundle. Use `--pre-oauth-only` only for the local UI preflight; omit it for full staged OAuth proof:

```bash
node --check scripts/create-gmail-browser-evidence-template.mjs
node scripts/create-gmail-browser-evidence-template.mjs \
  --staging-run-id="$GMAIL_STAGING_RUN_ID" \
  --base-url="$GMAIL_STAGING_BASE_URL" \
  --out=tmp/gmail-browser-evidence.json
node scripts/create-gmail-browser-evidence-template.mjs \
  --pre-oauth-only \
  --base-url="$GMAIL_STAGING_BASE_URL" \
  --out=tmp/gmail-browser-evidence-preoauth.json
node --check scripts/verify-gmail-browser-evidence.mjs
node scripts/verify-gmail-browser-evidence.mjs tmp/gmail-browser-evidence.json --pre-oauth-only
node scripts/verify-gmail-browser-evidence.mjs tmp/gmail-browser-evidence.json
node scripts/verify-gmail-browser-evidence.mjs tmp/gmail-browser-evidence.json \
  --artifact-root=tmp/gmail-browser-artifacts \
  --require-artifact-files
```

The template generator creates every required check with boolean proof fields set to `false`, plus one note and per-check screenshot placeholders whose `proves` arrays already cover the verifier requirements. Replace the placeholder scope ids, keep `capturedAt` as a valid timestamp, attach sanitized screenshot or note files, and flip a boolean to `true` only after the visible browser proof or sanitized note proves it. The verifier remains the acceptance gate.

The JSON evidence must include `baseUrl`, `userId`, `workspaceId`, `projectId`, `sphereId`, `capturedAt`, `checks`, and at least one sanitized proof artifact in `screenshots`, `notes`, or `proofs`. Full staged browser evidence must include the same safe opaque `stagingRunId` recorded by the readiness, UI preflight, and smoke evidence files; the template generator and standalone browser verifier reject full proof when this run id is missing or unsafe. Each proof artifact must include a `proves` array listing the check names it supports. The full staged browser evidence must include and prove these check names:

- `brain.gmailPanel.preOAuth`
- `brain.gmailKeywordFilters`
- `create.contextLightSurface`
- `brain.gmailConnectedResults`
- `brain.gmailSemanticResults`
- `create.gmailEvidenceDrawer`
- `create.gmailExport`
- `brain.gmailPostRevokeDelete`

Each check records only booleans or safe field names, such as whether the Gmail card, OAuth completion, staged account alias, selected account state, Nango integration key, Nango auth webhook acceptance/delivery status, Sync completion, keyword-search execution, semantic-search execution, Create run completion, evidence drawer opening, prompt-export generation, revoke/delete completion, keyword filters, message/source counts, safe refs, semantic grounding labels, Create evidence drawer, export prompt, selector targets, post-revoke/delete absence, and export privacy-safety facts were visible. The `brain.gmailConnectedResults` check must set `oauthCompleted=true`, `nangoAuthWebhookVerified=true`, `stagedAccountAliasPresent=true`, `nangoIntegrationKeyPresent=true`, `nangoWebhookDeliveryStatusPresent=true`, `selectedAccountStateVisible=true`, `syncCompleted=true`, `keywordSearchRan=true`, and `keywordSelectedSourceRefsMatched=true` for full staged evidence. The `brain.gmailSemanticResults` check must set `semanticSearchRan=true` and `semanticSelectedSourceRefsMatched=true`; `create.gmailEvidenceDrawer` must set `createRunCompleted=true`, `evidenceDrawerOpened=true`, `personalOptionVisible=true`, `criticalOptionVisible=true`, `selectedOptionGmailEvidenceVisible=true`, and `selectedOptionGmailRefsVisible=true`; `create.gmailExport` must set `exportPromptGenerated=true`, `selectedOptionHistoryVisible=true`, `personalContextSectionVisible=true`, `sourceMemoryEvidenceSectionVisible=true`, `gmailEvidenceInPersonalContext=true`, `gmailEvidenceInSourceMemorySection=true`, `unsafePrivacyClaimAbsent=true`, `rawEmailBodyAbsent=true`, `secretOrConnectTokenAbsent=true`, and `unsupportedHumanReviewClaimAbsent=true`; and `brain.gmailPostRevokeDelete` must set `revokeCompleted=true`, `deleteCompleted=true`, `revokedStateVisible=true`, and `deletedSourceCountZero=true`. Every required check must set `selectorTargetsPresent=true` after confirming the relevant stable selector target is present. Store screenshot filenames or labels if helpful, but do not paste raw Gmail rows, connect links, tokens, or body text into the JSON. The verifier rejects browser evidence when no proof artifact covers a required check, and also rejects proof text containing unsafe Gmail privacy claims such as global training or hidden/background mailbox access. When screenshot, note, or proof files are stored locally with the evidence, use `--artifact-root` plus `--require-artifact-files` so the verifier proves every referenced artifact exists under the expected root, requires `screenshots` entries to reference `.png`, `.jpg`, or `.webp` files, requires `notes` and `proofs` entries to reference `.txt`, `.md`, or `.json` files, rejects text or placeholder files masquerading as image screenshots, rejects image artifacts smaller than `320x200` pixels, and scans `.txt`, `.md`, and `.json` proof files for raw Gmail, credential, connect-token, or unsafe privacy-claim text.

When the browser evidence only covers the local pre-OAuth path, record it as a UI preflight only. The actual staging proof still requires OAuth, sync, keyword search, semantic search, Gmail evidence in Create, export, revoke, and delete against a staged Gmail account.

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
GMAIL_STAGING_RUN_ID=<shared-run-id> \
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

The automated smoke also uses the keyword text and filters for the initial sync, so the run imports only the staged safe-message slice rather than the first arbitrary mailbox page. The evidence file records the Gmail `q` string, the sync filters, the keyword filters used, and safe result-shape facts for message refs, thread refs, source refs, selected source-ref matches, snippets, and absence of raw Gmail body fields. Semantic evidence records the same safe-result proof for subject, sender, date field, message/thread/source refs, Brain memory ref, selected source-ref matches, selected memory-ref count, snippet, score reason, grounding label, hidden raw score, and absence of raw body fields. It checks both that keyword results are not stored by default and that `sync=true` explicitly stores through the same safe, duplicate-free import path.
Smoke evidence intentionally omits raw HTTP response bodies and raw email content; failure records use route/status/error-code summaries so the evidence file can be shared without exposing mailbox text. The smoke also checks the Gmail status endpoint and the general Google provider endpoint that the Brain UI loads; their state views must expose only connection selectors, minimal sync job fields, and source ids/URIs, not Gmail metadata, provenance, credential refs, cursor internals, or raw-retention fields.
The Create export check records section-level evidence facts: selected option history is present, personal context is present, source/memory evidence is present, and the expected staged Gmail evidence phrase appears inside both the personal-context and source/memory evidence sections. It also records explicit privacy-safety facts: no unsafe training/hidden-access claims, no raw Gmail body markers, no connect/session/token values, and no unsupported human-review claim beyond the allowed `No human review` privacy copy.

Verify the non-destructive evidence file before treating it as acceptance evidence:

```bash
node --check scripts/verify-gmail-smoke-evidence.mjs
node scripts/verify-gmail-smoke-evidence.mjs tmp/gmail-smoke-evidence.json --min-messages=1
```

When the smoke command included the full keyword filter set, require that coverage in the verifier:

```bash
node scripts/verify-gmail-smoke-evidence.mjs tmp/gmail-smoke-evidence.json --min-messages=1 --require-keyword-filters
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
- Gmail status proves the selected staged account state is visible, with a Penny connection id, Nango connection id, Nango provider config key, and staged account alias metadata present. Smoke evidence records only booleans for this identity proof, not the raw account email.
- Gmail status and Google provider page-load state views do not expose Gmail message metadata, provenance, credential refs, cursor internals, raw body fields, or per-source training/raw-retention flags.
- Sync imports at least one message from the staged safe-message query/filter set, returns cursor/history evidence, and proves the selected account's Gmail source refs are visible in status and matched in Brain profile privacy evidence.
- Sync-state source privacy proves imported Gmail sources are private user memory with `trainingUse=false`, `rawContentStored=false`, and enabled retrieval; Brain profile proves the same Gmail sources have private visibility, `trainingUse=false`, and `rawRetention=false`.
- By default, sync has zero partial failures. When `GMAIL_SMOKE_EXPECT_PARTIAL_FAILURE_STAGE=message_oversized` is set, sync proves the oversized message was skipped through a sanitized `stage=message_oversized` partial-failure summary while still importing the safe message slice.
- Repeating the same scoped sync returns cursor/history evidence again, does not change the Gmail source count, and does not create duplicate source refs.
- Keyword search uses the Gmail API, proves safe result shape with message/thread/source refs and snippets, proves result source refs match the selected staged Gmail source refs, does not store results without `sync=true`, and explicitly stores safely with `sync=true`.
- Semantic search returns only synced Gmail memory, hides raw numeric scores, records safe shape evidence for subjects, senders, date fields, message/thread/source refs, Brain memory refs, snippets, grounded/inferred labels, score reasons, and absence of raw body fields, and proves semantic result refs match the selected staged Gmail source refs.
- Create uses the synced Gmail evidence through Brain Ranker candidates, memory refs, and source refs; the next-best move is grounded, all five ranked candidates are present, Create memory/source refs and Brain Ranker candidate refs match the selected semantic Gmail memory refs and selected staged Gmail source refs, Personal and Critical options are returned for the refinement/export check, both option texts include the expected staged Gmail evidence phrase, and the selected-option refinement returns a judgment event plus artifact/verification that still contain and ref-match the real Gmail evidence.
- Prompt export includes the Gmail-derived context only after the selected Create refinement uses it, proves the selected option history plus personal-context and source/memory evidence sections are present, proves the expected staged Gmail evidence appears inside both context/evidence sections, and records the export privacy-safety facts.

The default smoke does not revoke or delete, because those are destructive for the staged connection. To run the full destructive end of the staging proof:

```bash
BASE_URL=http://localhost:3000 \
GMAIL_SMOKE_USER_ID=<same-user-id> \
GMAIL_SMOKE_WORKSPACE_ID=<same-workspace-id> \
GMAIL_SMOKE_PROJECT_ID=<same-project-id> \
GMAIL_SMOKE_SPHERE_ID=<same-sphere-id> \
GMAIL_STAGING_RUN_ID=<shared-run-id> \
GMAIL_SMOKE_KEYWORD_TEXT="launch partner evidence" \
GMAIL_SMOKE_SEMANTIC_QUERY="launch partner evidence" \
GMAIL_SMOKE_EXPECT_CREATE_TEXT="launch partner evidence" \
GMAIL_SMOKE_CONFIRM_MUTATIONS=true \
GMAIL_SMOKE_CONFIRM_DELETE=true \
GMAIL_SMOKE_EVIDENCE_FILE=tmp/gmail-smoke-evidence-full.json \
node scripts/smoke-gmail-staging.mjs
```

That destructive smoke revokes the Gmail connection, verifies sync, keyword search, and semantic search stop, deletes a synced Gmail source that appeared in semantic results, verifies Brain profile, `/api/brain/retrieve`, semantic search, Create top-level refs, and Create Brain Ranker candidates no longer reference the deleted source, and records a safe evidence summary without raw email body text. If the delete target cannot be tied to semantic Gmail memory, the destructive smoke fails instead of certifying a weaker delete.

Verify destructive evidence with:

```bash
node scripts/verify-gmail-smoke-evidence.mjs tmp/gmail-smoke-evidence-full.json --destructive --min-messages=1
```

The verifier fails if required smoke steps are missing, if imported source privacy is not proven in sync state and Brain profile, if repeated sync/source counts are unstable, if keyword search stores without `sync=true`, if keyword result-shape facts or selected-source match facts are missing, if semantic result-shape facts or selected-source match facts are missing, if semantic search exposes raw scores, if Create's Brain Ranker evidence is missing ranked candidates or Gmail memory/source refs, if Create memory/source refs do not match the selected semantic Gmail memory refs and selected staged Gmail source refs, if Create/refinement/export do not include the expected Gmail evidence, if Personal or Critical option text does not include the expected staged Gmail evidence phrase, if the selected-option refinement is missing its judgment event or selected-option match, if export selected-history/personal-context/source-memory section proof is missing, if export privacy-safety facts are missing, if revoke/delete postconditions are missing for destructive runs, or if the evidence JSON contains unsafe raw fields such as tokens, credential refs, metadata/provenance, raw bodies, or raw connect links. Destructive verification also requires `semanticSearch.deleteTargetMatchedSemanticResult=true`, at least one tracked delete-target Gmail memory id, source/Brain-source id presence in `deleteSource` evidence, at least five Create Brain Ranker candidates after delete, and explicit absence of the deleted Gmail source and memory from those ranked candidates so delete proof is tied to the synced Gmail memory that Create and semantic search used.

After verifying individual files, verify the full staging evidence bundle so readiness and smoke files are from the same API and user/workspace/project/sphere scope:

```bash
node --check scripts/verify-gmail-staging-bundle.mjs
node scripts/verify-gmail-staging-bundle.mjs \
  --readiness=tmp/gmail-readiness-evidence.json \
  --smoke=tmp/gmail-smoke-evidence.json \
  --ui-preflight=tmp/gmail-ui-preflight-evidence.json \
  --readiness-connect-preflight \
  --require-ui-preflight \
  --require-keyword-filters \
  --min-messages=1
```

This command verifies readiness, non-destructive Gmail smoke, and UI preflight evidence are from the same API and user/workspace/project/sphere scope. It also requires the UI preflight evidence to include Brain documents, Brain memory profile, Brain recents, Google provider, and Gmail status checks with privacy-safe provider/status state.

When certifying the destructive end-to-end path, require the destructive evidence too:

```bash
node scripts/verify-gmail-staging-bundle.mjs \
  --readiness=tmp/gmail-readiness-evidence.json \
  --smoke=tmp/gmail-smoke-evidence.json \
  --destructive-smoke=tmp/gmail-smoke-evidence-full.json \
  --ui-preflight=tmp/gmail-ui-preflight-evidence.json \
  --browser-evidence=tmp/gmail-browser-evidence.json \
  --browser-artifact-root=tmp/gmail-browser-artifacts \
  --final-staging \
  --min-messages=1
```

This final bundle is the browser/manual proof gate. `--final-staging` requires readiness connect preflight, full keyword-filter coverage, destructive revoke/delete smoke, UI preflight, full browser evidence, browser artifact-file verification, matching `stagingRunId` values, and evidence timestamps inside one 24-hour staging window. Browser evidence must be full staged evidence, not `--pre-oauth-only`, and it must cover connected results, semantic refs, Create evidence/export, and post-revoke/delete absence. When local screenshots or notes are referenced by the browser evidence JSON, run the final bundle with `--browser-evidence`, `--browser-artifact-root`, and `--final-staging`; artifact-file verification is invalid without the browser evidence JSON. If a supervised staging run legitimately takes longer, pass `--max-evidence-window-hours=<hours>` and record why the wider window was needed.

## Acceptance Evidence

Before marking Gmail staging ready, attach or record:

- `pnpm typecheck`, `pnpm test`, and `pnpm build` output.
- `node --check scripts/smoke-gmail-staging.mjs`.
- `node --check scripts/verify-gmail-smoke-evidence.mjs`.
- `node --check scripts/check-gmail-staging-readiness.mjs`.
- `node --check scripts/verify-gmail-readiness-evidence.mjs`.
- `node --check scripts/verify-gmail-browser-evidence.mjs`.
- `node --check scripts/verify-gmail-staging-bundle.mjs`.
- `scripts/check-gmail-staging-readiness.mjs` output and `tmp/gmail-readiness-evidence.json` with `GMAIL_READINESS_REQUIRE_STAGING=true`, `GMAIL_READINESS_ENV_FILE=.env.local` when env is file-backed, and optional `GMAIL_READINESS_CONNECT_PREFLIGHT=true` output when certifying connect-session setup.
- `scripts/verify-gmail-readiness-evidence.mjs tmp/gmail-readiness-evidence.json --strict-staging`, plus `--connect-preflight` when the readiness run created a Nango connect session.
- `scripts/verify-gmail-smoke-evidence.mjs` output for every accepted non-destructive or destructive evidence file.
- `scripts/verify-gmail-browser-evidence.mjs tmp/gmail-browser-evidence.json` output for full staged browser proof, with `--artifact-root=tmp/gmail-browser-artifacts --require-artifact-files` when evidence references local proof files, or `--pre-oauth-only` for local UI preflight proof that is not being used as final OAuth evidence.
- `scripts/verify-gmail-staging-bundle.mjs --readiness=tmp/gmail-readiness-evidence.json --smoke=tmp/gmail-smoke-evidence.json --destructive-smoke=tmp/gmail-smoke-evidence-full.json --ui-preflight=tmp/gmail-ui-preflight-evidence.json --browser-evidence=tmp/gmail-browser-evidence.json --browser-artifact-root=tmp/gmail-browser-artifacts --final-staging`, with matching `stagingRunId` values and all evidence timestamps inside the default 24-hour final-staging window unless an explicit wider window is justified.
- Optional `GMAIL_SMOKE_CONNECT_PREFLIGHT_ONLY=true` output plus `scripts/verify-gmail-smoke-evidence.mjs tmp/gmail-connect-preflight-evidence.json --connect-preflight-only` output proving connect-session creation with only sanitized connect-link evidence.
- Optional full-smoke `GMAIL_SMOKE_CONNECT_PREFLIGHT=true` output plus `scripts/verify-gmail-smoke-evidence.mjs tmp/gmail-smoke-evidence.json --connect-preflight --min-messages=1` output.
- UI preflight output from `scripts/check-gmail-ui-preflight.mjs` with `GMAIL_UI_PREFLIGHT_EVIDENCE_FILE=tmp/gmail-ui-preflight-evidence.json`, plus `tmp/gmail-browser-evidence.json` and screenshots or notes for the Brain Gmail panel and Create evidence/export surfaces.
- Non-destructive `scripts/smoke-gmail-staging.mjs` output.
- Destructive `scripts/smoke-gmail-staging.mjs` output from a disposable staged Gmail account, when revoke/delete are being certified.
- Nango auth webhook delivery record showing Penny accepted the Gmail connection and started `google-gmail-messages`.
- Smoke evidence showing `statusStatePrivacySafe=true` and `providerStatePrivacySafe=true`.
- Smoke evidence showing synced Gmail source privacy with `syncedSourceTrainingUseFalse=true`, `syncedSourceRawContentStoredFalse=true`, `syncedSourcePrivateUserMemory=true`, `brainProfileTrainingUseFalse=true`, `brainProfileRawRetentionFalse=true`, and `brainProfilePrivateVisibility=true`.
- Gmail status response before and after OAuth.
- Sync and repeated-sync responses showing imported count, cursor/historyId, stable source counts, no duplicate source refs, selected staged-account identity proof with only boolean account/Nango identity facts, and selected Gmail source refs matched by Brain profile privacy evidence.
- Keyword search responses proving Gmail `q` search, default no-store behavior, explicit `sync=true` storage, and result source refs matched to the selected staged Gmail source refs.
- Semantic search response proving synced Penny memory retrieval, safe result shape, message/thread/source refs, Brain memory refs, selected memory-ref count, snippets, grounded/inferred labels, score reasons, selected-source ref matches, and no raw numeric score in normal UI.
- Create evidence showing grounded Brain Ranker output with five ranked candidates, Gmail memory refs and source refs in ranked candidates, Create and Brain Ranker candidate refs matched to the selected semantic Gmail memory refs and selected staged Gmail source refs, Personal and Critical option text with the expected staged Gmail evidence phrase, selected-option refinement evidence with matching option ids and artifact/verification output that still ref-matches the selected Gmail evidence, plus an export prompt showing Gmail evidence only when selected and used with selected-history, personal-context, and source/memory evidence section proof.
- Revoke response and post-revoke sync, keyword search, and semantic search failure.
- Source delete result and post-delete Brain profile, `/api/brain/retrieve`, semantic search, and Create retrieval absence.
