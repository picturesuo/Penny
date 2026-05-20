# Google Connector Architecture

Penny's connector foundation starts with Google and stays separate from Brain ranking. Connectors produce private source nodes, normalized chunks, memory notes, source refs, sync cursors, and permission audit events. Brain can use those artifacts only through scoped retrieval and provenance.

## Supported Now

- Drive selected-file access through `drive.file`.
- Docs, Sheets, and Slides through selected Drive files/export where feasible.
- Calendar read-only sync for deadlines, cadence, and collaborator context.
- Nango-style connection, credential, revoke, refresh, sync trigger, and sync-status adapter seam.
- Manual import guidance statuses for Google Takeout and My Activity.
- Chrome extension-required status for browser/search history.

## Gated Or Future

- Gmail is scaffolded but gated behind `ENABLE_GMAIL_CONNECTOR=true` and `ENABLE_RESTRICTED_GOOGLE_SCOPES=true`. Production still blocks Gmail restricted scopes until Google verification and security documentation are complete.
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
- `NANGO_PUBLIC_KEY`
- `NANGO_BASE_URL`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `ENABLE_GOOGLE_CONNECTOR`
- `ENABLE_RESTRICTED_GOOGLE_SCOPES`
- `ENABLE_GMAIL_CONNECTOR`

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

If push/webhooks are not ready, scheduled sync is the default. `Sync now` triggers a one-off Nango sync and updates the local sync job/cursor after records are processed.

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
- Focused tests for config, statuses, scope gating, Gmail production blocking, and Nango connect sessions.

Remaining integration work:

- Persist the new connector contracts in database tables/migrations.
- Add API routes for provider overview, connect session, callback, sync now, revoke, delete source, and sync status.
- Wire Brain Control Center UI to the new Google states.
- Convert Nango records/Google fetches into private Brain source nodes, chunks, memory notes, source refs, and profile signals.
- Add cross-user leakage, revoke/delete, sync lifecycle, and Brain/Create/Learn regression tests.
