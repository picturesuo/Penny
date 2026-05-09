import assert from "node:assert/strict";
import test from "node:test";
import {
  handleContextConnectorConnectRequest,
  handleContextConnectorRevokeRequest,
  handleContextConnectorSyncRequest,
  handleContextConsentRequest,
  handleContextDashboardRequest,
  handleContextImportRequest,
  handleContextMemoryDeleteRequest,
  handleContextMemoryReviewRequest,
  handleContextRetrievalRequest,
  type ContextDashboardPayload,
} from "./context-layer-route.ts";
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
  const connect = await handleContextConnectorConnectRequest(new Request("http://localhost/api/context/connectors"));
  const sync = await handleContextConnectorSyncRequest(new Request("http://localhost/api/context/connectors/conn-1/sync"), "conn-1");
  const consent = await handleContextConsentRequest(new Request("http://localhost/api/context/consent"));
  const importer = await handleContextImportRequest(new Request("http://localhost/api/context/import"));
  const retrieval = await handleContextRetrievalRequest(new Request("http://localhost/api/context/retrieve", { method: "POST" }));
  const review = await handleContextMemoryReviewRequest(
    new Request("http://localhost/api/context/memories/mem-1/review"),
    "mem-1",
  );
  const deletion = await handleContextMemoryDeleteRequest(
    new Request("http://localhost/api/context/memories/mem-1", { method: "POST" }),
    "mem-1",
  );

  assert.equal(dashboard.status, 405);
  assert.equal(connect.status, 405);
  assert.equal(sync.status, 405);
  assert.equal(consent.status, 405);
  assert.equal(importer.status, 405);
  assert.equal(retrieval.status, 405);
  assert.equal(review.status, 405);
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
