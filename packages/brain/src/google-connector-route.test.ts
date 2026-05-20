import assert from "node:assert/strict";
import test from "node:test";
import {
  handleGoogleConnectorConnectSessionRequest,
  handleGoogleConnectorProviderRequest,
  handleGoogleConnectorSyncNowRequest,
} from "./google-connector-route.ts";
import type { NangoAdapter, NangoConnectSessionInput, NangoStartSyncInput } from "./google-connector.ts";

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
