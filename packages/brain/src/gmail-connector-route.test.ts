import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryBrainMemoryService, handleBrainRetrieveRequest } from "./brain-memory-route.ts";
import { handleGoogleConnectorSourceDeleteRequest } from "./google-connector-route.ts";
import {
  buildGmailSearchQuery,
  handleGoogleGmailConnectRequest,
  handleGoogleGmailRevokeRequest,
  handleGoogleGmailSearchRequest,
  handleGoogleGmailSemanticSearchRequest,
  handleGoogleGmailStatusRequest,
  handleGoogleGmailSyncRequest,
  parseGmailMessage,
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
import { createInMemoryGoogleConnectorStateStore, mergeGoogleConnectorStates } from "./google-connector-state-store.ts";

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

test("Gmail sync paginates safe messages and skips spam or trash by default", async () => {
  const { stateStore, brainMemoryService, proxyCalls } = gmailFixture();
  const response = await handleGoogleGmailSyncRequest(
    gmailRequest("/api/connectors/google/gmail/sync", {
      connectionId: "nango-gmail-1",
      providerConfigKey: "google-gmail",
      text: "launch partner evidence",
      maxResults: 2,
      pageLimit: 2,
    }),
    {
      env: configuredEnv,
      stateStore,
      brainMemoryService,
      adapter: fakeAdapter({
        async proxy(input) {
          proxyCalls.push(input);

          if (input.path === "users/me/profile") {
            return gmailProxyOk({ emailAddress: "founder@example.com", historyId: "history-400" });
          }

          if (input.path === "users/me/messages" && !input.query?.pageToken) {
            return gmailProxyOk({
              messages: [
                { id: "msg-spam", threadId: "thread-spam" },
                { id: "msg-1", threadId: "thread-1" },
              ],
              nextPageToken: "page-2",
            });
          }

          if (input.path === "users/me/messages" && input.query?.pageToken === "page-2") {
            return gmailProxyOk({ messages: [{ id: "msg-2", threadId: "thread-2" }] });
          }

          if (input.path === "users/me/messages/msg-spam") {
            return gmailProxyOk({
              ...gmailMessageVariant({
                id: "msg-spam",
                threadId: "thread-spam",
                historyId: "history-spam",
                subject: "Spam launch evidence",
                from: "Spam <spam@example.com>",
                snippet: "This spam message must not enter Penny memory.",
                body: "This spam message must not enter Penny memory.",
              }),
              labelIds: ["SPAM"],
            });
          }

          if (input.path === "users/me/messages/msg-1") {
            return gmailProxyOk(gmailMessage());
          }

          if (input.path === "users/me/messages/msg-2") {
            return gmailProxyOk(
              gmailMessageVariant({
                id: "msg-2",
                threadId: "thread-2",
                historyId: "history-402",
                subject: "Second launch partner follow-up",
                from: "Carol <carol@example.com>",
                snippet: "Second safe Gmail evidence for launch partners.",
                body: "Second safe Gmail evidence for launch partners.",
              }),
            );
          }

          throw new Error(`Unexpected Gmail proxy path ${input.path}.`);
        },
      }),
    },
  );
  const payload = (await response.json()) as {
    data: {
      messageCount: number;
      nextPageToken: string | null;
      importedSources: Array<{ messageId: string }>;
      state: { sources: Array<{ sourceUri: string }> };
    };
  };
  const listCalls = proxyCalls.filter((call) => call.path === "users/me/messages");
  const profile = await brainMemoryService.getProfile(gmailRequest("/api/brain/memory/profile", {}, "GET"));

  assert.equal(response.status, 200);
  assert.equal(payload.data.messageCount, 2);
  assert.deepEqual(
    payload.data.importedSources.map((source) => source.messageId).sort(),
    ["msg-1", "msg-2"],
  );
  assert.equal(payload.data.state.sources.some((source) => source.sourceUri === "gmail:message:msg-spam"), false);
  assert.equal(profile.sources.some((source) => source.sourceUri === "gmail:message:msg-spam"), false);
  assert.equal(listCalls.length, 2);
  assert.equal(listCalls[0]?.query?.includeSpamTrash, false);
  assert.equal(listCalls[1]?.query?.pageToken, "page-2");
});

test("Gmail sync does not duplicate connector refs or Brain sources on repeated sync", async () => {
  const { stateStore, brainMemoryService, proxyCalls } = gmailFixture();
  const options = {
    env: configuredEnv,
    stateStore,
    brainMemoryService,
    adapter: gmailProxyAdapter(proxyCalls),
  };

  await handleGoogleGmailSyncRequest(
    gmailRequest("/api/connectors/google/gmail/sync", {
      connectionId: "nango-gmail-1",
      providerConfigKey: "google-gmail",
      maxResults: 1,
      now: "2026-05-22T12:00:00.000Z",
    }),
    options,
  );
  const secondResponse = await handleGoogleGmailSyncRequest(
    gmailRequest("/api/connectors/google/gmail/sync", {
      connectionId: "nango-gmail-1",
      providerConfigKey: "google-gmail",
      maxResults: 1,
      now: "2026-05-22T13:00:00.000Z",
    }),
    options,
  );
  const payload = (await secondResponse.json()) as {
    data: {
      state: {
        sources: Array<{ sourceUri: string; brainSourceId: string | null }>;
        cursors: Array<{ surface: string; cursor: string | null }>;
      };
    };
  };
  const profile = await brainMemoryService.getProfile(gmailRequest("/api/brain/memory/profile", {}, "GET"));

  assert.equal(secondResponse.status, 200);
  assert.equal(payload.data.state.sources.filter((source) => source.sourceUri === "gmail:message:msg-1").length, 1);
  assert.equal(profile.sources.filter((source) => source.sourceUri === "gmail:message:msg-1").length, 1);
  assert.equal(profile.stats.sourceCount, 1);
  assert.equal(payload.data.state.cursors.find((cursor) => cursor.surface === "google_gmail")?.cursor, "history-100");
});

test("Gmail sync is scoped and cannot use another user's connection", async () => {
  const { stateStore, brainMemoryService } = gmailFixture();
  const response = await handleGoogleGmailSyncRequest(
    new Request("http://localhost/api/connectors/google/gmail/sync", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": "user-2",
        "x-workspace-id": "workspace-1",
      },
      body: JSON.stringify({
        connectionId: "nango-gmail-1",
        providerConfigKey: "google-gmail",
        maxResults: 1,
      }),
    }),
    {
      env: configuredEnv,
      stateStore,
      brainMemoryService,
      adapter: fakeAdapter({
        async proxy() {
          throw new Error("Cross-user sync must not reach Gmail proxy.");
        },
      }),
    },
  );
  const payload = (await response.json()) as { error: { code: string; message: string } };
  const profile = await brainMemoryService.getProfile(gmailRequest("/api/brain/memory/profile", {}, "GET"));

  assert.equal(response.status, 404);
  assert.equal(payload.error.code, "gmail_connection_not_found");
  assert.equal(profile.stats.sourceCount, 0);
});

test("Gmail sync reports partial message detail failures without failing the whole sync", async () => {
  const { stateStore, brainMemoryService, proxyCalls } = gmailFixture();
  const response = await handleGoogleGmailSyncRequest(
    gmailRequest("/api/connectors/google/gmail/sync", {
      connectionId: "nango-gmail-1",
      providerConfigKey: "google-gmail",
      maxResults: 2,
    }),
    {
      env: configuredEnv,
      stateStore,
      brainMemoryService,
      adapter: fakeAdapter({
        async proxy(input) {
          proxyCalls.push(input);

          if (input.path === "users/me/profile") {
            return gmailProxyOk({ emailAddress: "founder@example.com", historyId: "history-200" });
          }

          if (input.path === "users/me/messages") {
            return gmailProxyOk({ messages: [{ id: "msg-1", threadId: "thread-1" }, { id: "msg-2", threadId: "thread-2" }] });
          }

          if (input.path === "users/me/messages/msg-1") {
            return gmailProxyOk(gmailMessage());
          }

          if (input.path === "users/me/messages/msg-2") {
            return {
              ok: false,
              error: {
                code: "nango_request_failed",
                message: "Gmail returned 403 for this message.",
                retryable: false,
                details: { status: 403 },
              },
            };
          }

          throw new Error(`Unexpected Gmail proxy path ${input.path}.`);
        },
      }),
    },
  );
  const payload = (await response.json()) as {
    data: {
      messageCount: number;
      partialFailureCount: number;
      partialFailures: Array<{ messageId: string; threadId: string | null; retryable: boolean; status: number | null; message: string }>;
      state: { sources: Array<{ sourceUri: string }> };
    };
  };

  assert.equal(response.status, 200);
  assert.equal(payload.data.messageCount, 1);
  assert.equal(payload.data.partialFailureCount, 1);
  assert.deepEqual(payload.data.partialFailures[0], {
    messageId: "msg-2",
    threadId: "thread-2",
    stage: "message_detail",
    retryable: false,
    status: 403,
    errorCode: "nango_request_failed",
    message: "Gmail returned 403 for this message.",
  });
  assert.equal(payload.data.state.sources.some((source) => source.sourceUri === "gmail:message:msg-1"), true);
  assert.equal(payload.data.state.sources.some((source) => source.sourceUri === "gmail:message:msg-2"), false);
});

test("Gmail sync retries retryable Gmail proxy failures before importing", async () => {
  const { stateStore, brainMemoryService } = gmailFixture();
  let detailAttempts = 0;
  const response = await handleGoogleGmailSyncRequest(
    gmailRequest("/api/connectors/google/gmail/sync", {
      connectionId: "nango-gmail-1",
      providerConfigKey: "google-gmail",
      maxResults: 1,
    }),
    {
      env: configuredEnv,
      stateStore,
      brainMemoryService,
      adapter: fakeAdapter({
        async proxy(input) {
          if (input.path === "users/me/profile") {
            return gmailProxyOk({ emailAddress: "founder@example.com", historyId: "history-300" });
          }

          if (input.path === "users/me/messages") {
            return gmailProxyOk({ messages: [{ id: "msg-1", threadId: "thread-1" }] });
          }

          if (input.path === "users/me/messages/msg-1") {
            detailAttempts += 1;

            if (detailAttempts < 3) {
              return {
                ok: false,
                error: {
                  code: "nango_request_failed",
                  message: "Gmail rate limit.",
                  retryable: true,
                  details: { status: 429 },
                },
              };
            }

            return gmailProxyOk(gmailMessage());
          }

          throw new Error(`Unexpected Gmail proxy path ${input.path}.`);
        },
      }),
    },
  );
  const payload = (await response.json()) as { data: { messageCount: number; partialFailureCount: number } };

  assert.equal(response.status, 200);
  assert.equal(detailAttempts, 3);
  assert.equal(payload.data.messageCount, 1);
  assert.equal(payload.data.partialFailureCount, 0);
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

test("Gmail keyword search is scoped and cannot use another user's connection", async () => {
  const { stateStore, brainMemoryService } = gmailFixture();
  const response = await handleGoogleGmailSearchRequest(
    new Request("http://localhost/api/connectors/google/gmail/search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": "user-2",
        "x-workspace-id": "workspace-1",
      },
      body: JSON.stringify({ text: "launch partners" }),
    }),
    {
      env: configuredEnv,
      stateStore,
      brainMemoryService,
      adapter: fakeAdapter({
        async proxy() {
          throw new Error("Cross-user search must not reach Gmail proxy.");
        },
      }),
    },
  );
  const payload = (await response.json()) as { error: { code: string; message: string } };

  assert.equal(response.status, 404);
  assert.equal(payload.error.code, "gmail_connection_not_found");
});

test("Gmail keyword search refuses connections missing gmail.readonly before proxy access", async () => {
  const { stateStore, brainMemoryService } = gmailFixture({ scopes: ["https://www.googleapis.com/auth/drive.file"] });
  const response = await handleGoogleGmailSearchRequest(
    gmailRequest("/api/connectors/google/gmail/search", {
      connectionId: "nango-gmail-1",
      providerConfigKey: "google-gmail",
      text: "launch partners",
    }),
    {
      env: configuredEnv,
      stateStore,
      brainMemoryService,
      adapter: fakeAdapter({
        async proxy() {
          throw new Error("Gmail search must not reach the proxy without gmail.readonly.");
        },
      }),
    },
  );
  const payload = (await response.json()) as { error: { code: string; message: string } };

  assert.equal(response.status, 409);
  assert.equal(payload.error.code, "gmail_scope_invalid");
  assert.equal(payload.error.message, "Gmail connection is missing gmail.readonly scope.");
});

test("Gmail semantic search asks the user to sync before memory exists", async () => {
  const { stateStore, brainMemoryService } = gmailFixture();
  const response = await handleGoogleGmailSemanticSearchRequest(
    gmailRequest("/api/connectors/google/gmail/semantic-search", {
      query: "launch partner private email evidence",
    }),
    { stateStore, brainMemoryService },
  );
  const payload = (await response.json()) as { error: { code: string; message: string } };

  assert.equal(response.status, 409);
  assert.equal(payload.error.code, "gmail_not_synced");
  assert.equal(payload.error.message, "Sync Gmail first.");
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

test("Gmail semantic search can target one selected Gmail connection", async () => {
  const scope = { userId: "user-1", workspaceId: "workspace-1", projectId: null, sphereId: null };
  const firstState = initializeGoogleConnectorConnection({
    scope,
    credential: {
      providerId: "google",
      adapter: "nango",
      connectionId: "nango-gmail-1",
      providerConfigKey: "google-gmail",
      credentialRef: "nango:google-gmail:nango-gmail-1",
      accountEmail: "first@example.com",
      endUserId: "user-1",
    },
    surfaces: ["google_gmail"],
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    now: "2026-05-22T11:00:00.000Z",
  });
  const secondState = initializeGoogleConnectorConnection({
    scope,
    credential: {
      providerId: "google",
      adapter: "nango",
      connectionId: "nango-gmail-2",
      providerConfigKey: "google-gmail",
      credentialRef: "nango:google-gmail:nango-gmail-2",
      accountEmail: "second@example.com",
      endUserId: "user-1",
    },
    surfaces: ["google_gmail"],
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    now: "2026-05-22T11:00:00.000Z",
  });
  const stateStore = createInMemoryGoogleConnectorStateStore(mergeGoogleConnectorStates(firstState, secondState));
  const brainMemoryService = createInMemoryBrainMemoryService();
  const adapter = fakeAdapter({
    async proxy(input) {
      const selected = input.connectionId === "nango-gmail-2"
        ? {
            id: "msg-2",
            threadId: "thread-2",
            historyId: "history-202",
            subject: "Second account launch evidence",
            from: "Second <second@example.com>",
            snippet: "Second account private Gmail evidence for launch partners.",
            body: "Project: Penny should use second account private Gmail evidence for launch partners.",
          }
        : {
            id: "msg-1",
            threadId: "thread-1",
            historyId: "history-101",
            subject: "First account launch evidence",
            from: "First <first@example.com>",
            snippet: "First account private Gmail evidence for launch partners.",
            body: "Project: Penny should use first account private Gmail evidence for launch partners.",
          };

      if (input.path === "users/me/profile") {
        return gmailProxyOk({ emailAddress: input.connectionId === "nango-gmail-2" ? "second@example.com" : "first@example.com", historyId: selected.historyId });
      }

      if (input.path === "users/me/messages") {
        return gmailProxyOk({ messages: [{ id: selected.id, threadId: selected.threadId }] });
      }

      if (input.path === `users/me/messages/${selected.id}`) {
        return gmailProxyOk(gmailMessageVariant(selected));
      }

      throw new Error(`Unexpected Gmail proxy path ${input.path}.`);
    },
  });

  for (const connectionId of ["nango-gmail-1", "nango-gmail-2"]) {
    const syncResponse = await handleGoogleGmailSyncRequest(
      gmailRequest("/api/connectors/google/gmail/sync", {
        connectionId,
        providerConfigKey: "google-gmail",
        text: "private Gmail evidence",
        maxResults: 1,
      }),
      {
        env: configuredEnv,
        stateStore,
        brainMemoryService,
        adapter,
      },
    );

    assert.equal(syncResponse.status, 200);
  }

  const selectedResponse = await handleGoogleGmailSemanticSearchRequest(
    gmailRequest("/api/connectors/google/gmail/semantic-search", {
      connectionId: "nango-gmail-2",
      providerConfigKey: "google-gmail",
      query: "private Gmail evidence launch partners",
      limit: 5,
    }),
    { stateStore, brainMemoryService },
  );
  const selectedPayload = (await selectedResponse.json()) as { data: { results: Array<{ messageId: string; sender: string }> } };
  const missingResponse = await handleGoogleGmailSemanticSearchRequest(
    gmailRequest("/api/connectors/google/gmail/semantic-search", {
      connectionId: "nango-gmail-missing",
      providerConfigKey: "google-gmail",
      query: "private Gmail evidence launch partners",
      limit: 5,
    }),
    { stateStore, brainMemoryService },
  );

  assert.equal(selectedResponse.status, 200);
  assert.ok(selectedPayload.data.results.length > 0);
  assert.equal(selectedPayload.data.results.every((result) => result.messageId === "msg-2"), true);
  assert.equal(selectedPayload.data.results.every((result) => /second@example\.com/i.test(result.sender)), true);
  assert.equal(missingResponse.status, 404);
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

  const syncAfterRevoke = await handleGoogleGmailSyncRequest(
    gmailRequest("/api/connectors/google/gmail/sync", {
      connectionId: "nango-gmail-1",
      providerConfigKey: "google-gmail",
    }),
    {
      env: configuredEnv,
      stateStore,
      brainMemoryService,
      adapter: gmailProxyAdapter([]),
    },
  );
  const searchAfterRevoke = await handleGoogleGmailSearchRequest(
    gmailRequest("/api/connectors/google/gmail/search", {
      connectionId: "nango-gmail-1",
      providerConfigKey: "google-gmail",
      text: "launch partners",
    }),
    {
      env: configuredEnv,
      stateStore,
      brainMemoryService,
      adapter: gmailProxyAdapter([]),
    },
  );
  const semanticAfterRevoke = await handleGoogleGmailSemanticSearchRequest(
    gmailRequest("/api/connectors/google/gmail/semantic-search", {
      query: "launch partner private email evidence",
      limit: 5,
    }),
    { stateStore, brainMemoryService },
  );

  assert.equal(syncAfterRevoke.status, 409);
  assert.equal(searchAfterRevoke.status, 409);
  assert.equal(semanticAfterRevoke.status, 409);
});

test("Gmail source delete still removes Brain retrieval after revoke", async () => {
  const { stateStore, brainMemoryService, proxyCalls } = gmailFixture();
  const syncResponse = await handleGoogleGmailSyncRequest(
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
  const syncPayload = (await syncResponse.json()) as {
    data: {
      state: {
        sources: Array<{ id: string; sourceUri: string; brainSourceId: string | null; privacy: { retrievalAccess: string } }>;
      };
    };
  };
  const source = syncPayload.data.state.sources.find((candidate) => candidate.sourceUri === "gmail:message:msg-1");

  assert.equal(syncResponse.status, 200);
  assert.ok(source?.id);
  assert.ok(source.brainSourceId);

  await handleGoogleGmailRevokeRequest(
    gmailRequest("/api/connectors/google/gmail/revoke", {
      connectionId: "nango-gmail-1",
      providerConfigKey: "google-gmail",
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
  const profileAfterRevoke = await brainMemoryService.getProfile(gmailRequest("/api/brain/memory/profile", {}, "GET"));
  const deleteResponse = await handleGoogleConnectorSourceDeleteRequest(
    gmailRequest("/api/connectors/google/source-delete", {
      sourceId: source.id,
      now: "2026-05-22T12:45:00.000Z",
    }),
    { stateStore, brainMemoryService },
  );
  const deletePayload = (await deleteResponse.json()) as {
    data: {
      brainSourceDeleted: boolean;
      profile: { stats: { sourceCount: number; memoryNodeCount: number } };
      state: { sources: Array<{ sourceUri: string; privacy: { retrievalAccess: string } }> };
    };
  };
  const semanticAfterDelete = await handleGoogleGmailSemanticSearchRequest(
    gmailRequest("/api/connectors/google/gmail/semantic-search", {
      query: "launch partner private email evidence",
      limit: 5,
    }),
    { stateStore, brainMemoryService },
  );

  assert.equal(profileAfterRevoke.sources.some((profileSource) => profileSource.id === source.brainSourceId), true);
  assert.equal(deleteResponse.status, 200);
  assert.equal(deletePayload.data.brainSourceDeleted, true);
  assert.equal(deletePayload.data.profile.stats.sourceCount, 0);
  assert.equal(deletePayload.data.profile.stats.memoryNodeCount, 0);
  assert.equal(
    deletePayload.data.state.sources.find((stateSource) => stateSource.sourceUri === "gmail:message:msg-1")?.privacy.retrievalAccess,
    "deleted",
  );
  assert.equal(semanticAfterDelete.status, 409);
});

test("Gmail source delete removes Brain retrieval access and semantic results", async () => {
  const { stateStore, brainMemoryService, proxyCalls } = gmailFixture();
  const syncResponse = await handleGoogleGmailSyncRequest(
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
  const syncPayload = (await syncResponse.json()) as {
    data: {
      state: {
        sources: Array<{ id: string; sourceUri: string; brainSourceId: string | null; privacy: { retrievalAccess: string } }>;
      };
    };
  };
  const source = syncPayload.data.state.sources.find((candidate) => candidate.sourceUri === "gmail:message:msg-1");
  const semanticBeforeDelete = await handleGoogleGmailSemanticSearchRequest(
    gmailRequest("/api/connectors/google/gmail/semantic-search", {
      query: "launch partner private email evidence",
      limit: 5,
    }),
    { stateStore, brainMemoryService },
  );
  const brainRetrieveBeforeDelete = await handleBrainRetrieveRequest(
    gmailRequest("/api/brain/retrieve", {
      query: "launch partner private email evidence",
      limit: 5,
    }),
    { service: brainMemoryService },
  );
  const brainRetrieveBeforePayload = (await brainRetrieveBeforeDelete.json()) as {
    data: { results: Array<{ sourceId: string; sourceRef: { url?: string | null } }> };
  };
  const sourceId = source?.id ?? "";
  const deleteResponse = await handleGoogleConnectorSourceDeleteRequest(
    gmailRequest("/api/connectors/google/source-delete", {
      sourceId,
      now: "2026-05-22T12:30:00.000Z",
    }),
    { stateStore, brainMemoryService },
  );
  const deletePayload = (await deleteResponse.json()) as {
    data: {
      brainSourceDeleted: boolean;
      profile: { stats: { sourceCount: number; memoryNodeCount: number } };
      state: { sources: Array<{ sourceUri: string; privacy: { retrievalAccess: string } }> };
    };
  };
  const statusResponse = await handleGoogleGmailStatusRequest(gmailRequest("/api/connectors/google/gmail/status", {}, "GET"), {
    env: configuredEnv,
    stateStore,
  });
  const statusPayload = (await statusResponse.json()) as { data: { messageCount: number; sources: unknown[] } };
  const semanticAfterDelete = await handleGoogleGmailSemanticSearchRequest(
    gmailRequest("/api/connectors/google/gmail/semantic-search", {
      query: "launch partner private email evidence",
      limit: 5,
    }),
    { stateStore, brainMemoryService },
  );
  const semanticAfterPayload = (await semanticAfterDelete.json()) as { error: { code: string; message: string } };
  const brainRetrieveAfterDelete = await handleBrainRetrieveRequest(
    gmailRequest("/api/brain/retrieve", {
      query: "launch partner private email evidence",
      limit: 5,
    }),
    { service: brainMemoryService },
  );
  const brainRetrieveAfterPayload = (await brainRetrieveAfterDelete.json()) as {
    data: { results: Array<{ sourceId: string; sourceRef: { url?: string | null } }> };
  };

  assert.equal(syncResponse.status, 200);
  assert.equal(semanticBeforeDelete.status, 200);
  assert.ok(sourceId);
  assert.ok(source?.brainSourceId);
  assert.equal(brainRetrieveBeforeDelete.status, 200);
  assert.equal(
    brainRetrieveBeforePayload.data.results.some(
      (result) => result.sourceId === source.brainSourceId || result.sourceRef.url === "gmail:message:msg-1",
    ),
    true,
  );
  assert.equal(deleteResponse.status, 200);
  assert.equal(deletePayload.data.brainSourceDeleted, true);
  assert.equal(deletePayload.data.profile.stats.sourceCount, 0);
  assert.equal(deletePayload.data.profile.stats.memoryNodeCount, 0);
  assert.equal(
    deletePayload.data.state.sources.find((source) => source.sourceUri === "gmail:message:msg-1")?.privacy.retrievalAccess,
    "deleted",
  );
  assert.equal(statusPayload.data.messageCount, 0);
  assert.equal(statusPayload.data.sources.length, 0);
  assert.equal(semanticAfterDelete.status, 409);
  assert.equal(semanticAfterPayload.error.code, "gmail_not_synced");
  assert.equal(semanticAfterPayload.error.message, "Sync Gmail first.");
  assert.equal(brainRetrieveAfterDelete.status, 200);
  assert.equal(
    brainRetrieveAfterPayload.data.results.some(
      (result) => result.sourceId === source.brainSourceId || result.sourceRef.url === "gmail:message:msg-1",
    ),
    false,
  );
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

test("parseGmailMessage keeps attachment metadata only and caps body size", () => {
  const parsed = parseGmailMessage({
    ...gmailMessage(),
    payload: {
      mimeType: "multipart/mixed",
      headers: [
        { name: "Subject", value: "Launch plan with deck" },
        { name: "From", value: "Alice <alice@example.com>" },
        { name: "To", value: "Bob <bob@example.com>" },
        { name: "Date", value: "Fri, 22 May 2026 12:00:00 +0000" },
      ],
      parts: [
        {
          mimeType: "text/plain",
          body: { data: base64Url("a".repeat(120_000)) },
        },
        {
          filename: "launch-plan.pdf",
          mimeType: "application/pdf",
          body: {
            attachmentId: "attachment-1",
          },
        },
      ],
    },
  });

  assert.equal(parsed.hasAttachment, true);
  assert.deepEqual(parsed.attachments, [{ filename: "launch-plan.pdf", mimeType: "application/pdf", attachmentId: "attachment-1" }]);
  assert.equal(parsed.bodyTruncated, true);
  assert.equal(parsed.plainTextBody.length, 100_000);
  assert.doesNotMatch(parsed.plainTextBody, /attachment-1/);
});

function gmailFixture(input: { scopes?: string[] } = {}) {
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
    scopes: input.scopes ?? ["https://www.googleapis.com/auth/gmail.readonly"],
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

function gmailProxyOk(body: unknown): ConnectorAdapterResult<NangoProxyResponse> {
  return {
    ok: true,
    data: {
      status: 200,
      headers: {},
      body,
    },
  };
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

function gmailMessageVariant(input: {
  id: string;
  threadId: string;
  historyId: string;
  subject: string;
  from: string;
  snippet: string;
  body: string;
}) {
  return {
    id: input.id,
    threadId: input.threadId,
    historyId: input.historyId,
    labelIds: ["INBOX"],
    snippet: input.snippet,
    internalDate: "1779451200000",
    payload: {
      mimeType: "multipart/alternative",
      headers: [
        { name: "Subject", value: input.subject },
        { name: "From", value: input.from },
        { name: "To", value: "Bob <bob@example.com>" },
        { name: "Date", value: "Fri, 22 May 2026 12:00:00 +0000" },
        { name: "Message-ID", value: `<${input.id}@example.com>` },
      ],
      parts: [
        {
          mimeType: "text/plain",
          body: {
            data: base64Url(input.body),
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
