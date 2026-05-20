import assert from "node:assert/strict";
import test from "node:test";
import {
  handleGoogleConnectorCallbackRequest,
  handleGoogleConnectorConnectSessionRequest,
  handleGoogleConnectorProviderRequest,
  handleGoogleConnectorRevokeRequest,
  handleGoogleConnectorSourceDeleteRequest,
  handleGoogleConnectorSyncCompleteRequest,
  handleGoogleConnectorSyncNowRequest,
  handleGoogleConnectorSyncStatusRequest,
} from "./google-connector-route.ts";
import { createInMemoryBrainMemoryService } from "./brain-memory-route.ts";
import { initializeGoogleConnectorConnection } from "./google-connector.ts";
import type { ConnectorCredentialRef, NangoAdapter, NangoConnectSessionInput, NangoStartSyncInput } from "./google-connector.ts";
import type { BrainRankerRecorder, RecordBrainDevelopmentEventInput } from "./brain-ranker-persistence.ts";
import { createInMemoryGoogleConnectorStateStore } from "./google-connector-state-store.ts";

const configuredEnv = {
  ENABLE_GOOGLE_CONNECTOR: "true",
  NANGO_SECRET_KEY: "nango-secret",
  NANGO_PUBLIC_KEY: "nango-public",
  NANGO_BASE_URL: "https://api.nango.test",
  GOOGLE_OAUTH_CLIENT_ID: "google-client-id",
  GOOGLE_OAUTH_CLIENT_SECRET: "google-client-secret",
};

test("GET /api/connectors/google returns provider status without Nango calls", async () => {
  const response = await handleGoogleConnectorProviderRequest(
    new Request("http://localhost/api/connectors/google", { method: "GET" }),
    { env: configuredEnv, stateStore: createInMemoryGoogleConnectorStateStore() },
  );
  const payload = (await response.json()) as {
    data: {
      sourceOfTruth: string;
      provider: {
        id: string;
        configured: boolean;
        surfaces: Array<{ id: string; status: string }>;
      };
      state: { connections: unknown[] };
    };
  };

  assert.equal(response.status, 200);
  assert.equal(payload.data.sourceOfTruth, "google_connector_registry_and_state");
  assert.equal(payload.data.provider.id, "google");
  assert.equal(payload.data.provider.configured, true);
  assert.equal(payload.data.state.connections.length, 0);
  assert.equal(payload.data.provider.surfaces.some((surface) => surface.id === "google_gmail" && surface.status === "gated_verification_required"), true);
});

test("GET /api/connectors/google shows persisted connected surface state", async () => {
  const scope = { userId: "user-1", workspaceId: "workspace-1", projectId: null, sphereId: null };
  const state = initializeGoogleConnectorConnection({
    scope,
    credential: {
      providerId: "google",
      adapter: "nango",
      connectionId: "nango-google-1",
      providerConfigKey: "google",
      credentialRef: "nango:google:nango-google-1",
      endUserId: "user-1",
    },
    surfaces: ["google_drive", "google_calendar"],
    scopes: ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/calendar.readonly"],
    now: "2026-05-20T12:00:00.000Z",
  });
  const stateStore = createInMemoryGoogleConnectorStateStore(state);
  const response = await handleGoogleConnectorProviderRequest(
    new Request("http://localhost/api/connectors/google", {
      method: "GET",
      headers: {
        "x-user-id": "user-1",
        "x-workspace-id": "workspace-1",
      },
    }),
    { env: configuredEnv, stateStore },
  );
  const payload = (await response.json()) as {
    data: {
      provider: { status: string; surfaces: Array<{ id: string; status: string }> };
      state: { connections: Array<{ status: string; surfaces: string[] }> };
    };
  };

  assert.equal(response.status, 200);
  assert.equal(payload.data.provider.status, "connected");
  assert.equal(payload.data.provider.surfaces.find((surface) => surface.id === "google_drive")?.status, "connected");
  assert.equal(payload.data.provider.surfaces.find((surface) => surface.id === "google_calendar")?.status, "connected");
  assert.deepEqual(payload.data.state.connections[0]?.surfaces, ["google_drive", "google_calendar"]);
});

test("POST /api/connectors/google/connect-session uses scoped headers as Nango tags", async () => {
  let captured: NangoConnectSessionInput | null = null;
  const adapter = fakeAdapter({
    async createConnectSession(input) {
      captured = input;

      return {
        ok: true,
        data: {
          token: "session-token",
          expiresAt: "2026-05-20T12:00:00Z",
          connectLink: "https://connect.nango.test/session-token",
        },
      };
    },
  });
  const response = await handleGoogleConnectorConnectSessionRequest(
    new Request("http://localhost/api/connectors/google/connect-session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": "user-1",
        "x-workspace-id": "workspace-1",
      },
      body: JSON.stringify({ endUserEmail: "user@example.com" }),
    }),
    { adapter },
  );
  const payload = (await response.json()) as { data: { token: string; connectLink: string } };

  assert.equal(response.status, 201);
  assert.equal(payload.data.token, "session-token");
  assert.equal(payload.data.connectLink, "https://connect.nango.test/session-token");
  assert.deepEqual(captured, {
    endUserId: "user-1",
    organizationId: "workspace-1",
    endUserEmail: "user@example.com",
  });
});

test("POST /api/connectors/google/connect-session returns not configured when env is incomplete", async () => {
  const response = await handleGoogleConnectorConnectSessionRequest(
    new Request("http://localhost/api/connectors/google/connect-session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": "user-1",
      },
      body: JSON.stringify({}),
    }),
    { env: { ENABLE_GOOGLE_CONNECTOR: "true" } },
  );
  const payload = (await response.json()) as { error: { code: string; message: string } };

  assert.equal(response.status, 503);
  assert.equal(payload.error.code, "not_configured");
  assert.match(payload.error.message, /NANGO_SECRET_KEY/);
});

test("POST /api/connectors/google/callback returns initialized connection and initial sync state", async () => {
  let captured: ConnectorCredentialRef | null = null;
  const stateStore = createInMemoryGoogleConnectorStateStore();
  const adapter = fakeAdapter({
    async handleCallback(input) {
      const credential: ConnectorCredentialRef = {
        providerId: "google",
        adapter: "nango",
        connectionId: input.connectionId,
        providerConfigKey: input.providerConfigKey,
        credentialRef: `nango:${input.providerConfigKey}:${input.connectionId}`,
        ...(input.endUserId ? { endUserId: input.endUserId } : {}),
      };

      captured = credential;

      return { ok: true, data: credential };
    },
  });
  const response = await handleGoogleConnectorCallbackRequest(
    new Request("http://localhost/api/connectors/google/callback", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": "user-1",
        "x-workspace-id": "workspace-1",
      },
      body: JSON.stringify({
        connectionId: "nango-google-1",
        providerConfigKey: "google",
        endUserId: "user-1",
        scopes: ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/calendar.readonly"],
        now: "2026-05-20T12:00:00.000Z",
      }),
    }),
    { adapter, stateStore },
  );
  const payload = (await response.json()) as {
    data: {
      credential: ConnectorCredentialRef;
      state: {
        connections: Array<{ id: string; status: string; surfaces: string[]; nextSyncAt: string | null }>;
        cursors: Array<{ surface: string; nextSyncAt: string | null }>;
        syncJobs: Array<{ surface: string; status: string }>;
        audits: Array<{ event: string }>;
      };
    };
  };

  assert.equal(response.status, 200);
  assert.deepEqual(payload.data.credential, captured);
  assert.deepEqual(payload.data.state.connections[0]?.surfaces, [
    "google_drive",
    "google_docs_sheets_slides",
    "google_calendar",
  ]);
  assert.equal(payload.data.state.connections[0]?.status, "connected");
  assert.equal(payload.data.state.connections[0]?.nextSyncAt, "2026-05-20T12:00:00.000Z");
  assert.deepEqual(payload.data.state.cursors.map((cursor) => cursor.surface), [
    "google_drive",
    "google_docs_sheets_slides",
    "google_calendar",
  ]);
  assert.equal(payload.data.state.syncJobs.length, 3);
  assert.equal(payload.data.state.syncJobs.every((job) => job.status === "queued"), true);
  assert.equal(payload.data.state.audits.some((audit) => audit.event === "connector.connected"), true);

  const persisted = await stateStore.load({ userId: "user-1", workspaceId: "workspace-1", projectId: null, sphereId: null });
  assert.deepEqual(persisted.connections[0]?.surfaces, payload.data.state.connections[0]?.surfaces);
});

test("POST /api/connectors/google/callback rejects missing surfaces instead of faking access", async () => {
  const response = await handleGoogleConnectorCallbackRequest(
    new Request("http://localhost/api/connectors/google/callback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        connectionId: "nango-google-1",
        providerConfigKey: "google",
      }),
    }),
    { adapter: fakeAdapter({}), stateStore: createInMemoryGoogleConnectorStateStore() },
  );
  const payload = (await response.json()) as { error: { code: string; message: string } };

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, "invalid_request");
  assert.match(payload.error.message, /explicit surfaces|recognizable Google scopes/i);
});

test("POST /api/connectors/google/sync-now triggers default Google sync names", async () => {
  let captured: NangoStartSyncInput | null = null;
  const adapter = fakeAdapter({
    async startSync(input) {
      captured = input;

      return { ok: true, data: { started: true } };
    },
  });
  const response = await handleGoogleConnectorSyncNowRequest(
    new Request("http://localhost/api/connectors/google/sync-now", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        connectionId: "conn-1",
        providerConfigKey: "google",
      }),
    }),
    { adapter, stateStore: createInMemoryGoogleConnectorStateStore() },
  );
  const payload = (await response.json()) as { data: { started: boolean } };

  assert.equal(response.status, 202);
  assert.equal(payload.data.started, true);
  assert.deepEqual(captured, {
    connectionId: "conn-1",
    providerConfigKey: "google",
    syncNames: ["google-drive-files", "google-calendar-events"],
  });
});

test("POST /api/connectors/google/sync-now marks persisted surfaces as syncing", async () => {
  const scope = { userId: "user-1", workspaceId: "workspace-1", projectId: null, sphereId: null };
  const state = initializeGoogleConnectorConnection({
    scope,
    credential: {
      providerId: "google",
      adapter: "nango",
      connectionId: "nango-google-1",
      providerConfigKey: "google",
      credentialRef: "nango:google:nango-google-1",
      endUserId: "user-1",
    },
    surfaces: ["google_drive", "google_calendar"],
    scopes: ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/calendar.readonly"],
    now: "2026-05-20T12:00:00.000Z",
  });
  const stateStore = createInMemoryGoogleConnectorStateStore(state);
  const response = await handleGoogleConnectorSyncNowRequest(
    new Request("http://localhost/api/connectors/google/sync-now", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": "user-1",
        "x-workspace-id": "workspace-1",
      },
      body: JSON.stringify({
        connectionId: "nango-google-1",
        providerConfigKey: "google",
        surface: "google_drive",
        now: "2026-05-20T12:10:00.000Z",
      }),
    }),
    {
      stateStore,
      adapter: fakeAdapter({
        async startSync() {
          return { ok: true, data: { started: true } };
        },
      }),
    },
  );
  const payload = (await response.json()) as {
    data: { started: boolean; state: { connections: Array<{ status: string }>; syncJobs: Array<{ surface: string; status: string }> } };
  };

  assert.equal(response.status, 202);
  assert.equal(payload.data.started, true);
  assert.equal(payload.data.state.connections[0]?.status, "syncing");
  assert.equal(payload.data.state.syncJobs.some((job) => job.surface === "google_drive" && job.status === "running"), true);
});

test("GET /api/connectors/google/sync-status returns mocked Nango sync status", async () => {
  let captured: { connectionId: string; providerConfigKey: string; syncNames?: readonly string[] } | null = null;
  const adapter = fakeAdapter({
    async getSyncStatus(input) {
      captured = input;

      return {
        ok: true,
        data: {
          syncs: [
            {
              id: "sync-drive",
              name: "google-drive-files",
              status: "syncing",
              finishedAt: null,
              nextScheduledSyncAt: "2026-05-20T18:10:00.000Z",
              recordCount: { google_doc: 2 },
            },
          ],
        },
      };
    },
  });
  const response = await handleGoogleConnectorSyncStatusRequest(
    new Request(
      "http://localhost/api/connectors/google/sync-status?connectionId=nango-google-1&providerConfigKey=google&syncNames=google-drive-files",
      {
        method: "GET",
      },
    ),
    { adapter, stateStore: createInMemoryGoogleConnectorStateStore() },
  );
  const payload = (await response.json()) as {
    data: { syncs: Array<{ name: string; status: string; recordCount: Record<string, number> }> };
  };

  assert.equal(response.status, 200);
  assert.deepEqual(captured, {
    connectionId: "nango-google-1",
    providerConfigKey: "google",
    syncNames: ["google-drive-files"],
  });
  assert.equal(payload.data.syncs[0]?.name, "google-drive-files");
  assert.equal(payload.data.syncs[0]?.status, "syncing");
  assert.equal(payload.data.syncs[0]?.recordCount.google_doc, 2);
});

test("POST /api/connectors/google/revoke marks persisted connection revoked", async () => {
  const scope = { userId: "user-1", workspaceId: "workspace-1", projectId: null, sphereId: null };
  const state = initializeGoogleConnectorConnection({
    scope,
    credential: {
      providerId: "google",
      adapter: "nango",
      connectionId: "nango-google-1",
      providerConfigKey: "google",
      credentialRef: "nango:google:nango-google-1",
      endUserId: "user-1",
    },
    surfaces: ["google_calendar"],
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    now: "2026-05-20T12:00:00.000Z",
  });
  const stateStore = createInMemoryGoogleConnectorStateStore(state);
  const response = await handleGoogleConnectorRevokeRequest(
    new Request("http://localhost/api/connectors/google/revoke", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": "user-1",
        "x-workspace-id": "workspace-1",
      },
      body: JSON.stringify({
        connectionId: "nango-google-1",
        providerConfigKey: "google",
      }),
    }),
    {
      stateStore,
      adapter: fakeAdapter({
        async revokeConnection() {
          return { ok: true, data: { revoked: true } };
        },
      }),
    },
  );
  const payload = (await response.json()) as {
    data: { revoked: boolean; state: { connections: Array<{ status: string; nextSyncAt: string | null }> } };
  };

  assert.equal(response.status, 200);
  assert.equal(payload.data.revoked, true);
  assert.equal(payload.data.state.connections[0]?.status, "revoked");
  assert.equal(payload.data.state.connections[0]?.nextSyncAt, null);
});

test("POST /api/connectors/google/sync-complete imports Google records into private Brain memory", async () => {
  const scope = { userId: "user-1", workspaceId: "workspace-1", projectId: null, sphereId: null };
  const state = initializeGoogleConnectorConnection({
    scope,
    credential: {
      providerId: "google",
      adapter: "nango",
      connectionId: "nango-google-1",
      providerConfigKey: "google",
      credentialRef: "nango:google:nango-google-1",
      endUserId: "user-1",
    },
    surfaces: ["google_drive"],
    scopes: ["https://www.googleapis.com/auth/drive.file"],
    now: "2026-05-20T12:00:00.000Z",
  });
  const stateStore = createInMemoryGoogleConnectorStateStore(state);
  const events: RecordBrainDevelopmentEventInput[] = [];
  const rankerRecorder: BrainRankerRecorder = {
    async recordCreateRankerRun() {
      throw new Error("Google connector sync should not record Create ranker runs.");
    },
    async recordDevelopmentEvent(input) {
      events.push(input);
    },
  };
  const brainMemoryService = createInMemoryBrainMemoryService(new Map(), rankerRecorder);
  const response = await handleGoogleConnectorSyncCompleteRequest(
    new Request("http://localhost/api/connectors/google/sync-complete", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": "user-1",
        "x-workspace-id": "workspace-1",
      },
      body: JSON.stringify({
        connectionId: "nango-google-1",
        providerConfigKey: "google",
        jobId: state.syncJobs[0]?.id,
        surface: "google_drive",
        cursor: "drive-cursor-2",
        nextSyncAt: "2026-05-20T18:05:00.000Z",
        now: "2026-05-20T12:05:00.000Z",
        sources: [
          {
            surface: "google_drive",
            kind: "google_doc",
            externalId: "doc-1",
            sourceUri: "google-drive:file:doc-1",
            label: "Strategy doc",
            url: "https://docs.google.com/document/d/doc-1",
            content:
              "Project: Penny should use selected Google Docs as private source-backed memory. Preference: keep connector claims honest and provenance visible.",
          },
        ],
      }),
    }),
    { stateStore, brainMemoryService },
  );
  const payload = (await response.json()) as {
    data: {
      importedSources: Array<{ brainSourceId: string; memoryNodeCount: number }>;
      state: {
        connections: Array<{ lastSyncedAt: string | null; sourceCounts: Record<string, number> }>;
        sources: Array<{
          brainSourceId: string | null;
          brainNodeIds: string[];
          privacy: { retrievalAccess: string; trainingUse: boolean; rawContentStored: boolean };
          provenance: { credentialRef: string; cursor: string | null };
          sourceRef: { providerId: string; surface: string; externalId: string; url: string | null };
        }>;
        cursors: Array<{ surface: string; cursor: string | null; lastSyncedAt: string | null; nextSyncAt: string | null }>;
        syncJobs: Array<{ id: string; status: string; sourceCounts: Record<string, number> }>;
        audits: Array<{ event: string; sourceId: string | null }>;
      };
    };
  };
  const profile = await brainMemoryService.getProfile(
    new Request("http://localhost/api/brain/memory/profile", {
      headers: {
        "x-user-id": "user-1",
        "x-workspace-id": "workspace-1",
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(payload.data.importedSources.length, 1);
  assert.equal(payload.data.state.connections[0]?.lastSyncedAt, "2026-05-20T12:05:00.000Z");
  assert.equal(payload.data.state.connections[0]?.sourceCounts.google_doc, 1);
  assert.equal(payload.data.state.sources[0]?.brainSourceId, payload.data.importedSources[0]?.brainSourceId);
  assert.ok((payload.data.state.sources[0]?.brainNodeIds.length ?? 0) >= 1);
  assert.equal(payload.data.state.sources[0]?.privacy.trainingUse, false);
  assert.equal(payload.data.state.sources[0]?.privacy.rawContentStored, false);
  assert.equal(payload.data.state.sources[0]?.privacy.retrievalAccess, "enabled");
  assert.equal(payload.data.state.sources[0]?.provenance.credentialRef, "nango:google:nango-google-1");
  assert.equal(payload.data.state.sources[0]?.provenance.cursor, "drive-cursor-2");
  assert.equal(payload.data.state.sources[0]?.sourceRef.providerId, "google");
  assert.equal(payload.data.state.sources[0]?.sourceRef.externalId, "doc-1");
  assert.equal(payload.data.state.cursors.find((cursor) => cursor.surface === "google_drive")?.cursor, "drive-cursor-2");
  assert.equal(payload.data.state.syncJobs.find((job) => job.id === state.syncJobs[0]?.id)?.status, "succeeded");
  assert.equal(payload.data.state.syncJobs.find((job) => job.id === state.syncJobs[0]?.id)?.sourceCounts.google_doc, 1);
  assert.ok(payload.data.state.audits.some((audit) => audit.event === "connector.sync_completed"));
  assert.ok(payload.data.state.audits.some((audit) => audit.event === "connector.source_indexed" && audit.sourceId));
  assert.equal(profile.sources.some((source) => source.sourceUri === "google-drive:file:doc-1"), true);
  assert.equal(profile.sources.find((source) => source.sourceUri === "google-drive:file:doc-1")?.privacy.rawRetention, false);
  assert.equal(profile.sources.find((source) => source.sourceUri === "google-drive:file:doc-1")?.privacy.trainingUse, false);
  assert.ok(profile.recentMemoryNodes.some((node) => node.sourceId === payload.data.importedSources[0]?.brainSourceId));
  assert.ok(profile.profile.recentMeaningfulActivity.some((activity) => activity.kind === "source_synced" && activity.label === "Synced Strategy doc"));
  assert.ok(events.some((event) => event.kind === "source_synced" && event.payload?.sourceUri === "google-drive:file:doc-1"));
  assert.equal(events.some((event) => event.kind === "source_imported"), false);
});

test("POST /api/connectors/google/sync-complete rejects source refs without content", async () => {
  const response = await handleGoogleConnectorSyncCompleteRequest(
    new Request("http://localhost/api/connectors/google/sync-complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        connectionId: "nango-google-1",
        providerConfigKey: "google",
        jobId: "sync-1",
        surface: "google_drive",
        nextSyncAt: "2026-05-20T18:05:00.000Z",
        sources: [
          {
            surface: "google_drive",
            kind: "google_doc",
            externalId: "doc-1",
            sourceUri: "google-drive:file:doc-1",
            label: "Strategy doc",
            content: "",
          },
        ],
      }),
    }),
    { stateStore: createInMemoryGoogleConnectorStateStore(), brainMemoryService: createInMemoryBrainMemoryService() },
  );
  const payload = (await response.json()) as { error: { code: string; message: string } };

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, "invalid_request");
  assert.match(payload.error.message, /content/i);
});

test("POST /api/connectors/google/source-delete removes connector and Brain retrieval access", async () => {
  const scope = { userId: "user-1", workspaceId: "workspace-1", projectId: null, sphereId: null };
  const state = initializeGoogleConnectorConnection({
    scope,
    credential: {
      providerId: "google",
      adapter: "nango",
      connectionId: "nango-google-1",
      providerConfigKey: "google",
      credentialRef: "nango:google:nango-google-1",
      endUserId: "user-1",
    },
    surfaces: ["google_drive"],
    scopes: ["https://www.googleapis.com/auth/drive.file"],
    now: "2026-05-20T12:00:00.000Z",
  });
  const stateStore = createInMemoryGoogleConnectorStateStore(state);
  const brainMemoryService = createInMemoryBrainMemoryService();
  const completeResponse = await handleGoogleConnectorSyncCompleteRequest(
    new Request("http://localhost/api/connectors/google/sync-complete", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": "user-1",
        "x-workspace-id": "workspace-1",
      },
      body: JSON.stringify({
        connectionId: "nango-google-1",
        providerConfigKey: "google",
        jobId: state.syncJobs[0]?.id,
        surface: "google_drive",
        nextSyncAt: "2026-05-20T18:05:00.000Z",
        sources: [
          {
            surface: "google_drive",
            kind: "google_doc",
            externalId: "doc-1",
            sourceUri: "google-drive:file:doc-1",
            label: "Strategy doc",
            content:
              "Project: Penny should delete connector-linked Brain sources when users remove Google retrieval access.",
          },
        ],
      }),
    }),
    { stateStore, brainMemoryService },
  );
  const completePayload = (await completeResponse.json()) as { data: { state: { sources: Array<{ id: string }> } } };
  const sourceId = completePayload.data.state.sources[0]?.id ?? "";
  const deleteResponse = await handleGoogleConnectorSourceDeleteRequest(
    new Request("http://localhost/api/connectors/google/source-delete", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": "user-1",
        "x-workspace-id": "workspace-1",
      },
      body: JSON.stringify({
        sourceId,
        now: "2026-05-20T12:06:00.000Z",
      }),
    }),
    { stateStore, brainMemoryService },
  );
  const deletePayload = (await deleteResponse.json()) as {
    data: {
      deleted: boolean;
      brainSourceDeleted: boolean;
      profile: { stats: { sourceCount: number } };
      state: { sources: Array<{ privacy: { retrievalAccess: string } }> };
    };
  };

  assert.equal(deleteResponse.status, 200);
  assert.equal(deletePayload.data.deleted, true);
  assert.equal(deletePayload.data.brainSourceDeleted, true);
  assert.equal(deletePayload.data.profile.stats.sourceCount, 0);
  assert.equal(deletePayload.data.state.sources[0]?.privacy.retrievalAccess, "deleted");
});

function fakeAdapter(overrides: Partial<NangoAdapter>): NangoAdapter {
  return {
    async createConnectSession() {
      throw new Error("Unexpected createConnectSession call.");
    },
    async handleCallback() {
      throw new Error("Unexpected handleCallback call.");
    },
    async listConnections() {
      throw new Error("Unexpected listConnections call.");
    },
    async getCredentials() {
      throw new Error("Unexpected getCredentials call.");
    },
    async revokeConnection() {
      throw new Error("Unexpected revokeConnection call.");
    },
    async startSync() {
      throw new Error("Unexpected startSync call.");
    },
    async getSyncStatus() {
      throw new Error("Unexpected getSyncStatus call.");
    },
    async refreshConnection() {
      throw new Error("Unexpected refreshConnection call.");
    },
    ...overrides,
  };
}
