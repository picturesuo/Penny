import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

test("public staging smoke accepts a token-gated Penny target", async () => {
  const result = await runSmoke(routesReadyForPublicSmoke());
  const payload = JSON.parse(result.stdout) as { ok: boolean; checks: Array<{ name: string }> };

  assert.equal(result.status, 0);
  assert.equal(payload.ok, true);
  assert.deepEqual(
    payload.checks.map((check) => check.name),
    [
      "frontend.loginGate",
      "api.unauthorized",
      "brain.documents",
      "brain.memoryProfile",
      "brain.recents",
      "create.next",
      "create.export",
    ],
  );
  assert.ok(result.requests.includes("GET /"));
  assert.equal(result.requests.filter((request) => request === "GET /api/brain/documents").length, 2);
});

test("public staging smoke writes sanitized evidence", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "penny-public-smoke-"));
  const evidenceFile = join(tempDir, "evidence.json");
  const token = "public-smoke-token-that-must-not-leak";

  try {
    const result = await runSmoke(routesReadyForPublicSmoke(), {
      PENNY_PUBLIC_SMOKE_API_TOKEN: token,
      PENNY_PUBLIC_SMOKE_EVIDENCE_FILE: evidenceFile,
      PENNY_PUBLIC_SMOKE_RUN_ID: "public-smoke-run-1",
    });
    const evidenceText = await readFile(evidenceFile, "utf8");
    const evidence = JSON.parse(evidenceText) as { ok: boolean; stagingRunId?: string; checks: Array<Record<string, unknown>> };

    assert.equal(result.status, 0);
    assert.equal(evidence.ok, true);
    assert.equal(evidence.stagingRunId, "public-smoke-run-1");
    assert.equal(evidence.checks.find((check) => check.name === "create.export")?.fakeConnectorClaimAbsent, true);
    assert.doesNotMatch(evidenceText, new RegExp(token));
    assert.doesNotMatch(evidenceText, /Full exported prompt text|raw email body|connect-session-token|postgresql:\/\//i);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

test("public staging smoke rejects unsafe scope ids before requests", async () => {
  const result = await runSmoke(routesReadyForPublicSmoke(), {
    PENNY_PUBLIC_SMOKE_USER_ID: "staged-account@example.com",
  });

  assert.equal(result.status, 1);
  assert.equal(result.requests.length, 0);
  assert.match(result.stderr, /PENNY_PUBLIC_SMOKE_USER_ID must be a safe opaque slug/);
  assert.doesNotMatch(result.stderr, /staged-account@example\.com/);
});

test("public staging smoke rejects unsupported live connector claims", async () => {
  const routes = routesReadyForPublicSmoke();
  routes["/api/create/next"] = {
    status: 200,
    body: {
      data: {
        optionSet: {
          id: "option-set-1",
          options: ["Personal", "Practical", "Valuable", "Critical", "Weird"].map((lens) => ({
            id: `option-${lens.toLowerCase()}`,
            lens,
            title: lens === "Personal" ? "live Gmail connected direction" : `${lens} direction`,
          })),
        },
        artifact: { id: "artifact-1" },
        verification: {},
        judgmentEvent: null,
        exportReady: true,
      },
    },
  };

  const result = await runSmoke(routes);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /unsupported live connector claim/);
});

async function runSmoke(
  routes: Record<string, MockRoute>,
  extraEnv: Record<string, string> = {},
): Promise<{ status: number | null; stdout: string; stderr: string; requests: string[] }> {
  const requests: string[] = [];
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const method = request.method ?? "GET";
    const url = request.url ?? "";
    requests.push(`${method} ${url}`);

    if (url === "/") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<main>Enter the private access token</main>");
      return;
    }

    if (url === "/api/brain/documents" && !request.headers.authorization) {
      response.writeHead(401, {
        "content-type": "application/json",
        "www-authenticate": 'Bearer realm="penny"',
      });
      response.end(JSON.stringify({ error: { message: "A valid Penny API token is required." } }));
      return;
    }

    await drainRequest(request);
    const route = routes[url];
    response.writeHead(route?.status ?? 404, { "content-type": "application/json" });
    response.end(JSON.stringify(route?.body ?? { error: { message: "missing" } }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const child = spawn(process.execPath, ["scripts/smoke-public-staging.mjs"], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PENNY_PUBLIC_SMOKE_BASE_URL: `http://127.0.0.1:${address.port}`,
        PENNY_PUBLIC_SMOKE_API_TOKEN: "public-smoke-token-value",
        PENNY_PUBLIC_SMOKE_USER_ID: "public-smoke-user",
        PENNY_PUBLIC_SMOKE_WORKSPACE_ID: "public-smoke-workspace",
        PENNY_PUBLIC_SMOKE_PROJECT_ID: "public-smoke-project",
        PENNY_PUBLIC_SMOKE_SPHERE_ID: "public-smoke-sphere",
        ...extraEnv,
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

    return { status, stdout, stderr, requests };
  } finally {
    server.close();
  }
}

async function drainRequest(request: IncomingMessage): Promise<void> {
  for await (const _chunk of request) {
    // Drain the body so the mock behaves like a real HTTP server.
  }
}

function routesReadyForPublicSmoke(): Record<string, MockRoute> {
  const artifact = { id: "artifact-1", projectId: "public-smoke-project", sessionId: "public-smoke-session" };

  return {
    "/api/brain/documents": {
      status: 200,
      body: {
        data: {
          sourceOfTruth: "sessions_sources_claims_claim_versions_edges_moves_artifacts",
          meta: { documentCount: 0 },
        },
      },
    },
    "/api/brain/memory/profile": {
      status: 200,
      body: {
        data: {
          sourceOfTruth: "private_user_memory_sources_chunks_nodes_edges_profile_signals",
          stats: { sourceCount: 0, memoryNodeCount: 0 },
        },
      },
    },
    "/api/brain/recents": {
      status: 200,
      body: {
        data: { recents: [] },
      },
    },
    "/api/create/next": {
      status: 200,
      body: {
        data: {
          optionSet: {
            id: "option-set-1",
            options: ["Personal", "Practical", "Valuable", "Critical", "Weird"].map((lens) => ({
              id: `option-${lens.toLowerCase()}`,
              lens,
              title: `${lens} direction`,
            })),
          },
          artifact,
          verification: { verdict: "ready" },
          judgmentEvent: null,
          exportReady: true,
        },
      },
    },
    "/api/create/export-coding-prompt": {
      status: 200,
      body: {
        data: {
          export: {
            id: "export-1",
            artifactId: artifact.id,
            targets: ["Codex", "Claude Code", "Cursor"],
            text: "Full exported prompt text. Do not claim live Gmail or live SMS.",
            qualitySignals: {
              promptCompletenessScore: 91,
              missing: [],
            },
          },
        },
      },
    },
  };
}

type MockRoute = {
  status: number;
  body: unknown;
};
