import { and, eq, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { createPennyDb, type PennyDatabase } from "./db/client.ts";
import {
  connectorConnections,
  connectorPermissionAudits,
  connectorSourceRefs,
  connectorSyncCursors,
  connectorSyncRuns,
} from "./db/schema.ts";
import {
  connectorStatuses,
  type BrainSourceKind,
  type ConnectorConnection,
  type ConnectorCredentialRef,
  type ConnectorError,
  type ConnectorEvent,
  type ConnectorSource,
  type ConnectorStateScope,
  type ConnectorStatus,
  type ConnectorSyncJob,
  type GoogleConnectorState,
  type GoogleSurfaceId,
  type ScopedConnectorConnection,
  type ScopedConnectorPermissionAudit,
  type ScopedConnectorSource,
  type ScopedConnectorSyncCursor,
  type ScopedConnectorSyncJob,
} from "./google-connector.ts";

type GoogleConnectorDb = PennyDatabase | Parameters<Parameters<PennyDatabase["transaction"]>[0]>[0];
type ScopeTable = {
  userId: AnyPgColumn;
  workspaceId: AnyPgColumn;
  projectId: AnyPgColumn;
  sphereId: AnyPgColumn;
};
type ScopeColumn = ScopeTable[keyof ScopeTable];

export type GoogleConnectorStateStore = {
  load(scope: ConnectorStateScope): Promise<GoogleConnectorState>;
  save(state: GoogleConnectorState): Promise<GoogleConnectorState>;
};

let defaultGoogleConnectorStateStore: GoogleConnectorStateStore | null = null;
let defaultGoogleConnectorStateStoreKey: string | null = null;

export function emptyGoogleConnectorState(): GoogleConnectorState {
  return {
    connections: [],
    cursors: [],
    syncJobs: [],
    sources: [],
    audits: [],
  };
}

export function createInMemoryGoogleConnectorStateStore(
  seed: GoogleConnectorState = emptyGoogleConnectorState(),
): GoogleConnectorStateStore {
  let state = cloneState(seed);

  return {
    async load(scope) {
      return filterGoogleConnectorState(state, scope);
    },
    async save(nextState) {
      state = mergeGoogleConnectorStates(state, nextState);
      return cloneState(nextState);
    },
  };
}

export function createDbGoogleConnectorStateStore(db: GoogleConnectorDb): GoogleConnectorStateStore {
  return {
    async load(scope) {
      const normalizedScope = scopeValue(scope);
      const [connectionRows, cursorRows, syncRunRows, sourceRows, auditRows] = await Promise.all([
        db.select().from(connectorConnections).where(scopeCondition(connectorConnections, normalizedScope)),
        db.select().from(connectorSyncCursors).where(scopeCondition(connectorSyncCursors, normalizedScope)),
        db.select().from(connectorSyncRuns).where(scopeCondition(connectorSyncRuns, normalizedScope)),
        db.select().from(connectorSourceRefs).where(scopeCondition(connectorSourceRefs, normalizedScope)),
        db.select().from(connectorPermissionAudits).where(scopeCondition(connectorPermissionAudits, normalizedScope)),
      ]);

      return {
        connections: connectionRows.map(connectionFromRow),
        cursors: cursorRows.map(cursorFromRow),
        syncJobs: syncRunRows.map(syncJobFromRow),
        sources: sourceRows.map(sourceFromRow),
        audits: auditRows.map(auditFromRow),
      };
    },
    async save(state) {
      await db.transaction(async (tx) => {
        for (const connection of state.connections) {
          await tx
            .insert(connectorConnections)
            .values({
              ...connection.scope,
              id: connection.id,
              providerId: connection.providerId,
              adapter: connection.adapter,
              providerConfigKey: connection.credential.providerConfigKey,
              externalConnectionId: connection.credential.connectionId,
              credentialRef: connection.credential,
              status: connection.status,
              surfaces: connection.surfaces,
              scopes: connection.scopes,
              lastSyncedAt: dateValue(connection.lastSyncedAt),
              nextSyncAt: dateValue(connection.nextSyncAt),
              revokedAt: dateValue(connection.revokedAt),
              sourceCounts: connection.sourceCounts,
              error: connection.error,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: connectorConnections.id,
              set: {
                userId: connection.scope.userId,
                workspaceId: connection.scope.workspaceId,
                projectId: connection.scope.projectId,
                sphereId: connection.scope.sphereId,
                providerConfigKey: connection.credential.providerConfigKey,
                externalConnectionId: connection.credential.connectionId,
                credentialRef: connection.credential,
                status: connection.status,
                surfaces: connection.surfaces,
                scopes: connection.scopes,
                lastSyncedAt: dateValue(connection.lastSyncedAt),
                nextSyncAt: dateValue(connection.nextSyncAt),
                revokedAt: dateValue(connection.revokedAt),
                sourceCounts: connection.sourceCounts,
                error: connection.error,
                updatedAt: new Date(),
              },
            });
        }

        for (const cursor of state.cursors) {
          await tx
            .insert(connectorSyncCursors)
            .values({
              ...cursor.scope,
              id: cursor.id,
              connectionId: cursor.connectionId,
              providerId: cursor.providerId,
              surface: cursor.surface,
              cursor: cursor.cursor,
              lastSyncedAt: dateValue(cursor.lastSyncedAt),
              nextSyncAt: dateValue(cursor.nextSyncAt),
              updatedAt: dateValue(cursor.updatedAt) ?? new Date(),
            })
            .onConflictDoUpdate({
              target: connectorSyncCursors.id,
              set: {
                userId: cursor.scope.userId,
                workspaceId: cursor.scope.workspaceId,
                projectId: cursor.scope.projectId,
                sphereId: cursor.scope.sphereId,
                connectionId: cursor.connectionId,
                providerId: cursor.providerId,
                surface: cursor.surface,
                cursor: cursor.cursor,
                lastSyncedAt: dateValue(cursor.lastSyncedAt),
                nextSyncAt: dateValue(cursor.nextSyncAt),
                updatedAt: dateValue(cursor.updatedAt) ?? new Date(),
              },
            });
        }

        for (const syncJob of state.syncJobs) {
          await tx
            .insert(connectorSyncRuns)
            .values({
              ...syncJob.scope,
              id: syncJob.id,
              connectionId: syncJob.connectionId,
              providerId: syncJob.providerId,
              surface: syncJob.surface,
              status: syncJob.status,
              cursorBefore: syncJob.cursorBefore,
              cursorAfter: syncJob.cursorAfter,
              requestedAt: dateValue(syncJob.requestedAt) ?? new Date(),
              startedAt: dateValue(syncJob.startedAt),
              completedAt: dateValue(syncJob.completedAt),
              sourceCounts: syncJob.sourceCounts,
              error: syncJob.error,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: connectorSyncRuns.id,
              set: {
                userId: syncJob.scope.userId,
                workspaceId: syncJob.scope.workspaceId,
                projectId: syncJob.scope.projectId,
                sphereId: syncJob.scope.sphereId,
                connectionId: syncJob.connectionId,
                providerId: syncJob.providerId,
                surface: syncJob.surface,
                status: syncJob.status,
                cursorBefore: syncJob.cursorBefore,
                cursorAfter: syncJob.cursorAfter,
                requestedAt: dateValue(syncJob.requestedAt) ?? new Date(),
                startedAt: dateValue(syncJob.startedAt),
                completedAt: dateValue(syncJob.completedAt),
                sourceCounts: syncJob.sourceCounts,
                error: syncJob.error,
                updatedAt: new Date(),
              },
            });
        }

        for (const source of state.sources) {
          await tx
            .insert(connectorSourceRefs)
            .values({
              ...source.scope,
              id: source.id,
              connectionId: source.connectionId,
              providerId: source.providerId,
              surface: source.surface,
              kind: source.kind,
              sourceUri: source.sourceUri,
              label: source.label,
              externalId: source.sourceRef.externalId,
              url: source.sourceRef.url,
              metadata: source.metadata,
              provenance: source.provenance,
              privacy: source.privacy,
              retrievalAccess: source.privacy.retrievalAccess,
              brainSourceId: source.brainSourceId ?? null,
              brainNodeIds: source.brainNodeIds ?? [],
              lastSyncedAt: dateValue(source.provenance.fetchedAt),
              deletedAt: source.privacy.retrievalAccess === "deleted" ? new Date() : null,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: connectorSourceRefs.id,
              set: {
                userId: source.scope.userId,
                workspaceId: source.scope.workspaceId,
                projectId: source.scope.projectId,
                sphereId: source.scope.sphereId,
                connectionId: source.connectionId,
                providerId: source.providerId,
                surface: source.surface,
                kind: source.kind,
                sourceUri: source.sourceUri,
                label: source.label,
                externalId: source.sourceRef.externalId,
                url: source.sourceRef.url,
                metadata: source.metadata,
                provenance: source.provenance,
                privacy: source.privacy,
                retrievalAccess: source.privacy.retrievalAccess,
                brainSourceId: source.brainSourceId ?? null,
                brainNodeIds: source.brainNodeIds ?? [],
                lastSyncedAt: dateValue(source.provenance.fetchedAt),
                deletedAt: source.privacy.retrievalAccess === "deleted" ? new Date() : null,
                updatedAt: new Date(),
              },
            });
        }

        for (const audit of state.audits) {
          await tx
            .insert(connectorPermissionAudits)
            .values({
              ...audit.scope,
              id: audit.id,
              providerId: audit.providerId,
              connectionId: audit.connectionId,
              sourceRefId: audit.sourceId,
              actorUserId: audit.actorUserId,
              event: audit.event,
              details: audit.details,
              createdAt: dateValue(audit.createdAt) ?? new Date(),
            })
            .onConflictDoNothing();
        }
      });

      return cloneState(state);
    },
  };
}

export function resolveDefaultGoogleConnectorStateStore(
  env: Record<string, string | undefined> = process.env,
): GoogleConnectorStateStore {
  const databaseUrl = env.DATABASE_URL?.trim();
  const cacheKey = databaseUrl ? `db:${databaseUrl}` : `memory:${env.NODE_ENV ?? "development"}`;

  if (defaultGoogleConnectorStateStore && defaultGoogleConnectorStateStoreKey === cacheKey) {
    return defaultGoogleConnectorStateStore;
  }

  if (databaseUrl) {
    defaultGoogleConnectorStateStore = createDbGoogleConnectorStateStore(createPennyDb(databaseUrl));
    defaultGoogleConnectorStateStoreKey = cacheKey;
    return defaultGoogleConnectorStateStore;
  }

  if (env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required for Google connector state in production.");
  }

  defaultGoogleConnectorStateStore = createInMemoryGoogleConnectorStateStore();
  defaultGoogleConnectorStateStoreKey = cacheKey;
  return defaultGoogleConnectorStateStore;
}

export function filterGoogleConnectorState(
  state: GoogleConnectorState,
  scope: ConnectorStateScope,
): GoogleConnectorState {
  return {
    connections: state.connections.filter((connection) => scopeMatches(connection.scope, scope)).map(cloneConnection),
    cursors: state.cursors.filter((cursor) => scopeMatches(cursor.scope, scope)).map(cloneCursor),
    syncJobs: state.syncJobs.filter((job) => scopeMatches(job.scope, scope)).map(cloneSyncJob),
    sources: state.sources.filter((source) => scopeMatches(source.scope, scope)).map(cloneSource),
    audits: state.audits.filter((audit) => scopeMatches(audit.scope, scope)).map(cloneAudit),
  };
}

export function mergeGoogleConnectorStates(
  base: GoogleConnectorState,
  nextState: GoogleConnectorState,
): GoogleConnectorState {
  return {
    connections: mergeById(base.connections, nextState.connections).map(cloneConnection),
    cursors: mergeById(base.cursors, nextState.cursors).map(cloneCursor),
    syncJobs: mergeById(base.syncJobs, nextState.syncJobs).map(cloneSyncJob),
    sources: mergeById(base.sources, nextState.sources).map(cloneSource),
    audits: mergeById(base.audits, nextState.audits).map(cloneAudit),
  };
}

function connectionFromRow(row: typeof connectorConnections.$inferSelect): ScopedConnectorConnection {
  const credential = credentialRef(row.credentialRef, row.externalConnectionId, row.providerConfigKey);

  return {
    id: row.id,
    scope: scopeFromRow(row),
    providerId: "google",
    adapter: "nango",
    credential,
    status: connectorStatus(row.status),
    surfaces: stringArray(row.surfaces).filter(isGoogleSurfaceId),
    scopes: stringArray(row.scopes),
    lastSyncedAt: isoDate(row.lastSyncedAt),
    nextSyncAt: isoDate(row.nextSyncAt),
    revokedAt: isoDate(row.revokedAt),
    sourceCounts: sourceCounts(row.sourceCounts),
    error: connectorError(row.error),
  };
}

function cursorFromRow(row: typeof connectorSyncCursors.$inferSelect): ScopedConnectorSyncCursor {
  return {
    id: row.id,
    scope: scopeFromRow(row),
    connectionId: row.connectionId,
    providerId: "google",
    surface: googleSurfaceId(row.surface),
    cursor: row.cursor,
    lastSyncedAt: isoDate(row.lastSyncedAt),
    nextSyncAt: isoDate(row.nextSyncAt),
    updatedAt: isoDate(row.updatedAt) ?? new Date().toISOString(),
  };
}

function syncJobFromRow(row: typeof connectorSyncRuns.$inferSelect): ScopedConnectorSyncJob {
  return {
    id: row.id,
    scope: scopeFromRow(row),
    connectionId: row.connectionId,
    providerId: "google",
    surface: googleSurfaceId(row.surface),
    status: syncJobStatus(row.status),
    cursorBefore: connectorCursor(row.cursorBefore),
    cursorAfter: connectorCursor(row.cursorAfter),
    requestedAt: isoDate(row.requestedAt) ?? new Date().toISOString(),
    startedAt: isoDate(row.startedAt),
    completedAt: isoDate(row.completedAt),
    sourceCounts: sourceCounts(row.sourceCounts),
    error: connectorError(row.error),
  };
}

function sourceFromRow(row: typeof connectorSourceRefs.$inferSelect): ScopedConnectorSource {
  const provenance = connectorSourceProvenance(row.provenance);
  const privacy = connectorSourcePrivacy(row.privacy, row.retrievalAccess);

  return {
    id: row.id,
    scope: scopeFromRow(row),
    connectionId: row.connectionId,
    providerId: "google",
    surface: googleSurfaceId(row.surface),
    kind: brainSourceKind(row.kind),
    sourceUri: row.sourceUri,
    label: row.label,
    metadata: recordValue(row.metadata),
    sourceRef: {
      providerId: "google",
      surface: googleSurfaceId(row.surface),
      externalId: row.externalId,
      url: row.url,
    },
    provenance,
    brainSourceId: row.brainSourceId,
    brainNodeIds: stringArray(row.brainNodeIds),
    privacy,
  };
}

function auditFromRow(row: typeof connectorPermissionAudits.$inferSelect): ScopedConnectorPermissionAudit {
  return {
    id: row.id,
    scope: scopeFromRow(row),
    providerId: "google",
    connectionId: row.connectionId,
    sourceId: row.sourceRefId,
    actorUserId: row.actorUserId,
    event: connectorEventType(row.event),
    details: recordValue(row.details),
    createdAt: isoDate(row.createdAt) ?? new Date().toISOString(),
  };
}

function scopeCondition(table: ScopeTable, scope: ConnectorStateScope) {
  const normalized = scopeValue(scope);

  return and(
    nullableEq(table.userId, normalized.userId),
    nullableEq(table.workspaceId, normalized.workspaceId),
    nullableEq(table.projectId, normalized.projectId),
    nullableEq(table.sphereId, normalized.sphereId),
  );
}

function nullableEq(column: ScopeColumn, value: string | null) {
  return value === null ? sql`${column} IS NULL` : eq(column, value);
}

function scopeFromRow(row: {
  userId: string | null;
  workspaceId: string | null;
  projectId: string | null;
  sphereId: string | null;
}): ConnectorStateScope {
  return scopeValue(row);
}

function scopeValue(scope: ConnectorStateScope): ConnectorStateScope {
  return {
    userId: scope.userId ?? null,
    workspaceId: scope.workspaceId ?? null,
    projectId: scope.projectId ?? null,
    sphereId: scope.sphereId ?? null,
  };
}

function scopeMatches(left: ConnectorStateScope, right: ConnectorStateScope): boolean {
  const normalizedLeft = scopeValue(left);
  const normalizedRight = scopeValue(right);

  return (
    normalizedLeft.userId === normalizedRight.userId &&
    normalizedLeft.workspaceId === normalizedRight.workspaceId &&
    normalizedLeft.projectId === normalizedRight.projectId &&
    normalizedLeft.sphereId === normalizedRight.sphereId
  );
}

function mergeById<T extends { id: string }>(base: readonly T[], nextValues: readonly T[]): T[] {
  const byId = new Map(base.map((item) => [item.id, item]));

  for (const item of nextValues) {
    byId.set(item.id, item);
  }

  return [...byId.values()];
}

function cloneState(state: GoogleConnectorState): GoogleConnectorState {
  return {
    connections: state.connections.map(cloneConnection),
    cursors: state.cursors.map(cloneCursor),
    syncJobs: state.syncJobs.map(cloneSyncJob),
    sources: state.sources.map(cloneSource),
    audits: state.audits.map(cloneAudit),
  };
}

function cloneConnection(connection: ScopedConnectorConnection): ScopedConnectorConnection {
  return {
    ...connection,
    scope: { ...connection.scope },
    credential: { ...connection.credential },
    surfaces: [...connection.surfaces],
    scopes: [...connection.scopes],
    sourceCounts: { ...connection.sourceCounts },
    error: connection.error ? cloneConnectorError(connection.error) : null,
  };
}

function cloneCursor(cursor: ScopedConnectorSyncCursor): ScopedConnectorSyncCursor {
  return {
    ...cursor,
    scope: { ...cursor.scope },
  };
}

function cloneSyncJob(job: ScopedConnectorSyncJob): ScopedConnectorSyncJob {
  return {
    ...job,
    scope: { ...job.scope },
    cursorBefore: job.cursorBefore ? { ...job.cursorBefore } : null,
    cursorAfter: job.cursorAfter ? { ...job.cursorAfter } : null,
    sourceCounts: { ...job.sourceCounts },
    error: job.error ? cloneConnectorError(job.error) : null,
  };
}

function cloneSource(source: ScopedConnectorSource): ScopedConnectorSource {
  return {
    ...source,
    scope: { ...source.scope },
    metadata: { ...source.metadata },
    sourceRef: { ...source.sourceRef },
    provenance: { ...source.provenance },
    privacy: { ...source.privacy },
    ...(source.brainNodeIds ? { brainNodeIds: [...source.brainNodeIds] } : {}),
  };
}

function cloneAudit(audit: ScopedConnectorPermissionAudit): ScopedConnectorPermissionAudit {
  return {
    ...audit,
    scope: { ...audit.scope },
    details: { ...audit.details },
  };
}

function cloneConnectorError(error: ConnectorError): ConnectorError {
  return {
    ...error,
    ...(error.details ? { details: { ...error.details } } : {}),
  };
}

function credentialRef(value: unknown, connectionId: string, providerConfigKey: string): ConnectorCredentialRef {
  const record = recordValue(value);
  const accountId = stringValue(record.accountId);
  const endUserId = stringValue(record.endUserId);

  return {
    providerId: "google",
    adapter: "nango",
    connectionId: stringValue(record.connectionId) ?? connectionId,
    providerConfigKey: stringValue(record.providerConfigKey) ?? providerConfigKey,
    credentialRef: stringValue(record.credentialRef) ?? `nango:${providerConfigKey}:${connectionId}`,
    ...(accountId ? { accountId } : {}),
    ...(endUserId ? { endUserId } : {}),
  };
}

function connectorCursor(value: unknown): ConnectorSyncJob["cursorBefore"] {
  const record = recordValue(value);
  const id = stringValue(record.id);
  const connectionId = stringValue(record.connectionId);
  const surface = stringValue(record.surface);

  if (!id || !connectionId || !surface) {
    return null;
  }

  return {
    id,
    connectionId,
    providerId: "google",
    surface: googleSurfaceId(surface),
    cursor: stringValue(record.cursor),
    lastSyncedAt: stringValue(record.lastSyncedAt),
    nextSyncAt: stringValue(record.nextSyncAt),
    updatedAt: stringValue(record.updatedAt) ?? new Date().toISOString(),
  };
}

function connectorSourceProvenance(value: unknown): ConnectorSource["provenance"] {
  const record = recordValue(value);

  return {
    credentialRef: stringValue(record.credentialRef) ?? "nango:google:unknown",
    fetchedAt: stringValue(record.fetchedAt) ?? new Date().toISOString(),
    cursor: stringValue(record.cursor),
  };
}

function connectorSourcePrivacy(value: unknown, retrievalAccess: string): ConnectorSource["privacy"] {
  const record = recordValue(value);
  const access = retrievalAccess === "revoked" || retrievalAccess === "deleted" ? retrievalAccess : "enabled";

  return {
    trainingUse: false,
    visibility: "private_user_memory",
    rawContentStored: record.rawContentStored === true,
    productionLogSafe: false,
    retrievalAccess: access,
  };
}

function connectorError(value: unknown): ConnectorError | null {
  if (!value) {
    return null;
  }

  const record = recordValue(value);
  const code = stringValue(record.code);
  const message = stringValue(record.message);

  if (!code || !message) {
    return null;
  }

  return {
    code: connectorErrorCode(code),
    message,
    retryable: record.retryable === true,
    details: recordValue(record.details),
  };
}

function connectorErrorCode(code: string): ConnectorError["code"] {
  const allowed: readonly ConnectorError["code"][] = [
    "not_configured",
    "connector_disabled",
    "restricted_scope_not_enabled",
    "gmail_not_enabled",
    "unsupported_surface",
    "extension_required",
    "manual_import_only",
    "nango_request_failed",
    "nango_response_invalid",
  ];

  return allowed.includes(code as ConnectorError["code"]) ? (code as ConnectorError["code"]) : "nango_response_invalid";
}

function connectorStatus(status: string): ConnectorStatus {
  return (connectorStatuses as readonly string[]).includes(status) ? (status as ConnectorStatus) : "failed";
}

function syncJobStatus(status: string): ConnectorSyncJob["status"] {
  const allowed: readonly ConnectorSyncJob["status"][] = ["queued", "running", "succeeded", "failed", "canceled"];

  return allowed.includes(status as ConnectorSyncJob["status"]) ? (status as ConnectorSyncJob["status"]) : "failed";
}

function connectorEventType(value: string): ConnectorEvent["type"] {
  const allowed: readonly ConnectorEvent["type"][] = [
    "connector.connect_session_created",
    "connector.connected",
    "connector.sync_started",
    "connector.sync_completed",
    "connector.sync_status_checked",
    "connector.source_indexed",
    "connector.source_deleted",
    "connector.refreshed",
    "connector.revoked",
  ];

  return allowed.includes(value as ConnectorEvent["type"]) ? (value as ConnectorEvent["type"]) : "connector.sync_status_checked";
}

function googleSurfaceId(value: string): GoogleSurfaceId {
  return isGoogleSurfaceId(value) ? value : "google_drive";
}

function isGoogleSurfaceId(value: unknown): value is GoogleSurfaceId {
  return (
    value === "google_drive" ||
    value === "google_docs_sheets_slides" ||
    value === "google_calendar" ||
    value === "google_gmail" ||
    value === "google_youtube" ||
    value === "google_takeout" ||
    value === "google_my_activity" ||
    value === "chrome_extension_history"
  );
}

function brainSourceKind(value: string): BrainSourceKind {
  const allowed: readonly BrainSourceKind[] = [
    "user_upload",
    "google_drive_file",
    "google_doc",
    "google_sheet",
    "google_slide",
    "google_calendar_event",
    "google_gmail_message",
    "google_youtube_resource",
    "google_takeout_import",
    "google_my_activity_import",
    "browser_history_extension",
  ];

  return allowed.includes(value as BrainSourceKind) ? (value as BrainSourceKind) : "google_drive_file";
}

function sourceCounts(value: unknown): ConnectorConnection["sourceCounts"] {
  const record = recordValue(value);
  const counts: Partial<Record<BrainSourceKind, number>> = {};

  for (const [key, count] of Object.entries(record)) {
    if (typeof count === "number" && Number.isFinite(count) && count >= 0) {
      counts[brainSourceKind(key)] = count;
    }
  }

  return counts;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dateValue(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
