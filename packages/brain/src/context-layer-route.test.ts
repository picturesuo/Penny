import assert from "node:assert/strict";
import test from "node:test";
import {
  handleContextArtifactsRequest,
  handleContextConnectorConnectRequest,
  handleContextConnectorFetchRequest,
  handleContextConnectorRevokeRequest,
  handleContextConnectorSyncRequest,
  handleContextConsentRequest,
  handleContextDashboardRequest,
  handleContextImportRequest,
  handleContextMemoryCorrectRequest,
  handleContextMemoryDeleteRequest,
  handleContextMemoryReviewRequest,
  handleContextOAuthCallbackRequest,
  handleContextOAuthStartRequest,
  handleContextRetrievalRequest,
  type ContextDashboardPayload,
} from "./context-layer-route.ts";
import { planConnectorScope } from "./context-layer.ts";
import type { BrainScope } from "./scope.ts";

test("GET /api/context/dashboard delegates with request scope", async () => {
  const observedScopes: BrainScope[] = [];
  const response = await handleContextDashboardRequest(scopedRequest("http://localhost/api/context/dashboard"), {
    async loadDashboard(scope) {
      observedScopes.push(scope);
      return dashboard();
    },
  });
  const body = (await response.json()) as { data: ContextDashboardPayload };

  assert.equal(response.status, 200);
  assert.equal(body.data.sourceOfTruth, "context_layer");
  assert.equal(body.data.sources[0]?.provider, "chatgpt");
  assert.deepEqual(observedScopes, [scope]);
});

test("GET /api/context/artifacts returns check risks and due Learn cards", async () => {
  const response = await handleContextArtifactsRequest(scopedRequest("http://localhost/api/context/artifacts?limit=500"), {
    async loadArtifacts(input) {
      assert.deepEqual(input.scope, scope);
      assert.equal(input.limit, 100);

      return {
        sourceOfTruth: "context_layer_artifacts",
        checkResults: [
          {
            id: "check-1",
            nodeId: "node-1",
            claim: "This assumption has weak evidence.",
            risk: "weak_evidence",
            explanation: "The memory only has one redacted source.",
            evidenceIds: ["evidence-1"],
            createdAt: "2026-05-09T12:00:00.000Z",
          },
        ],
        learnCards: [
          {
            id: "learn-1",
            nodeId: "node-2",
            prompt: "Teach back the decision premise.",
            answerHint: "Name the goal and evidence.",
            dueAt: "2026-05-10T12:00:00.000Z",
            strength: 15,
            createdAt: "2026-05-09T12:00:00.000Z",
          },
        ],
      };
    },
  });
  const body = (await response.json()) as {
    data: { sourceOfTruth: string; checkResults: Array<{ risk: string }>; learnCards: Array<{ prompt: string }> };
  };

  assert.equal(response.status, 200);
  assert.equal(body.data.sourceOfTruth, "context_layer_artifacts");
  assert.equal(body.data.checkResults[0]?.risk, "weak_evidence");
  assert.equal(body.data.learnCards[0]?.prompt, "Teach back the decision premise.");
});

test("POST /api/context/connectors validates scope and connects encrypted-token accounts", async () => {
  const blocked = await handleContextConnectorConnectRequest(
    scopedRequest("http://localhost/api/context/connectors", {
      method: "POST",
      body: JSON.stringify({
        provider: "gmail",
        connector: {
          provider: "gmail",
          sourceUri: "gmail:all-mail",
        },
      }),
    }),
  );
  const connected = await handleContextConnectorConnectRequest(
    scopedRequest("http://localhost/api/context/connectors", {
      method: "POST",
      body: JSON.stringify({
        provider: "gmail",
        connector: {
          provider: "gmail",
          labels: ["Penny"],
          searchQueries: ["from:founder@example.com newer_than:90d"],
        },
        token: {
          accessToken: "access-token",
          refreshToken: "refresh-token",
        },
      }),
    }),
    {
      async connectConnector(input) {
        assert.equal(input.provider, "gmail");
        assert.equal(input.connectorPlan.allowed, true);
        assert.equal(input.token?.accessToken, "access-token");

        return {
          connectorAccountId: "conn-1",
          provider: input.provider,
          scopes: [],
          status: "active",
          tokenExpiresAt: null,
          auditEvent: "connector.connected",
        };
      },
    },
  );
  const blockedBody = (await blocked.json()) as { error: { code: string } };
  const connectedBody = (await connected.json()) as { data: { connectorAccountId: string; auditEvent: string } };

  assert.equal(blocked.status, 409);
  assert.equal(blockedBody.error.code, "context_scope_not_allowed");
  assert.equal(connected.status, 201);
  assert.equal(connectedBody.data.connectorAccountId, "conn-1");
  assert.equal(connectedBody.data.auditEvent, "connector.connected");
});

test("POST /api/context/oauth/start delegates a scoped Gmail authorization request", async () => {
  const response = await handleContextOAuthStartRequest(
    scopedRequest("http://localhost/api/context/oauth/start", {
      method: "POST",
      body: JSON.stringify({
        provider: "gmail",
        connector: {
          provider: "gmail",
          labels: ["Penny"],
          searchQueries: ["newer_than:90d"],
        },
        clientId: "client-id",
        redirectUri: "http://localhost/oauth/callback",
        scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
      }),
    }),
    {
      async startOAuth(input) {
        assert.equal(input.provider, "gmail");
        assert.equal(input.clientId, "client-id");
        assert.equal(input.redirectUri, "http://localhost/oauth/callback");
        assert.deepEqual(input.connector.labels, ["Penny"]);
        assert.deepEqual(input.scopes, ["https://www.googleapis.com/auth/gmail.readonly"]);

        return {
          provider: input.provider,
          authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=signed-state",
          state: "signed-state",
          connectorPlan: planConnectorScope(input.connector),
          warnings: [],
        };
      },
    },
  );
  const body = (await response.json()) as { data: { provider: string; authorizationUrl: string; state: string } };

  assert.equal(response.status, 200);
  assert.equal(body.data.provider, "gmail");
  assert.equal(body.data.authorizationUrl.includes("state=signed-state"), true);
  assert.equal(body.data.state, "signed-state");
});

test("POST /api/context/oauth/callback delegates token exchange into connector connection", async () => {
  const response = await handleContextOAuthCallbackRequest(
    scopedRequest("http://localhost/api/context/oauth/callback", {
      method: "POST",
      body: JSON.stringify({
        provider: "calendar",
        code: "oauth-code",
        state: "signed-state",
        clientId: "client-id",
        clientSecret: "client-secret",
        redirectUri: "http://localhost/oauth/callback",
      }),
    }),
    {
      async finishOAuth(input) {
        assert.deepEqual(input.scope, scope);
        assert.equal(input.provider, "calendar");
        assert.equal(input.code, "oauth-code");
        assert.equal(input.state, "signed-state");
        assert.equal(input.clientId, "client-id");
        assert.equal(input.clientSecret, "client-secret");
        assert.equal(input.redirectUri, "http://localhost/oauth/callback");

        return {
          connectorAccountId: "conn-calendar",
          provider: input.provider,
          scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
          status: "active",
          tokenExpiresAt: "2026-05-09T12:00:00.000Z",
          auditEvent: "connector.connected",
        };
      },
    },
  );
  const body = (await response.json()) as { data: { connectorAccountId: string; provider: string; auditEvent: string } };

  assert.equal(response.status, 201);
  assert.equal(body.data.connectorAccountId, "conn-calendar");
  assert.equal(body.data.provider, "calendar");
  assert.equal(body.data.auditEvent, "connector.connected");
});

test("POST /api/context/connectors/:id/fetch delegates selected provider fetch", async () => {
  const fetched = await handleContextConnectorFetchRequest(
    scopedRequest("http://localhost/api/context/connectors/conn-1/fetch", {
      method: "POST",
      body: JSON.stringify({
        provider: "gmail",
        selection: {
          provider: "gmail",
          labels: ["Penny"],
          searchQueries: ["newer_than:90d"],
        },
        maxItems: 500,
      }),
    }),
    "conn-1",
    {
      async fetchConnector(input) {
        assert.deepEqual(input.scope, scope);
        assert.equal(input.connectorAccountId, "conn-1");
        assert.equal(input.provider, "gmail");
        assert.equal(input.maxItems, 100);
        assert.deepEqual(input.selection.labels, ["Penny"]);

        return {
          connectorAccountId: input.connectorAccountId,
          provider: input.provider,
          fetchedAt: "2026-05-09T12:00:00.000Z",
          items: [
            {
              id: "thread-1",
              sourceUri: "gmail:thread:thread-1:message:msg-1",
              label: "Gmail: Launch constraints",
              snippet: "Founder says Penny should remember launch constraints.",
              metadata: {
                subject: "Launch constraints",
              },
            },
          ],
          warnings: [],
          auditEvent: "source.fetched",
        };
      },
    },
  );
  const blocked = await handleContextConnectorFetchRequest(
    scopedRequest("http://localhost/api/context/connectors/conn-1/fetch", {
      method: "POST",
      body: JSON.stringify({
        provider: "gmail",
        selection: {
          provider: "gmail",
          sourceUri: "gmail:all-mail",
        },
      }),
    }),
    "conn-1",
  );
  const fetchedBody = (await fetched.json()) as {
    data: { connectorAccountId: string; items: Array<{ label: string }>; auditEvent: string };
  };
  const blockedBody = (await blocked.json()) as { error: { code: string } };

  assert.equal(fetched.status, 200);
  assert.equal(fetchedBody.data.connectorAccountId, "conn-1");
  assert.equal(fetchedBody.data.items[0]?.label, "Gmail: Launch constraints");
  assert.equal(fetchedBody.data.auditEvent, "source.fetched");
  assert.equal(blocked.status, 409);
  assert.equal(blockedBody.error.code, "context_scope_not_allowed");
});

test("POST /api/context/connectors/:id/sync queues selected Gmail and Calendar sync jobs", async () => {
  const gmailSync = await handleContextConnectorSyncRequest(
    scopedRequest("http://localhost/api/context/connectors/conn-1/sync", {
      method: "POST",
      body: JSON.stringify({
        provider: "gmail",
        selection: {
          provider: "gmail",
          labels: ["Penny"],
        },
        items: [
          {
            id: "thread-1",
            snippet: "I think Penny should remember founder goals.",
            metadata: {
              subject: "Founder goals",
            },
          },
        ],
      }),
    }),
    "conn-1",
    {
      async syncConnector(input) {
        assert.equal(input.connectorAccountId, "conn-1");
        assert.equal(input.provider, "gmail");
        assert.equal(input.items.length, 1);

        return {
          syncJobId: "sync-1",
          provider: input.provider,
          status: "succeeded",
          importsCreated: input.items.length,
          warnings: [],
        };
      },
    },
  );
  const calendarBlocked = await handleContextConnectorSyncRequest(
    scopedRequest("http://localhost/api/context/connectors/conn-1/sync", {
      method: "POST",
      body: JSON.stringify({
        provider: "calendar",
        selection: {
          provider: "calendar",
          readOnly: false,
        },
        items: [],
      }),
    }),
    "conn-1",
  );
  const gmailBody = (await gmailSync.json()) as { data: { syncJobId: string; importsCreated: number } };
  const calendarBody = (await calendarBlocked.json()) as { error: { code: string } };

  assert.equal(gmailSync.status, 202);
  assert.equal(gmailBody.data.syncJobId, "sync-1");
  assert.equal(gmailBody.data.importsCreated, 1);
  assert.equal(calendarBlocked.status, 409);
  assert.equal(calendarBody.error.code, "context_scope_not_allowed");
});

test("PUT /api/context/consent updates memory and training preferences explicitly", async () => {
  const response = await handleContextConsentRequest(
    scopedRequest("http://localhost/api/context/consent", {
      method: "PUT",
      body: JSON.stringify({
        memoryEnabled: true,
        referenceChatgptImport: true,
        referenceGmail: false,
        referenceCalendar: true,
        useForPrivateFineTune: true,
        useToImproveSharedModels: false,
      }),
    }),
    {
      async updateConsent(input) {
        assert.equal(input.consent.memoryEnabled, true);
        assert.equal(input.consent.useForPrivateFineTune, true);
        assert.equal(input.consent.useToImproveSharedModels, false);

        return {
          memoryEnabled: true,
          referenceChatgptImport: true,
          referenceGmail: false,
          referenceCalendar: true,
          useForPrivateFineTune: true,
          useToImproveSharedModels: false,
          auditEvent: "training.preference.updated",
        };
      },
    },
  );
  const invalid = await handleContextConsentRequest(
    scopedRequest("http://localhost/api/context/consent", {
      method: "PUT",
      body: JSON.stringify({
        useToImproveSharedModels: "yes",
      }),
    }),
  );
  const body = (await response.json()) as { data: { useForPrivateFineTune: boolean; auditEvent: string } };
  const invalidBody = (await invalid.json()) as { error: { code: string } };

  assert.equal(response.status, 200);
  assert.equal(body.data.useForPrivateFineTune, true);
  assert.equal(body.data.auditEvent, "training.preference.updated");
  assert.equal(invalid.status, 400);
  assert.equal(invalidBody.error.code, "invalid_consent_update");
});

test("POST /api/context/import runs the scoped ephemeral processing flow", async () => {
  const response = await handleContextImportRequest(
    scopedRequest("http://localhost/api/context/import", {
      method: "POST",
      body: JSON.stringify({
        provider: "chatgpt",
        sourceUri: "chatgpt-export:conversation-1",
        label: "ChatGPT export",
        text: [
          "I think Penny should turn private context into a thinking graph.",
          "My goal is to review source-backed memory before it reaches Brain.",
          "Email me at founder@example.com with password: swordfish.",
        ].join("\n"),
      }),
    }),
    {
      async persistImport(input) {
        return input.processing;
      },
    },
  );
  const body = (await response.json()) as {
    data: {
      sourceOfTruth: string;
      flow: string[];
      processing: {
        chunk: { rawDeleted: boolean };
        redaction: { text: string };
        memoryShards: Array<{ type: string }>;
      };
    };
  };

  assert.equal(response.status, 201);
  assert.equal(body.data.sourceOfTruth, "context_layer_ephemeral_processor");
  assert.equal(body.data.flow.includes("delete_raw_temp_content"), true);
  assert.equal(body.data.processing.chunk.rawDeleted, true);
  assert.equal(body.data.processing.redaction.text.includes("founder@example.com"), false);
  assert.equal(body.data.processing.memoryShards.some((shard) => shard.type === "claim"), true);
  assert.equal(body.data.processing.memoryShards.some((shard) => shard.type === "goal"), true);
});

test("POST /api/context/import rejects broad Gmail import", async () => {
  const response = await handleContextImportRequest(
    scopedRequest("http://localhost/api/context/import", {
      method: "POST",
      body: JSON.stringify({
        provider: "gmail",
        sourceUri: "gmail:all-mail",
        label: "All mail",
        text: "I think this should not run without a selector.",
      }),
    }),
  );
  const body = (await response.json()) as { error: { code: string; details: { allowed: boolean } } };

  assert.equal(response.status, 409);
  assert.equal(body.error.code, "context_scope_not_allowed");
  assert.equal(body.error.details.allowed, false);
});

test("POST /api/context/memories/:id/review validates review actions", async () => {
  const editMissingText = await handleContextMemoryReviewRequest(
    scopedRequest("http://localhost/api/context/memories/mem-1/review", {
      method: "POST",
      body: JSON.stringify({ action: "edit" }),
    }),
    "mem-1",
    {
      async reviewMemory(input) {
        return {
          memoryId: input.memoryId,
          action: input.action,
          reviewStatus: "pending",
          text: input.text,
          mergeIntoMemoryId: input.mergeIntoMemoryId,
          auditEvent: "memory.edited",
        };
      },
    },
  );
  const approve = await handleContextMemoryReviewRequest(
    scopedRequest("http://localhost/api/context/memories/mem-1/review", {
      method: "POST",
      body: JSON.stringify({ action: "approve" }),
    }),
    "mem-1",
    {
      async reviewMemory(input) {
        return {
          memoryId: input.memoryId,
          action: input.action,
          reviewStatus: "approved",
          text: input.text,
          mergeIntoMemoryId: input.mergeIntoMemoryId,
          auditEvent: "memory.approved",
        };
      },
    },
  );
  const approveBody = (await approve.json()) as { data: { memoryId: string; reviewStatus: string; auditEvent: string } };

  assert.equal(editMissingText.status, 400);
  assert.equal(approve.status, 200);
  assert.equal(approveBody.data.memoryId, "mem-1");
  assert.equal(approveBody.data.reviewStatus, "approved");
  assert.equal(approveBody.data.auditEvent, "memory.approved");
});

test("POST /api/context/memories/:id/correct edits or deprioritizes answer memory", async () => {
  const edit = await handleContextMemoryCorrectRequest(
    scopedRequest("http://localhost/api/context/memories/mem-1/correct", {
      method: "POST",
      body: JSON.stringify({ text: "Corrected founder memory with the actual constraint." }),
    }),
    "mem-1",
    {
      async reviewMemory(input) {
        assert.deepEqual(input.scope, scope);
        assert.equal(input.memoryId, "mem-1");
        assert.equal(input.action, "edit");
        assert.equal(input.text, "Corrected founder memory with the actual constraint.");
        assert.equal(input.mergeIntoMemoryId, null);

        return {
          memoryId: input.memoryId,
          action: input.action,
          reviewStatus: "pending",
          text: input.text,
          mergeIntoMemoryId: input.mergeIntoMemoryId,
          auditEvent: "memory.edited",
        };
      },
    },
  );
  const deprioritize = await handleContextMemoryCorrectRequest(
    scopedRequest("http://localhost/api/context/memories/mem-1/correct", {
      method: "POST",
      body: JSON.stringify({ deprioritize: true }),
    }),
    "mem-1",
    {
      async reviewMemory(input) {
        assert.equal(input.action, "deprioritize");

        return {
          memoryId: input.memoryId,
          action: input.action,
          reviewStatus: "deprioritized",
          text: input.text,
          mergeIntoMemoryId: input.mergeIntoMemoryId,
          auditEvent: "memory.edited",
        };
      },
    },
  );
  const empty = await handleContextMemoryCorrectRequest(
    scopedRequest("http://localhost/api/context/memories/mem-1/correct", {
      method: "POST",
      body: JSON.stringify({}),
    }),
    "mem-1",
  );
  const editBody = (await edit.json()) as { data: { action: string; text: string; auditEvent: string } };
  const deprioritizeBody = (await deprioritize.json()) as { data: { action: string; reviewStatus: string } };
  const emptyBody = (await empty.json()) as { error: { code: string } };

  assert.equal(edit.status, 200);
  assert.equal(editBody.data.action, "edit");
  assert.equal(editBody.data.text, "Corrected founder memory with the actual constraint.");
  assert.equal(editBody.data.auditEvent, "memory.edited");
  assert.equal(deprioritize.status, 200);
  assert.equal(deprioritizeBody.data.action, "deprioritize");
  assert.equal(deprioritizeBody.data.reviewStatus, "deprioritized");
  assert.equal(empty.status, 400);
  assert.equal(emptyBody.error.code, "empty_memory_correction");
});

test("DELETE memory and revoke connector endpoints return audit-ready payloads", async () => {
  const deleteResponse = await handleContextMemoryDeleteRequest(
    scopedRequest("http://localhost/api/context/memories/mem-1", { method: "DELETE" }),
    "mem-1",
    {
      async deleteMemory(input) {
        return {
          memoryId: input.memoryId,
          deleted: true,
          rawDeleted: true,
          auditEvent: "memory.deleted",
        };
      },
    },
  );
  const revokeResponse = await handleContextConnectorRevokeRequest(
    scopedRequest("http://localhost/api/context/connectors/conn-1/revoke", { method: "POST" }),
    "conn-1",
    {
      async revokeConnector(input) {
        return {
          connectorAccountId: input.connectorAccountId,
          revoked: true,
          auditEvent: "connector.revoked",
        };
      },
    },
  );
  const deleteBody = (await deleteResponse.json()) as { data: { deleted: boolean; rawDeleted: boolean; auditEvent: string } };
  const revokeBody = (await revokeResponse.json()) as { data: { revoked: boolean; auditEvent: string } };

  assert.equal(deleteResponse.status, 200);
  assert.equal(deleteBody.data.deleted, true);
  assert.equal(deleteBody.data.rawDeleted, true);
  assert.equal(deleteBody.data.auditEvent, "memory.deleted");
  assert.equal(revokeResponse.status, 200);
  assert.equal(revokeBody.data.revoked, true);
  assert.equal(revokeBody.data.auditEvent, "connector.revoked");
});

test("GET /api/context/retrieve returns provenance-backed memory results", async () => {
  const response = await handleContextRetrievalRequest(
    scopedRequest("http://localhost/api/context/retrieve?q=founder%20memory&sourceClass=private_export&limit=2"),
    {
      async retrieveMemories(input) {
        assert.equal(input.request.query, "founder memory");
        assert.equal(input.request.sourceGroup, "private_export");
        assert.equal(input.request.limit, 2);

        return {
          sourceOfTruth: "context_layer_memory_retrieval",
          query: input.request.query,
          results: [
            {
              id: "mem-1",
              text: "Goal: build founder memory with provenance.",
              type: "goal",
              sourceClass: "private_export",
              confidence: 88,
              decay: 0,
              lastSeen: "2026-05-08T12:00:00.000Z",
              topicCluster: "founder_memory",
              evidence: [
                {
                  sourceUri: "chatgpt-export:conversation-1",
                  locator: { chunkHash: "hash-1" },
                  snippetPolicy: "redacted_snippet",
                },
              ],
              score: 0.91,
              provenance: [
                {
                  sourceUri: "chatgpt-export:conversation-1",
                  locator: { chunkHash: "hash-1" },
                  snippetPolicy: "redacted_snippet",
                },
              ],
              scoreBreakdown: {
                lexical: 0.8,
                graph: 0.5,
                recency: 1,
                confidence: 0.88,
                novelty: 0.5,
                project: 0.5,
                decayPenalty: 0,
                contradictionPenalty: 0,
              },
            },
          ],
        };
      },
    },
  );
  const body = (await response.json()) as { data: { sourceOfTruth: string; results: Array<{ provenance: unknown[] }> } };

  assert.equal(response.status, 200);
  assert.equal(body.data.sourceOfTruth, "context_layer_memory_retrieval");
  assert.equal(body.data.results[0]?.provenance.length, 1);
});

test("context endpoints reject wrong HTTP methods before work", async () => {
  const dashboard = await handleContextDashboardRequest(new Request("http://localhost/api/context/dashboard", { method: "POST" }));
  const artifacts = await handleContextArtifactsRequest(new Request("http://localhost/api/context/artifacts", { method: "POST" }));
  const connect = await handleContextConnectorConnectRequest(new Request("http://localhost/api/context/connectors"));
  const sync = await handleContextConnectorSyncRequest(new Request("http://localhost/api/context/connectors/conn-1/sync"), "conn-1");
  const fetch = await handleContextConnectorFetchRequest(new Request("http://localhost/api/context/connectors/conn-1/fetch"), "conn-1");
  const consent = await handleContextConsentRequest(new Request("http://localhost/api/context/consent"));
  const importer = await handleContextImportRequest(new Request("http://localhost/api/context/import"));
  const oauthStart = await handleContextOAuthStartRequest(new Request("http://localhost/api/context/oauth/start"));
  const oauthCallback = await handleContextOAuthCallbackRequest(new Request("http://localhost/api/context/oauth/callback"));
  const retrieval = await handleContextRetrievalRequest(new Request("http://localhost/api/context/retrieve", { method: "POST" }));
  const review = await handleContextMemoryReviewRequest(
    new Request("http://localhost/api/context/memories/mem-1/review"),
    "mem-1",
  );
  const correction = await handleContextMemoryCorrectRequest(
    new Request("http://localhost/api/context/memories/mem-1/correct"),
    "mem-1",
  );
  const deletion = await handleContextMemoryDeleteRequest(
    new Request("http://localhost/api/context/memories/mem-1", { method: "POST" }),
    "mem-1",
  );

  assert.equal(dashboard.status, 405);
  assert.equal(artifacts.status, 405);
  assert.equal(connect.status, 405);
  assert.equal(sync.status, 405);
  assert.equal(fetch.status, 405);
  assert.equal(consent.status, 405);
  assert.equal(importer.status, 405);
  assert.equal(oauthStart.status, 405);
  assert.equal(oauthCallback.status, 405);
  assert.equal(retrieval.status, 405);
  assert.equal(review.status, 405);
  assert.equal(correction.status, 405);
  assert.equal(deletion.status, 405);
});

const scope: BrainScope = {
  userId: "dev-user",
  workspaceId: "dev-workspace",
  projectId: "dev-project",
  sphereId: "dev-sphere",
};

function scopedRequest(url: string, init: RequestInit = {}): Request {
  return new Request(url, {
    ...init,
    headers: {
      ...scopeHeaders(scope),
      ...(init.headers ?? {}),
    },
  });
}

function scopeHeaders(requestScope: BrainScope): HeadersInit {
  return {
    "x-user-id": requestScope.userId ?? "",
    "x-workspace-id": requestScope.workspaceId ?? "",
    "x-project-id": requestScope.projectId ?? "",
    "x-sphere-id": requestScope.sphereId ?? "",
    "content-type": "application/json",
  };
}

function dashboard(): ContextDashboardPayload {
  return {
    sourceOfTruth: "context_layer",
    sources: [
      {
        id: "source-1",
        provider: "chatgpt",
        label: "ChatGPT export",
        scopes: ["manual_export"],
        lastSync: "2026-05-08T12:00:00.000Z",
        memoriesCreated: 3,
        rawRetention: false,
        status: "active",
      },
    ],
    reviewQueue: [
      {
        id: "mem-1",
        text: "I think Penny should review memories.",
        type: "claim",
        sourceClass: "private_export",
        confidence: 70,
        createdAt: "2026-05-08T12:00:00.000Z",
      },
    ],
    consent: {
      memoryEnabled: true,
      referenceChatgptImport: true,
      referenceGmail: false,
      referenceCalendar: false,
      useForPrivateFineTune: false,
      useToImproveSharedModels: false,
    },
    auditSummary: {
      lastAccessAt: "2026-05-08T12:00:00.000Z",
      syncCount: 1,
      extractedMemoryCount: 3,
      deletionCount: 0,
    },
  };
}
