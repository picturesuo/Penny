import assert from "node:assert/strict";
import test from "node:test";
import {
  handleBrainSearchRequest,
  handleSessionCanvasRequest,
  type BrainSearchPayload,
  type BrainSearchRouteService,
  type SessionCanvasPayload,
} from "./brain-search-route.ts";
import type { BrainSearchInput } from "./domain/repository.ts";
import type { BrainSearchResult, CanvasEdge, CanvasNode } from "./domain/types.ts";
import type { BrainScope } from "./scope.ts";

const scope: BrainScope = {
  userId: "dev-user",
  workspaceId: "dev-workspace",
  projectId: "dev-project",
  sphereId: "dev-sphere",
};

test("GET /api/brain/search delegates hybrid search with header scope", async () => {
  const calls: BrainSearchInput[] = [];
  const response = await handleBrainSearchRequest(scopedRequest("http://localhost/api/brain/search?q=founder%20payment&limit=3"), {
    service: routeService({
      async search(input) {
        calls.push(input);
        return [searchResult()];
      },
    }),
  });
  const body = (await response.json()) as { data: BrainSearchPayload };

  assert.equal(response.status, 200);
  assert.equal(calls[0]?.query, "founder payment");
  assert.equal(calls[0]?.limit, 3);
  assert.deepEqual(calls[0]?.scope, scope);
  assert.equal(body.data.mode, "hybrid_json_embedding_fallback");
  assert.equal(body.data.results[0]?.objectType, "claim_version");
});

test("GET /api/brain/search validates q and limit", async () => {
  const missingQuery = await handleBrainSearchRequest(scopedRequest("http://localhost/api/brain/search"));
  const badLimit = await handleBrainSearchRequest(scopedRequest("http://localhost/api/brain/search?q=test&limit=1000"));

  assert.equal(missingQuery.status, 400);
  assert.equal(badLimit.status, 400);
});

test("GET /api/sessions/:sessionId/canvas returns Wave 8 canvas contract", async () => {
  const sessionId = uuidAt(101);
  const calls: Array<{ scope: BrainScope; sessionId: string }> = [];
  const response = await handleSessionCanvasRequest(scopedRequest(`http://localhost/api/sessions/${sessionId}/canvas`), sessionId, {
    service: routeService({
      async listCanvas(requestScope, requestSessionId) {
        calls.push({ scope: requestScope, sessionId: requestSessionId });
        return {
          nodes: [canvasNode()],
          edges: [canvasEdge()],
        };
      },
    }),
  });
  const body = (await response.json()) as { data: SessionCanvasPayload };

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ scope, sessionId }]);
  assert.equal(body.data.sourceOfTruth, "claims_claim_versions_claim_edges_sources_session_notes_brain_objects_artifacts");
  assert.equal(body.data.nodes[0]?.type, "claim");
  assert.equal(body.data.edges[0]?.type, "depends_on");
  assert.equal(body.data.meta.nodeCount, 1);
  assert.equal(body.data.meta.edgeCount, 1);
});

test("GET /api/sessions/:sessionId/canvas validates method and session id", async () => {
  const badMethod = await handleSessionCanvasRequest(
    new Request(`http://localhost/api/sessions/${uuidAt(101)}/canvas`, { method: "POST" }),
    uuidAt(101),
  );
  const badSession = await handleSessionCanvasRequest(scopedRequest("http://localhost/api/sessions/nope/canvas"), "nope");

  assert.equal(badMethod.status, 405);
  assert.equal(badSession.status, 400);
});

function routeService(overrides: Partial<BrainSearchRouteService> = {}): BrainSearchRouteService {
  return {
    async search() {
      return [];
    },
    async listCanvas() {
      return { nodes: [], edges: [] };
    },
    ...overrides,
  };
}

function scopedRequest(url: string): Request {
  return new Request(url, {
    headers: {
      "x-user-id": scope.userId ?? "",
      "x-workspace-id": scope.workspaceId ?? "",
      "x-project-id": scope.projectId ?? "",
      "x-sphere-id": scope.sphereId ?? "",
    },
  });
}

function searchResult(): BrainSearchResult {
  return {
    objectType: "claim_version",
    objectId: uuidAt(701),
    sessionId: uuidAt(101),
    title: "Founder payment claim",
    preview: "Founders pay for structured thinking when an artifact is urgent.",
    score: 1,
    semanticScore: 1,
    lexicalScore: 0,
    source: "semantic",
    metadata: { claimId: uuidAt(201) },
    updatedAt: "2026-05-01T00:00:00.000Z",
  };
}

function canvasNode(): CanvasNode {
  return {
    id: `claim:${uuidAt(201)}`,
    claimId: uuidAt(201),
    type: "claim",
    title: "Founder payment claim",
    status: "recent",
    confidence: 60,
  };
}

function canvasEdge(): CanvasEdge {
  return {
    id: `claim_edge:${uuidAt(301)}`,
    sourceId: `claim:${uuidAt(201)}`,
    targetId: `claim:${uuidAt(202)}`,
    type: "depends_on",
    provenance: "claim_edge",
  };
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}
