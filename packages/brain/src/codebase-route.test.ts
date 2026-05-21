import assert from "node:assert/strict";
import test from "node:test";
import {
  handleCodebaseAuditRequest,
  handleCodebaseContextRequest,
  handleCodebaseIngestRequest,
  handleCodebaseScanRequest,
  handleCodebaseSearchRequest,
} from "./codebase-route.ts";
import type {
  CodebaseAuditPayload,
  CodebaseContextPayload,
  CodebaseMemoryRepository,
  CodebaseScanDetail,
  CodebaseSearchInput,
  CodebaseSearchResult,
} from "./codebase-service.ts";
import type { BrainScope } from "./scope.ts";

const scope: BrainScope = {
  userId: "dev-user",
  workspaceId: "dev-workspace",
  projectId: "dev-project",
  sphereId: "dev-sphere",
};

test("POST /api/codebase/ingest delegates with request scope", async () => {
  const calls: BrainScope[] = [];
  const response = await handleCodebaseIngestRequest(scopedRequest("http://localhost/api/codebase/ingest", "POST", {}), {
    service: fakeService({
      async ingest(input) {
        calls.push(input.scope);
        return scanDetail("scan-1");
      },
    }),
  });
  const body = (await response.json()) as { data: CodebaseScanDetail };

  assert.equal(response.status, 201);
  assert.deepEqual(calls, [scope]);
  assert.equal(body.data.scanId, "scan-1");
});

test("GET /api/codebase/scan/:scanId returns scoped scan or 404", async () => {
  const found = await handleCodebaseScanRequest(scopedRequest("http://localhost/api/codebase/scan/scan-1", "GET"), "scan-1", {
    service: fakeService({
      async getScan(requestScope, scanId) {
        return requestScope.userId === scope.userId && scanId === "scan-1" ? scanDetail(scanId) : null;
      },
    }),
  });
  const missing = await handleCodebaseScanRequest(scopedRequest("http://localhost/api/codebase/scan/missing", "GET"), "missing", {
    service: fakeService({
      async getScan() {
        return null;
      },
    }),
  });

  assert.equal(found.status, 200);
  assert.equal(missing.status, 404);
});

test("POST /api/codebase/search validates body and returns ranked snippets", async () => {
  const calls: CodebaseSearchInput[] = [];
  const response = await handleCodebaseSearchRequest(
    scopedRequest("http://localhost/api/codebase/search", "POST", {
      query: "route",
      limit: 2,
      filters: { sourceKinds: ["backend_source"], chunkKinds: ["route"] },
    }),
    {
      service: fakeService({
        async search(input) {
          calls.push(input);
          return [searchResult("packages/brain/src/server.ts")];
        },
      }),
    },
  );
  const missingQuery = await handleCodebaseSearchRequest(scopedRequest("http://localhost/api/codebase/search", "POST", {}), {
    service: fakeService(),
  });
  const body = (await response.json()) as { data: { results: CodebaseSearchResult[] } };

  assert.equal(response.status, 200);
  assert.equal(missingQuery.status, 400);
  assert.deepEqual(calls[0]?.scope, scope);
  assert.equal(calls[0]?.filters?.sourceKinds?.[0], "backend_source");
  assert.equal(body.data.results[0]?.path, "packages/brain/src/server.ts");
});

test("POST /api/codebase/context returns small task context", async () => {
  const response = await handleCodebaseContextRequest(
    scopedRequest("http://localhost/api/codebase/context", "POST", {
      query: "widgets",
      task: "change widgets route",
      maxChunks: 3,
    }),
    {
      service: fakeService({
        async context(input) {
          assert.equal(input.maxChunks, 3);
          return contextPayload(input.task ?? input.query);
        },
      }),
    },
  );
  const body = (await response.json()) as { data: CodebaseContextPayload };

  assert.equal(response.status, 200);
  assert.equal(body.data.summary.chunkCount, 1);
  assert.equal(body.data.chunks[0]?.path, "packages/brain/src/server.ts");
});

test("POST /api/codebase/audit does not leak cross-user scope", async () => {
  const service = fakeService({
    async audit(requestScope) {
      return auditPayload(requestScope.userId ?? "none");
    },
  });
  const userOne = await handleCodebaseAuditRequest(scopedRequest("http://localhost/api/codebase/audit", "POST", {}, { "x-user-id": "user-one" }), {
    service,
  });
  const userTwo = await handleCodebaseAuditRequest(scopedRequest("http://localhost/api/codebase/audit", "POST", {}, { "x-user-id": "user-two" }), {
    service,
  });
  const userOneBody = (await userOne.json()) as { data: CodebaseAuditPayload };
  const userTwoBody = (await userTwo.json()) as { data: CodebaseAuditPayload };

  assert.equal(userOne.status, 200);
  assert.equal(userTwo.status, 200);
  assert.equal(userOneBody.data.changedFiles[0]?.path, "user-one.ts");
  assert.equal(userTwoBody.data.changedFiles[0]?.path, "user-two.ts");
});

function fakeService(overrides: Partial<CodebaseMemoryRepository> = {}): CodebaseMemoryRepository {
  return {
    async ingest() {
      return scanDetail("scan-1");
    },
    async getScan() {
      return scanDetail("scan-1");
    },
    async latestSummary() {
      return scanDetail("scan-1");
    },
    async search() {
      return [];
    },
    async context() {
      return contextPayload("query");
    },
    async audit() {
      return auditPayload("dev-user");
    },
    ...overrides,
  };
}

function scopedRequest(
  url: string,
  method: string,
  body?: unknown,
  headerOverrides: Record<string, string> = {},
): Request {
  const init: RequestInit = {
    method,
    headers: {
      "content-type": "application/json",
      "x-user-id": scope.userId ?? "",
      "x-workspace-id": scope.workspaceId ?? "",
      "x-project-id": scope.projectId ?? "",
      "x-sphere-id": scope.sphereId ?? "",
      ...headerOverrides,
    },
  };

  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  return new Request(url, init);
}

function scanDetail(scanId: string): CodebaseScanDetail {
  return {
    scanId,
    repoRoot: "/repo",
    gitCommit: "abc123",
    status: "completed",
    startedAt: "2026-05-20T00:00:00.000Z",
    completedAt: "2026-05-20T00:00:01.000Z",
    fileCount: 1,
    chunkCount: 1,
    symbolCount: 1,
    importCount: 1,
    routeCount: 1,
    testCount: 1,
    docCount: 1,
    findingCount: 0,
    memoryNoteCount: 1,
    changedFileCount: 0,
    staleFileCount: 0,
    excludedCount: 0,
    changedFiles: [],
    staleFiles: [],
    files: [
      {
        path: "packages/brain/src/server.ts",
        hash: "hash",
        previousHash: null,
        size: 100,
        language: "typescript",
        sourceKind: "backend_source",
        chunkCount: 1,
        symbolCount: 1,
        routeCount: 1,
        testCount: 0,
        docCount: 0,
      },
    ],
  };
}

function searchResult(path: string): CodebaseSearchResult {
  return {
    chunkId: "chunk-1",
    fileId: "file-1",
    path,
    title: "GET /api/widgets",
    chunkKind: "route",
    language: "typescript",
    sourceKind: "backend_source",
    lineStart: 1,
    lineEnd: 8,
    score: 2,
    reasons: ["matched route"],
    snippet: "if (url.pathname === \"/api/widgets\")",
    symbols: [],
    routes: [{ method: "GET", routePath: "/api/widgets" }],
    tests: [],
    docs: [],
  };
}

function contextPayload(query: string): CodebaseContextPayload {
  return {
    sourceOfTruth: "codebase_db_index",
    query,
    strategy: "bm25_dependency_adjacency",
    summary: {
      fileCount: 1,
      chunkCount: 1,
      totalChars: 40,
      omittedCount: 0,
    },
    files: [
      {
        path: "packages/brain/src/server.ts",
        language: "typescript",
        sourceKind: "backend_source",
        hash: "hash",
        reason: "matched route",
      },
    ],
    chunks: [
      {
        id: "chunk-1",
        path: "packages/brain/src/server.ts",
        title: "GET /api/widgets",
        chunkKind: "route",
        lineStart: 1,
        lineEnd: 8,
        text: "if (url.pathname === \"/api/widgets\")",
        reasons: ["matched route"],
      },
    ],
    routes: [],
    tests: [],
    docs: [],
  };
}

function auditPayload(userId: string): CodebaseAuditPayload {
  return {
    sourceOfTruth: "codebase_db_index",
    latestScan: scanDetail("scan-1"),
    staleFiles: [],
    changedFiles: [{ path: `${userId}.ts`, previousHash: "old", hash: "new" }],
    topFindings: [],
  };
}
