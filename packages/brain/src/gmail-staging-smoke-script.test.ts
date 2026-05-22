import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const gmailReadonlyScope = "https://www.googleapis.com/auth/gmail.readonly";

test("Gmail staging smoke script writes sanitized connect preflight-only evidence", async () => {
  const requests: Array<{ method: string | undefined; url: string | undefined }> = [];
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    requests.push({ method: request.method, url: request.url });
    const route = routeFor(request);

    response.writeHead(route.status, { "content-type": "application/json" });
    response.end(JSON.stringify(route.body));
  });
  const tmp = await mkdtemp(join(tmpdir(), "penny-gmail-smoke-"));
  const evidenceFile = join(tmp, "gmail-connect-preflight.json");

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();

    assert(address && typeof address === "object");

    const result = await runSmoke({
      baseUrl: `http://127.0.0.1:${address.port}`,
      evidenceFile,
    });
    const evidence = JSON.parse(await readFile(evidenceFile, "utf8")) as {
      steps: Array<{ step: string; connectLinkHost?: string; tokenPresent?: boolean }>;
    };
    const verifyOutput = execFileSync(
      process.execPath,
      ["scripts/verify-gmail-smoke-evidence.mjs", evidenceFile, "--connect-preflight-only"],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );
    const verified = JSON.parse(verifyOutput) as { ok: boolean; connectPreflightOnly: boolean };

    assert.equal(result.status, 0);
    assert.doesNotMatch(result.stdout, /gmail-session-token|https:\/\/connect\.nango\.test/i);
    assert.doesNotMatch(result.stderr, /gmail-session-token|https:\/\/connect\.nango\.test/i);
    assert.deepEqual(
      requests.map((request) => `${request.method} ${request.url}`),
      ["GET /api/connectors/google/gmail/status", "GET /api/connectors/google", "POST /api/connectors/google/gmail/connect"],
    );
    assert.deepEqual(
      evidence.steps.map((step) => step.step),
      ["connect.preflight", "connect.preflightOnly.completed"],
    );
    assert.equal(evidence.steps[0]?.connectLinkHost, "connect.nango.test");
    assert.equal(evidence.steps[0]?.tokenPresent, true);
    assert.equal(verified.ok, true);
    assert.equal(verified.connectPreflightOnly, true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(tmp, { recursive: true, force: true });
  }
});

test("Gmail staging smoke script verifies the non-destructive post-OAuth path", async () => {
  const requests: Array<{ method: string | undefined; url: string | undefined }> = [];
  const state = postOauthSmokeState();
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    requests.push({ method: request.method, url: request.url });
    const route = postOauthRouteFor(request, state);

    response.writeHead(route.status, { "content-type": "application/json" });
    response.end(JSON.stringify(route.body));
  });
  const tmp = await mkdtemp(join(tmpdir(), "penny-gmail-smoke-"));
  const evidenceFile = join(tmp, "gmail-smoke.json");

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();

    assert(address && typeof address === "object");

    const result = await runSmoke({
      baseUrl: `http://127.0.0.1:${address.port}`,
      evidenceFile,
      env: {
        GMAIL_SMOKE_KEYWORD_TEXT: "launch partner evidence",
        GMAIL_SMOKE_KEYWORD_FROM: "alice@example.com",
        GMAIL_SMOKE_KEYWORD_SUBJECT: "Launch plan",
        GMAIL_SMOKE_SEMANTIC_QUERY: "launch partner evidence",
        GMAIL_SMOKE_EXPECT_CREATE_TEXT: "launch partner evidence",
      },
    });
    const evidence = JSON.parse(await readFile(evidenceFile, "utf8")) as {
      steps: Array<{ step: string; query?: string; stored?: boolean; expectedEvidencePresent?: boolean }>;
    };
    const verifyOutput = execFileSync(
      process.execPath,
      ["scripts/verify-gmail-smoke-evidence.mjs", evidenceFile, "--min-messages=1"],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );
    const verified = JSON.parse(verifyOutput) as { ok: boolean; stepCount: number };
    const keyword = evidence.steps.find((step) => step.step === "keywordSearch");
    const keywordSync = evidence.steps.find((step) => step.step === "keywordSearch.syncExplicit");
    const createExport = evidence.steps.find((step) => step.step === "create.export");

    assert.equal(result.status, 0);
    assert.deepEqual(
      evidence.steps.map((step) => step.step),
      [
        "status.initial",
        "sync",
        "status.afterSync",
        "sync.repeat",
        "keywordSearch",
        "keywordSearch.syncExplicit",
        "semanticSearch",
        "create.first",
        "create.export",
        "revoke.delete.skipped",
      ],
    );
    assert.equal(keyword?.query, '"launch partner evidence" from:alice@example.com subject:"Launch plan"');
    assert.equal(keyword?.stored, false);
    assert.equal(keywordSync?.query, '"launch partner evidence" from:alice@example.com subject:"Launch plan"');
    assert.equal(keywordSync?.stored, true);
    assert.equal(createExport?.expectedEvidencePresent, true);
    assert.equal(verified.ok, true);
    assert.equal(verified.stepCount, 10);
    assert.equal(state.syncCalls, 2);
    assert.equal(state.searchCalls, 2);
    assert.equal(state.semanticCalls, 1);
    assert.equal(state.createCalls, 2);
    assert.equal(state.exportCalls, 1);
    assert.ok(requests.some((request) => `${request.method} ${request.url}` === "POST /api/connectors/google/gmail/search"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(tmp, { recursive: true, force: true });
  }
});

test("Gmail staging smoke script verifies an expected sanitized partial failure", async () => {
  const state = postOauthSmokeState({ partialFailureStage: "message_oversized" });
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const route = postOauthRouteFor(request, state);

    response.writeHead(route.status, { "content-type": "application/json" });
    response.end(JSON.stringify(route.body));
  });
  const tmp = await mkdtemp(join(tmpdir(), "penny-gmail-smoke-"));
  const evidenceFile = join(tmp, "gmail-smoke-partial.json");

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();

    assert(address && typeof address === "object");

    const result = await runSmoke({
      baseUrl: `http://127.0.0.1:${address.port}`,
      evidenceFile,
      env: {
        GMAIL_SMOKE_KEYWORD_TEXT: "launch partner evidence",
        GMAIL_SMOKE_KEYWORD_FROM: "alice@example.com",
        GMAIL_SMOKE_KEYWORD_SUBJECT: "Launch plan",
        GMAIL_SMOKE_SEMANTIC_QUERY: "launch partner evidence",
        GMAIL_SMOKE_EXPECT_CREATE_TEXT: "launch partner evidence",
        GMAIL_SMOKE_EXPECT_PARTIAL_FAILURE_STAGE: "message_oversized",
      },
    });
    const evidence = JSON.parse(await readFile(evidenceFile, "utf8")) as {
      steps: Array<Record<string, unknown> & { step: string }>;
    };
    const verifyOutput = execFileSync(
      process.execPath,
      ["scripts/verify-gmail-smoke-evidence.mjs", evidenceFile, "--min-messages=1"],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );
    const verified = JSON.parse(verifyOutput) as { ok: boolean };
    const sync = evidence.steps.find((step) => step.step === "sync");
    const repeat = evidence.steps.find((step) => step.step === "sync.repeat");

    assert.equal(result.status, 0);
    assert.equal(sync?.partialFailureCount, 1);
    assert.equal(sync?.expectedPartialFailureStage, "message_oversized");
    assert.equal(sync?.partialFailureStageMatched, true);
    assert.equal(sync?.partialFailuresSanitized, true);
    assert.equal(repeat?.partialFailureCount, 1);
    assert.equal(repeat?.partialFailureStageMatched, true);
    assert.equal(verified.ok, true);
    assert.doesNotMatch(JSON.stringify(evidence), /Private Gmail body|plainTextBody|rawBody/i);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(tmp, { recursive: true, force: true });
  }
});

test("Gmail staging smoke script verifies destructive revoke and delete postconditions", async () => {
  const state = postOauthSmokeState();
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const route = postOauthRouteFor(request, state);

    response.writeHead(route.status, { "content-type": "application/json" });
    response.end(JSON.stringify(route.body));
  });
  const tmp = await mkdtemp(join(tmpdir(), "penny-gmail-smoke-"));
  const evidenceFile = join(tmp, "gmail-smoke-destructive.json");

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();

    assert(address && typeof address === "object");

    const result = await runSmoke({
      baseUrl: `http://127.0.0.1:${address.port}`,
      evidenceFile,
      env: {
        GMAIL_SMOKE_KEYWORD_TEXT: "launch partner evidence",
        GMAIL_SMOKE_KEYWORD_FROM: "alice@example.com",
        GMAIL_SMOKE_KEYWORD_SUBJECT: "Launch plan",
        GMAIL_SMOKE_SEMANTIC_QUERY: "launch partner evidence",
        GMAIL_SMOKE_EXPECT_CREATE_TEXT: "launch partner evidence",
        GMAIL_SMOKE_CONFIRM_MUTATIONS: "true",
        GMAIL_SMOKE_CONFIRM_DELETE: "true",
      },
    });
    const evidence = JSON.parse(await readFile(evidenceFile, "utf8")) as {
      steps: Array<Record<string, unknown> & { step: string }>;
    };
    const verifyOutput = execFileSync(
      process.execPath,
      ["scripts/verify-gmail-smoke-evidence.mjs", evidenceFile, "--destructive", "--min-messages=1"],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );
    const verified = JSON.parse(verifyOutput) as { ok: boolean; destructive: boolean };
    const revoke = evidence.steps.find((step) => step.step === "revoke");
    const deleted = evidence.steps.find((step) => step.step === "deleteSource");

    assert.equal(result.status, 0);
    assert.equal(evidence.steps.some((step) => step.step === "revoke.delete.skipped"), false);
    assert.equal(revoke?.revoked, true);
    assert.equal(revoke?.syncAfterRevokeStatus, 409);
    assert.equal(revoke?.searchAfterRevokeStatus, 409);
    assert.equal(revoke?.semanticAfterRevokeStatus, 409);
    assert.equal(deleted?.brainSourceDeleted, true);
    assert.equal(deleted?.brainProfileSourceAbsent, true);
    assert.equal(deleted?.brainRetrieveDeletedSourceAbsent, true);
    assert.equal(deleted?.semanticDeletedSourceAbsent, true);
    assert.equal(deleted?.createDeletedSourceAbsent, true);
    assert.equal(deleted?.createDeletedMemoryAbsent, true);
    assert.equal(verified.ok, true);
    assert.equal(verified.destructive, true);
    assert.equal(state.revokeCalls, 1);
    assert.equal(state.deleteCalls, 1);
    assert.equal(state.syncCalls, 3);
    assert.equal(state.searchCalls, 3);
    assert.equal(state.semanticCalls, 3);
    assert.equal(state.createCalls, 3);
    assert.equal(state.brainProfileCalls, 1);
    assert.equal(state.brainRetrieveCalls, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(tmp, { recursive: true, force: true });
  }
});

async function runSmoke(input: {
  baseUrl: string;
  evidenceFile: string;
  env?: Record<string, string>;
}): Promise<{ status: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, ["scripts/smoke-gmail-staging.mjs"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      BASE_URL: input.baseUrl,
      GMAIL_SMOKE_EVIDENCE_FILE: input.evidenceFile,
      GMAIL_SMOKE_USER_ID: "gmail-smoke-user",
      GMAIL_SMOKE_WORKSPACE_ID: "gmail-smoke-workspace",
      GMAIL_SMOKE_PROJECT_ID: "gmail-smoke-project",
      GMAIL_SMOKE_SPHERE_ID: "gmail-smoke-sphere",
      ...(input.env ?? { GMAIL_SMOKE_CONNECT_PREFLIGHT_ONLY: "true" }),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const status = await new Promise<number | null>((resolve) => child.on("close", resolve));

  return { status, stdout, stderr };
}

function routeFor(request: IncomingMessage): { status: number; body: unknown } {
  if (request.method === "GET" && request.url === "/api/connectors/google/gmail/status") {
    return {
      status: 200,
      body: {
        data: {
          configured: true,
          status: "available",
          scopes: [gmailReadonlyScope],
          restrictedScope: true,
          gated: true,
          private: true,
          privacy: {
            trainingUse: false,
            rawRetentionDefault: false,
            noHumanReview: true,
          },
          connections: [],
          sources: [],
          state: {
            connections: [],
            sources: [],
            syncJobs: [],
          },
          messageCount: 0,
        },
      },
    };
  }

  if (request.method === "GET" && request.url === "/api/connectors/google") {
    return {
      status: 200,
      body: {
        data: {
          configured: true,
          surfaces: [
            {
              id: "google_gmail",
              status: "available",
              scopes: [
                {
                  scope: gmailReadonlyScope,
                  gated: true,
                },
              ],
            },
          ],
          state: {
            connections: [],
            sources: [],
            syncJobs: [],
          },
        },
      },
    };
  }

  if (request.method === "POST" && request.url === "/api/connectors/google/gmail/connect") {
    return {
      status: 201,
      body: {
        data: {
          providerConfigKey: "google-gmail",
          connectLink: "https://connect.nango.test/gmail-session-token",
          token: "gmail-session-token",
          expiresAt: "2026-05-22T12:05:00.000Z",
          requestedSurfaceIds: ["google_gmail"],
          requestableSurfaceIds: ["google_gmail"],
          requestableScopeUrls: [gmailReadonlyScope],
          restrictedScope: true,
          gated: true,
          private: true,
          scopeAuditReason: "read email for private Brain memory and email search.",
          warnings: [],
        },
      },
    };
  }

  return {
    status: 404,
    body: {
      error: {
        message: "missing mock route",
      },
    },
  };
}

function postOauthRouteFor(
  request: IncomingMessage,
  state: PostOauthSmokeState,
): { status: number; body: unknown } {
  if (request.method === "GET" && request.url === "/api/connectors/google/gmail/status") {
    state.statusCalls += 1;
    const hasSource = state.statusCalls !== 1 && !state.deleted;

    return {
      status: 200,
      body: {
        data: {
          configured: true,
          status: "connected",
          scopes: [gmailReadonlyScope],
          restrictedScope: true,
          gated: true,
          private: true,
          privacy: {
            trainingUse: false,
            rawRetentionDefault: false,
            noHumanReview: true,
          },
          connections: [
            {
              id: "connector-gmail-connection-1",
              status: "connected",
              surfaces: ["google_gmail"],
              credential: {
                providerConfigKey: "google-gmail",
                connectionId: "nango-gmail-1",
              },
            },
          ],
          sources: hasSource ? [safeGmailSource()] : [],
          state: {
            connections: [
              {
                id: "connector-gmail-connection-1",
                status: "connected",
                surfaces: ["google_gmail"],
                credential: {
                  providerConfigKey: "google-gmail",
                  connectionId: "nango-gmail-1",
                },
              },
            ],
            sources: hasSource ? [safeGmailSource()] : [],
            syncJobs: [],
          },
          messageCount: hasSource ? 1 : 0,
        },
      },
    };
  }

  if (request.method === "GET" && request.url === "/api/connectors/google") {
    return {
      status: 200,
      body: {
        data: {
          configured: true,
          surfaces: [
            {
              id: "google_gmail",
              status: "connected",
              scopes: [
                {
                  scope: gmailReadonlyScope,
                  gated: true,
                },
              ],
            },
          ],
          state: {
            connections: [
              {
                id: "connector-gmail-connection-1",
                status: "connected",
                surfaces: ["google_gmail"],
                credential: {
                  providerConfigKey: "google-gmail",
                  connectionId: "nango-gmail-1",
                },
              },
            ],
            sources: state.deleted ? [] : [safeGmailSource()],
            syncJobs: [],
          },
        },
      },
    };
  }

  if (request.method === "POST" && request.url === "/api/connectors/google/gmail/sync") {
    state.syncCalls += 1;

    if (state.revoked) {
      return connectorUnavailable("gmail_connection_revoked", "Revoked Gmail connections cannot be used for sync or search.");
    }

    const partialFailures = state.partialFailureStage ? [safePartialFailure(state.partialFailureStage)] : [];

    return {
      status: 200,
      body: {
        data: {
          messageCount: 1,
          partialFailureCount: partialFailures.length,
          partialFailures,
          cursor: "history-101",
          profile: {
            historyId: "history-101",
          },
          importedSources: [
            {
              messageId: "gmail-message-1",
              brainSourceId: "brain-source-gmail-1",
              memoryNodeCount: 1,
            },
          ],
          state: {
            sources: [safeGmailSource()],
          },
        },
      },
    };
  }

  if (request.method === "POST" && request.url === "/api/connectors/google/gmail/search") {
    state.searchCalls += 1;
    const stored = state.searchCalls === 2;

    if (state.revoked) {
      return connectorUnavailable("gmail_connection_revoked", "Revoked Gmail connections cannot be used for sync or search.");
    }

    return {
      status: 200,
      body: {
        data: {
          sourceOfTruth: "gmail_api_search_via_nango",
          query: '"launch partner evidence" from:alice@example.com subject:"Launch plan"',
          stored,
          sync: stored
            ? {
                messageCount: 1,
                partialFailureCount: 0,
                importedSources: [
                  {
                    messageId: "gmail-message-1",
                    brainSourceId: "brain-source-gmail-1",
                    memoryNodeCount: 1,
                  },
                ],
              }
            : null,
          results: [
            {
              messageId: "gmail-message-1",
              threadId: "gmail-thread-1",
              subject: "Launch plan",
              sender: "Alice <alice@example.com>",
              date: "2026-05-22T12:00:00.000Z",
              snippet: "launch partner evidence for the staged smoke path.",
              sourceRef: {
                surface: "google_gmail",
                sourceUri: "gmail:message:gmail-message-1",
              },
            },
          ],
        },
      },
    };
  }

  if (request.method === "POST" && request.url === "/api/connectors/google/gmail/semantic-search") {
    state.semanticCalls += 1;

    if (state.revoked || state.deleted) {
      return connectorUnavailable("gmail_not_synced", "Sync Gmail first.");
    }

    return {
      status: 200,
      body: {
        data: {
          sourceOfTruth: "synced_private_gmail_brain_memory",
          query: "launch partner evidence",
          contextLight: false,
          results: [
            {
              subject: "Launch plan",
              sender: "Alice <alice@example.com>",
              date: "2026-05-22T12:00:00.000Z",
              snippet: "launch partner evidence for the staged smoke path.",
              messageId: "gmail-message-1",
              threadId: "gmail-thread-1",
              sourceRef: {
                id: "connector-source-gmail-1",
                surface: "google_gmail",
                sourceUri: "gmail:message:gmail-message-1",
              },
              memoryRef: {
                id: "memory-gmail-1",
              },
              grounding: "grounded",
              scoreReason: "Grounded match from synced Gmail memory.",
            },
          ],
        },
      },
    };
  }

  if (request.method === "POST" && request.url === "/api/create/next") {
    state.createCalls += 1;
    const deletedCreate = {
      optionSet: {
        id: "create-option-set-after-delete",
        projectId: "gmail-smoke-project",
        sessionId: "gmail-smoke-session-after-delete",
        options: [],
        memoryUsed: [],
        sourcesUsed: [],
      },
      observability: {
        memoryCountUsed: 0,
        sourceCountUsed: 0,
      },
      artifact: {
        id: "artifact-gmail-smoke-after-delete",
      },
      verification: {
        id: "verification-gmail-smoke-after-delete",
      },
      judgmentEvent: null,
    };

    return {
      status: 200,
      body: {
        data: state.deleted ? deletedCreate : {
          optionSet: {
            id: "create-option-set-1",
            projectId: "gmail-smoke-project",
            sessionId: "gmail-smoke-session",
            options: [
              {
                id: "create-option-personal",
                lens: "Personal",
                title: "Use launch partner evidence",
                oneLine: "Shape Create around launch partner evidence.",
              },
              {
                id: "create-option-critical",
                lens: "Critical",
                title: "Challenge generic CRM drift",
                oneLine: "Use launch partner evidence to avoid generic CRM drift.",
              },
            ],
            memoryUsed: [
              {
                id: "memory-gmail-1",
                summary: "launch partner evidence from synced Gmail memory.",
              },
            ],
            sourcesUsed: [
              {
                id: "connector-source-gmail-1",
                label: "Launch plan",
                excerpt: "launch partner evidence",
                sourceUri: "gmail:message:gmail-message-1",
              },
            ],
          },
          observability: {
            memoryCountUsed: 1,
            sourceCountUsed: 1,
          },
          artifact: {
            id: "artifact-gmail-smoke",
            title: "Gmail smoke Create artifact",
            body: "Use launch partner evidence.",
          },
          verification: {
            id: "verification-gmail-smoke",
            verdict: "ready",
          },
          judgmentEvent: state.createCalls === 1 ? null : { id: "judgment-gmail-smoke" },
        },
      },
    };
  }

  if (request.method === "POST" && request.url === "/api/connectors/google/gmail/revoke") {
    state.revokeCalls += 1;
    state.revoked = true;

    return {
      status: 200,
      body: {
        data: {
          revoked: true,
        },
      },
    };
  }

  if (request.method === "POST" && request.url === "/api/connectors/google/source-delete") {
    state.deleteCalls += 1;
    state.deleted = true;

    return {
      status: 200,
      body: {
        data: {
          brainSourceDeleted: true,
          profile: {
            sources: [],
            recentMemoryNodes: [],
            stats: {
              sourceCount: 0,
              memoryNodeCount: 0,
            },
          },
          state: {
            sources: [
              {
                ...safeGmailSource(),
                privacy: {
                  retrievalAccess: "deleted",
                },
              },
            ],
          },
        },
      },
    };
  }

  if (request.method === "GET" && request.url === "/api/brain/memory/profile") {
    state.brainProfileCalls += 1;

    return {
      status: 200,
      body: {
        data: {
          sources: state.deleted ? [] : [safeBrainSource()],
          recentMemoryNodes: state.deleted ? [] : [{ id: "memory-gmail-1" }],
          stats: {
            sourceCount: state.deleted ? 0 : 1,
            memoryNodeCount: state.deleted ? 0 : 1,
          },
        },
      },
    };
  }

  if (request.method === "POST" && request.url === "/api/brain/retrieve") {
    state.brainRetrieveCalls += 1;

    return {
      status: 200,
      body: {
        data: {
          results: [],
        },
      },
    };
  }

  if (request.method === "POST" && request.url === "/api/create/export-coding-prompt") {
    state.exportCalls += 1;

    return {
      status: 200,
      body: {
        data: {
          export: {
            id: "export-gmail-smoke",
            text: "Build with launch partner evidence from synced Gmail memory.",
          },
        },
      },
    };
  }

  return {
    status: 404,
    body: {
      error: {
        message: "missing mock route",
      },
    },
  };
}

type PostOauthSmokeState = {
  statusCalls: number;
  syncCalls: number;
  searchCalls: number;
  semanticCalls: number;
  createCalls: number;
  exportCalls: number;
  revokeCalls: number;
  deleteCalls: number;
  brainProfileCalls: number;
  brainRetrieveCalls: number;
  revoked: boolean;
  deleted: boolean;
  partialFailureStage: string | null;
};

function postOauthSmokeState(options: { partialFailureStage?: string } = {}): PostOauthSmokeState {
  return {
    statusCalls: 0,
    syncCalls: 0,
    searchCalls: 0,
    semanticCalls: 0,
    createCalls: 0,
    exportCalls: 0,
    revokeCalls: 0,
    deleteCalls: 0,
    brainProfileCalls: 0,
    brainRetrieveCalls: 0,
    revoked: false,
    deleted: false,
    partialFailureStage: options.partialFailureStage ?? null,
  };
}

function connectorUnavailable(code: string, message: string) {
  return {
    status: 409,
    body: {
      error: {
        code,
        message,
      },
    },
  };
}

function safeGmailSource() {
  return {
    id: "connector-source-gmail-1",
    connectionId: "connector-gmail-connection-1",
    brainSourceId: "brain-source-gmail-1",
    sourceUri: "gmail:message:gmail-message-1",
    surface: "google_gmail",
    privacy: {
      retrievalAccess: "enabled",
    },
  };
}

function safePartialFailure(stage: string) {
  return {
    messageId: "oversized-message",
    threadId: "oversized-thread",
    stage,
    retryable: false,
    status: null,
    errorCode: stage,
    message: "Gmail message skipped by staging safety limits.",
  };
}

function safeBrainSource() {
  return {
    id: "brain-source-gmail-1",
    sourceUri: "gmail:message:gmail-message-1",
  };
}
