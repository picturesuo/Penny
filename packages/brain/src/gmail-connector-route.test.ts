import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryBrainMemoryService } from "./brain-memory-route.ts";
import {
  buildGmailSearchQuery,
  handleGoogleGmailConnectRequest,
  handleGoogleGmailRevokeRequest,
  handleGoogleGmailSearchRequest,
  handleGoogleGmailSemanticSearchRequest,
  handleGoogleGmailStatusRequest,
  handleGoogleGmailSyncRequest,
} from "./gmail-connector-route.ts";
import { initializeGoogleConnectorConnection } from "./google-connector.ts";
import type {
  ConnectorAdapterResult,
  NangoAdapter,
  NangoConnectSession,
  NangoConnectSessionInput,
  NangoConnectionInput,
  NangoCredentialPayload,
  NangoCredentialsInput,
  NangoListConnectionsInput,
  NangoProxyInput,
  NangoProxyResponse,
  NangoStartSyncInput,
  NangoSyncStatus,
  NangoSyncStatusInput,
} from "./google-connector.ts";
import { createInMemoryGoogleConnectorStateStore } from "./google-connector-state-store.ts";

const configuredEnv = {
  ENABLE_GOOGLE_CONNECTOR: "true",
  ENABLE_GMAIL_CONNECTOR: "true",
  ENABLE_RESTRICTED_GOOGLE_SCOPES: "true",
  NANGO_SECRET_KEY: "nango-secret",
  NANGO_PUBLIC_KEY: "nango-public",
  NANGO_BASE_URL: "https://api.nango.test",
  NANGO_GMAIL_INTEGRATION_ID: "google-gmail",
};

test("Gmail connect returns Gmail not configured when required env is missing", async () => {
  const response = await handleGoogleGmailConnectRequest(
    new Request("http://localhost/api/connectors/google/gmail/connect", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": "user-1",
      },
      body: JSON.stringify({}),
    }),
    { env: { ENABLE_GOOGLE_CONNECTOR: "true", NANGO_SECRET_KEY: "nango-secret" } },
  );
  const payload = (await response.json()) as { error: { code: string; message: string; details: { missingConfig: string[] } } };

  assert.equal(response.status, 503);
  assert.equal(payload.error.code, "gmail_not_configured");
  assert.equal(payload.error.message, "Gmail not configured.");
  assert.ok(payload.error.details.missingConfig.includes("ENABLE_GMAIL_CONNECTOR"));
  assert.ok(payload.error.details.missingConfig.includes("NANGO_GMAIL_INTEGRATION_ID"));
});

test("Gmail connect creates a Nango session for gmail.readonly only", async () => {
  let captured: NangoConnectSessionInput | null = null;
  const adapter = fakeAdapter({
    async createConnectSession(input) {
      captured = input;

      return {
        ok: true,
        data: {
          token: "gmail-session-token",
          expiresAt: "2026-05-22T12:00:00.000Z",
          connectLink: "https://connect.nango.test/gmail-session-token",
        },
      };
    },
  });
  const response = await handleGoogleGmailConnectRequest(
    new Request("http://localhost/api/connectors/google/gmail/connect", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": "user-1",
        "x-workspace-id": "workspace-1",
      },
      body: JSON.stringify({ endUserEmail: "founder@example.com" }),
    }),
    { env: configuredEnv, adapter },
  );
  const payload = (await response.json()) as {
    data: {
      providerConfigKey: string;
      requestableScopeUrls: string[];
      scopeAuditReason: string;
      restrictedScope: boolean;
    };
  };

  assert.equal(response.status, 201);
  assert.equal(payload.data.providerConfigKey, "google-gmail");
  assert.deepEqual(payload.data.requestableScopeUrls, ["https://www.googleapis.com/auth/gmail.readonly"]);
  assert.equal(payload.data.scopeAuditReason, "read email for private Brain memory and email search.");
  assert.equal(payload.data.restrictedScope, true);
  assert.deepEqual(captured, {
    endUserId: "user-1",
    organizationId: "workspace-1",
    endUserEmail: "founder@example.com",
    allowedIntegrations: ["google-gmail"],
    tags: {
      penny_google_bundle: "gmail",
      penny_google_surfaces: "google_gmail",
      penny_google_scope_ids: "google.gmail.readonly",
      penny_scope_audit_reason: "read email for private Brain memory and email search.",
    },
  });
});

test("Gmail sync imports mocked messages into private Brain memory through Nango proxy", async () => {
  const { stateStore, brainMemoryService, proxyCalls } = gmailFixture();
  const response = await handleGoogleGmailSyncRequest(
    gmailRequest("/api/connectors/google/gmail/sync", {
      connectionId: "nango-gmail-1",
      providerConfigKey: "google-gmail",
      maxResults: 1,
      now: "2026-05-22T12:00:00.000Z",
    }),
    {
      env: configuredEnv,
      stateStore,
      brainMemoryService,
      adapter: gmailProxyAdapter(proxyCalls),
    },
  );
  const payload = (await response.json()) as {
    data: {
      messageCount: number;
      cursor: string;
      importedSources: Array<{ messageId: string; brainSourceId: string; memoryNodeCount: number }>;
      state: {
        sources: Array<{ kind: string; metadata: Record<string, unknown>; privacy: { trainingUse: boolean; rawContentStored: boolean } }>;
        cursors: Array<{ surface: string; cursor: string | null }>;
      };
    };
  };
  const profile = await brainMemoryService.getProfile(gmailRequest("/api/brain/memory/profile", {}, "GET"));

  assert.equal(response.status, 200);
  assert.equal(payload.data.messageCount, 1);
  assert.equal(payload.data.cursor, "history-100");
  assert.equal(payload.data.importedSources[0]?.messageId, "msg-1");
  assert.ok((payload.data.importedSources[0]?.memoryNodeCount ?? 0) >= 1);
  assert.equal(payload.data.state.sources[0]?.kind, "google_gmail_message");
  assert.equal(payload.data.state.sources[0]?.metadata.subject, "Launch partner follow-up");
  assert.equal(payload.data.state.sources[0]?.privacy.trainingUse, false);
  assert.equal(payload.data.state.sources[0]?.privacy.rawContentStored, false);
  assert.equal(payload.data.state.cursors.find((cursor) => cursor.surface === "google_gmail")?.cursor, "history-100");
  assert.equal(profile.sources.some((source) => source.sourceUri === "gmail:message:msg-1"), true);
  assert.equal(profile.sources.find((source) => source.sourceUri === "gmail:message:msg-1")?.privacy.rawRetention, false);
  assert.ok(proxyCalls.some((call) => call.path === "users/me/profile"));
  assert.ok(proxyCalls.some((call) => call.path === "users/me/messages"));
  assert.ok(proxyCalls.some((call) => call.path === "users/me/messages/msg-1"));
});

test("Gmail keyword search builds a Gmail q string and does not store content by default", async () => {
  const { stateStore, brainMemoryService, proxyCalls } = gmailFixture();
  const response = await handleGoogleGmailSearchRequest(
    gmailRequest("/api/connectors/google/gmail/search", {
      connectionId: "nango-gmail-1",
      providerConfigKey: "google-gmail",
      text: "launch partners",
      from: "alice@example.com",
      to: "bob@example.com",
      subject: "Launch plan",
      label: "inbox",
      after: "2026-05-01",
      before: "2026-05-21",
      hasAttachment: true,
      maxResults: 5,
    }),
    {
      env: configuredEnv,
      stateStore,
      brainMemoryService,
      adapter: gmailProxyAdapter(proxyCalls),
    },
  );
  const payload = (await response.json()) as { data: { query: string; stored: boolean; results: Array<{ subject: string; snippet: string }> } };
  const profile = await brainMemoryService.getProfile(gmailRequest("/api/brain/memory/profile", {}, "GET"));

  assert.equal(response.status, 200);
  assert.equal(
    payload.data.query,
    '"launch partners" from:alice@example.com to:bob@example.com subject:"Launch plan" label:inbox after:2026/05/01 before:2026/05/21 has:attachment',
  );
  assert.equal(payload.data.stored, false);
  assert.equal(payload.data.results[0]?.subject, "Launch partner follow-up");
  assert.equal(profile.stats.sourceCount, 0);
  assert.equal(
    proxyCalls.find((call) => call.path === "users/me/messages")?.query?.q,
    payload.data.query,
  );
});

test("Gmail semantic search ranks synced email memory without leaking raw scores or cross-user data", async () => {
  const { stateStore, brainMemoryService, proxyCalls } = gmailFixture();
  await handleGoogleGmailSyncRequest(
    gmailRequest("/api/connectors/google/gmail/sync", {
      connectionId: "nango-gmail-1",
      providerConfigKey: "google-gmail",
      maxResults: 1,
      now: "2026-05-22T12:00:00.000Z",
    }),
    {
      env: configuredEnv,
      stateStore,
      brainMemoryService,
      adapter: gmailProxyAdapter(proxyCalls),
    },
  );

  const response = await handleGoogleGmailSemanticSearchRequest(
    gmailRequest("/api/connectors/google/gmail/semantic-search", {
      query: "launch partner private email evidence",
      limit: 5,
    }),
    { stateStore, brainMemoryService },
  );
  const payload = (await response.json()) as {
    data: {
      sourceOfTruth: string;
      contextLight: boolean;
      results: Array<Record<string, unknown> & { messageId: string; subject: string; grounding: string; scoreReason: string }>;
    };
  };
  const crossUserResponse = await handleGoogleGmailSemanticSearchRequest(
    new Request("http://localhost/api/connectors/google/gmail/semantic-search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": "user-2",
        "x-workspace-id": "workspace-1",
      },
      body: JSON.stringify({ query: "launch partner private email evidence" }),
    }),
    { stateStore, brainMemoryService },
  );

  assert.equal(response.status, 200);
  assert.equal(payload.data.sourceOfTruth, "synced_private_gmail_brain_memory");
  assert.equal(payload.data.contextLight, false);
  assert.equal(payload.data.results[0]?.messageId, "msg-1");
  assert.equal(payload.data.results[0]?.subject, "Launch partner follow-up");
  assert.match(payload.data.results[0]?.scoreReason, /synced Gmail memory/);
  assert.equal("score" in (payload.data.results[0] ?? {}), false);
  assert.equal(crossUserResponse.status, 409);
});

test("Gmail revoke removes retrieval access for synced Gmail sources", async () => {
  const { stateStore, brainMemoryService, proxyCalls } = gmailFixture();
  await handleGoogleGmailSyncRequest(
    gmailRequest("/api/connectors/google/gmail/sync", {
      connectionId: "nango-gmail-1",
      providerConfigKey: "google-gmail",
      maxResults: 1,
    }),
    {
      env: configuredEnv,
      stateStore,
      brainMemoryService,
      adapter: gmailProxyAdapter(proxyCalls),
    },
  );
  const response = await handleGoogleGmailRevokeRequest(
    gmailRequest("/api/connectors/google/gmail/revoke", {
      connectionId: "nango-gmail-1",
      providerConfigKey: "google-gmail",
    }),
    {
      stateStore,
      adapter: fakeAdapter({
        async revokeConnection(input) {
          assert.equal(input.connectionId, "nango-gmail-1");
          assert.equal(input.providerConfigKey, "google-gmail");
          return { ok: true, data: { revoked: true } };
        },
      }),
    },
  );
  const payload = (await response.json()) as {
    data: { state: { connections: Array<{ status: string }>; sources: Array<{ privacy: { retrievalAccess: string } }> } };
  };
  const statusResponse = await handleGoogleGmailStatusRequest(gmailRequest("/api/connectors/google/gmail/status", {}, "GET"), {
    env: configuredEnv,
    stateStore,
  });
  const statusPayload = (await statusResponse.json()) as { data: { messageCount: number } };

  assert.equal(response.status, 200);
  assert.equal(payload.data.state.connections[0]?.status, "revoked");
  assert.equal(payload.data.state.sources[0]?.privacy.retrievalAccess, "revoked");
  assert.equal(statusPayload.data.messageCount, 0);
});

test("buildGmailSearchQuery omits unsupported send/modify scopes and formats exact Gmail search terms", () => {
  assert.equal(
    buildGmailSearchQuery({
      text: "private beta",
      from: "founder@example.com",
      subject: "Beta notes",
      label: ["inbox", "penny"],
    }),
    '"private beta" from:founder@example.com subject:"Beta notes" label:inbox label:penny',
  );
});

function gmailFixture() {
  const scope = { userId: "user-1", workspaceId: "workspace-1", projectId: null, sphereId: null };
  const state = initializeGoogleConnectorConnection({
    scope,
    credential: {
      providerId: "google",
      adapter: "nango",
      connectionId: "nango-gmail-1",
      providerConfigKey: "google-gmail",
      credentialRef: "nango:google-gmail:nango-gmail-1",
      accountEmail: "founder@example.com",
      endUserId: "user-1",
    },
    surfaces: ["google_gmail"],
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    now: "2026-05-22T11:00:00.000Z",
  });

  return {
    stateStore: createInMemoryGoogleConnectorStateStore(state),
    brainMemoryService: createInMemoryBrainMemoryService(),
    proxyCalls: [] as NangoProxyInput[],
  };
}

function gmailRequest(path: string, body: Record<string, unknown>, method = "POST"): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-user-id": "user-1",
      "x-workspace-id": "workspace-1",
    },
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
}

function gmailProxyAdapter(proxyCalls: NangoProxyInput[]): NangoAdapter {
  return fakeAdapter({
    async proxy(input) {
      proxyCalls.push(input);

      if (input.path === "users/me/profile") {
        return {
          ok: true,
          data: {
            status: 200,
            headers: {},
            body: {
              emailAddress: "founder@example.com",
              messagesTotal: 42,
              threadsTotal: 21,
              historyId: "history-100",
            },
          },
        };
      }

      if (input.path === "users/me/messages") {
        return {
          ok: true,
          data: {
            status: 200,
            headers: {},
            body: {
              messages: [{ id: "msg-1", threadId: "thread-1" }],
              resultSizeEstimate: 1,
            },
          },
        };
      }

      if (input.path === "users/me/messages/msg-1") {
        return {
          ok: true,
          data: {
            status: 200,
            headers: {},
            body: gmailMessage(),
          },
        };
      }

      throw new Error(`Unexpected Gmail proxy path ${input.path}.`);
    },
  });
}

function gmailMessage() {
  return {
    id: "msg-1",
    threadId: "thread-1",
    historyId: "history-101",
    labelIds: ["INBOX", "IMPORTANT"],
    snippet: "Project: Penny should remember launch partner email follow-ups.",
    internalDate: "1779451200000",
    payload: {
      mimeType: "multipart/alternative",
      headers: [
        { name: "Subject", value: "Launch partner follow-up" },
        { name: "From", value: "Alice <alice@example.com>" },
        { name: "To", value: "Bob <bob@example.com>" },
        { name: "Cc", value: "Penny <penny@example.com>" },
        { name: "Date", value: "Fri, 22 May 2026 12:00:00 +0000" },
        { name: "Message-ID", value: "<msg-1@example.com>" },
      ],
      parts: [
        {
          mimeType: "text/plain",
          body: {
            data: base64Url(
              "Project: Penny should remember launch partner email follow-ups. Preference: keep private email evidence visible in Create.",
            ),
          },
        },
      ],
    },
  };
}

function base64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fakeAdapter(overrides: Partial<NangoAdapter>): NangoAdapter {
  return {
    async createConnectSession(): Promise<ConnectorAdapterResult<NangoConnectSession>> {
      throw new Error("Unexpected createConnectSession call.");
    },
    async handleCallback() {
      throw new Error("Unexpected handleCallback call.");
    },
    async listConnections(_input?: NangoListConnectionsInput) {
      throw new Error("Unexpected listConnections call.");
    },
    async getCredentials(_input: NangoCredentialsInput): Promise<ConnectorAdapterResult<NangoCredentialPayload>> {
      throw new Error("Unexpected getCredentials call.");
    },
    async revokeConnection(_input: NangoConnectionInput): Promise<ConnectorAdapterResult<{ revoked: true }>> {
      throw new Error("Unexpected revokeConnection call.");
    },
    async startSync(_input: NangoStartSyncInput) {
      throw new Error("Unexpected startSync call.");
    },
    async getSyncStatus(_input: NangoSyncStatusInput): Promise<ConnectorAdapterResult<NangoSyncStatus>> {
      throw new Error("Unexpected getSyncStatus call.");
    },
    async refreshConnection(_input: NangoConnectionInput): Promise<ConnectorAdapterResult<NangoCredentialPayload>> {
      throw new Error("Unexpected refreshConnection call.");
    },
    async proxy(_input: NangoProxyInput): Promise<ConnectorAdapterResult<NangoProxyResponse>> {
      throw new Error("Unexpected proxy call.");
    },
    ...overrides,
  };
}
