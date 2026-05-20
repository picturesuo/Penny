import assert from "node:assert/strict";
import test from "node:test";
import {
  handleGoogleConnectorCallbackRequest,
  handleGoogleConnectorConnectSessionRequest,
  handleGoogleConnectorProviderRequest,
  handleGoogleConnectorSyncNowRequest,
} from "./google-connector-route.ts";
import type { ConnectorCredentialRef, NangoAdapter, NangoConnectSessionInput, NangoStartSyncInput } from "./google-connector.ts";

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
    { env: configuredEnv },
  );
  const payload = (await response.json()) as {
    data: {
      sourceOfTruth: string;
      provider: {
        id: string;
        configured: boolean;
        surfaces: Array<{ id: string; status: string }>;
      };
    };
  };

  assert.equal(response.status, 200);
  assert.equal(payload.data.sourceOfTruth, "google_connector_registry");
  assert.equal(payload.data.provider.id, "google");
  assert.equal(payload.data.provider.configured, true);
  assert.equal(payload.data.provider.surfaces.some((surface) => surface.id === "google_gmail" && surface.status === "gated_verification_required"), true);
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
  const adapter = fakeAdapter({
    async handleCallback(input) {
      const credential: ConnectorCredentialRef = {
        providerId: "google",
        adapter: "nango",
        connectionId: input.connectionId,
        providerConfigKey: input.providerConfigKey,
        credentialRef: `nango:${input.providerConfigKey}:${input.connectionId}`,
        endUserId: input.endUserId,
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
    { adapter },
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
    { adapter: fakeAdapter({}) },
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
    { adapter },
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
