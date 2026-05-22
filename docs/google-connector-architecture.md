# Google Connector Architecture

Penny's connector foundation starts with Google and stays separate from Brain ranking. Connectors produce private source nodes, normalized chunks, memory notes, source refs, sync cursors, and permission audit events. Brain can use those artifacts only through scoped retrieval and provenance.

## Supported Now

- Drive selected-file access through `drive.file`.
- Docs, Sheets, and Slides through selected Drive files/export where feasible.
- Calendar read-only sync for deadlines, cadence, and collaborator context.
- Nango-style connection, credential, revoke, refresh, sync trigger, and sync-status adapter seam.
- Scoped connector persistence for connections, sync cursors, sync runs, source refs, and permission audits.
- Sync completion into private Brain imports for connector-provided Drive/Docs/Calendar records.
- Workspace-bundle connect sessions that tag Nango connections with Gmail, Drive/Docs, and Calendar surfaces.
- Nango auth webhook reconciliation at `/api/connectors/google/nango-webhook`, with automatic sync trigger after a successful Google approval.
- Connector source deletion that removes retrieval access and deletes the linked Brain source when present.
- Gmail read-only status, connect, sync, keyword search, semantic search, revoke, and source-delete paths behind explicit restricted-scope gates.
- Manual import guidance statuses for Google Takeout and My Activity.
- Chrome extension-required status for browser/search history.

## Gated Or Future

- Gmail read-only is implemented but remains gated behind `ENABLE_GMAIL_CONNECTOR=true` and `ENABLE_RESTRICTED_GOOGLE_SCOPES=true`. Production still blocks public Gmail restricted-scope use until Google verification and security documentation are complete.
- Broad Drive metadata/read access is restricted and not production-allowed by default.
- YouTube supports only explicit API resources such as channel or playlist metadata. Penny does not claim YouTube watch history.
- Google Search history, browser history, messages, and Takeout archives are not fetched by OAuth. My Activity and Takeout require user-provided imports; browser/search history requires a future extension.

## Nango Plan

`packages/brain/src/google-connector.ts` defines a provider-agnostic Nango adapter with:

- `createConnectSession`
- `handleCallback`
- `listConnections`
- `getCredentials`
- `revokeConnection`
- `startSync`
- `getSyncStatus`
- `refreshConnection`

The adapter uses Nango's connect-session, connections, sync-trigger, and sync-status HTTP APIs. Missing configuration returns `not_configured`; it does not fake a connection.

Required environment placeholders:

- `NANGO_SECRET_KEY`
- `NANGO_BASE_URL`
- `ENABLE_GOOGLE_CONNECTOR`
- `ENABLE_RESTRICTED_GOOGLE_SCOPES`
- `ENABLE_GMAIL_CONNECTOR`

Nango setup requirements:

- The default Google Workspace integration key is `google`; dedicated Gmail staging can use `NANGO_GMAIL_INTEGRATION_ID` such as `google-gmail-staging`.
- Google OAuth client ID and secret are configured inside Nango's Google integration, not Penny's `.env.local`.
- The Google integration should request the scopes Penny needs for the Workspace bundle, starting with `gmail.readonly`, `drive.file`, and `calendar.readonly`.
- The Nango environment webhook URL should point to Penny's `/api/connectors/google/nango-webhook` endpoint.
- Webhook signature verification uses the `X-Nango-Hmac-Sha256` header and `NANGO_WEBHOOK_SIGNING_KEY`, falling back to `NANGO_SECRET_KEY` only for older environments.

## Scope Strategy

Penny prefers the narrowest user-comprehensible scope:

- Use `drive.file` for selected files before any broad Drive scope.
- Use Calendar read-only.
- Use Gmail metadata/read-only only after explicit Gmail and restricted-scope gates.
- Treat manual import and extension surfaces as non-OAuth surfaces.

Scope registry fields include `id`, `surface`, `sensitivity`, `whyPennyNeedsIt`, `userExplanation`, `gatedStatus`, and `productionAllowed`.

Google documentation marks Drive broad read/metadata scopes as restricted and recommends narrower `drive.file` where possible. Gmail scopes include metadata/read-only scopes that expose mailbox data. Nango documents connect sessions at `POST /connect/sessions`, connection credential reads at `GET /connections/{connectionId}`, and one-off sync triggers at `POST /sync/trigger`.

## Auto-Sync Model

After consent, Penny should create:

- `ConnectorConnection` with connection status, credential ref, connected surfaces, scopes, and source counts.
- `ConnectorSyncJob` for initial sync and each scheduled/manual sync.
- `ConnectorSyncCursor` per surface/model so resync is incremental.
- `lastSyncedAt`, `nextSyncAt`, error, and revoked state.

Nango auth webhooks are the default way to turn a successful Google approval into a Penny connector connection. After the webhook is verified, Penny records the connection, preserves the surfaces and compact scope IDs tagged on the connect session, and starts the matching Nango syncs (`google-gmail-messages`, `google-drive-files`, and `google-calendar-events`) where configured. Penny does not tag long OAuth scope URL lists because Nango tag values are size-limited. `Sync now` also triggers a one-off Nango sync and updates local sync runs to `running`. The `sync-complete` seam accepts explicit connector records plus content from Nango/Google fetch workers, imports them into Brain with `rawRetention=false`, and then stores connector source refs with Brain source IDs and memory node IDs.

## Privacy Model

Connector-derived data defaults to private user memory:

- `trainingUse=false`
- no raw private content in production logs
- user/workspace scoped
- raw source retained only when private and needed
- source refs preserve provenance
- revoke/delete removes retrieval access

Delete should mark connector sources, chunks, memory notes, profile signals, and retrieval references unavailable for Brain/Create/Learn. Revocation stops future sync and prevents credential use, but audit history remains.

## Implementation State

Current committed foundation:

- Contracts and statuses: `ConnectorProvider`, `ConnectorConnection`, `ConnectorSurface`, `ConnectorScope`, `ConnectorCredentialRef`, `ConnectorSyncJob`, `ConnectorSyncCursor`, `ConnectorSource`, `ConnectorPermissionAudit`, `ConnectorError`, `ConnectorEvent`, `BrainSourceKind`.
- Google surface registry with honest states for Drive, Docs/Sheets/Slides, Calendar, Gmail, YouTube, Takeout, My Activity, and Chrome extension history.
- Nango adapter seam and config validation.
- Database migration/schema for connector connections, cursors, sync runs, source refs, and permission audits.
- In-memory and DB-backed connector state store, with production requiring `DATABASE_URL`.
- API routes for provider overview, connect session, callback, connections, credentials, sync now, sync complete, sync status, refresh, revoke, and source delete.
- Brain Control Center UI for Google connection state, connected surfaces, scopes, sync status, last/next sync, source counts, Sync now, Revoke, Delete source, gated Gmail, and extension-required browser/search state.
- Sync completion imports Google connector records into private Brain source nodes/chunks/memory notes/source refs and links connector source refs to Brain source IDs.
- Focused tests for config, statuses, scope gating, Gmail production blocking, Nango connect sessions, route persistence, sync lifecycle, source deletion, Gmail keyword/semantic search, Create evidence use, and cross-user scoped connector state.

Remaining integration work:

- Implement the actual background fetch worker/Nango record reader that calls `sync-complete` after Nango syncs finish.
- Add production OAuth callback hardening and signed callback state validation before public demo use.
- Add push/webhook handling when Nango/Google push paths are ready; keep scheduled sync as the fallback.
- Broaden full Brain/Create/Learn regression coverage around connector-imported memory once the worker is live.
