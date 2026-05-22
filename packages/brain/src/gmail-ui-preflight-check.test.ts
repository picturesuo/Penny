import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

test("Gmail UI preflight checker accepts ready Brain and Gmail routes", async () => {
  const result = await runPreflight(routesReadyForUiPreflight());
  const payload = JSON.parse(result.stdout) as { ok: boolean; checks: Array<{ name: string }> };

  assert.equal(result.status, 0);
  assert.equal(payload.ok, true);
  assert.deepEqual(
    payload.checks.map((check) => check.name),
    ["brain.documents", "brain.memoryProfile", "brain.recents", "google.provider", "gmail.status"],
  );
});

test("Gmail UI preflight checker rejects missing migrated database routes", async () => {
  const result = await runPreflight({
    "/api/brain/documents": {
      status: 500,
      body: {
        error: {
          message: 'Failed query: select "id" from "sessions"',
        },
      },
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /local UI preflight needs a valid migrated DATABASE_URL before opening the browser/);
});

test("Gmail UI preflight checker rejects unsafe Gmail status internals", async () => {
  const routes = routesReadyForUiPreflight();
  const gmailStatus = routes["/api/connectors/google/gmail/status"]?.body as {
    data: {
      sources: Array<Record<string, unknown>>;
    };
  };

  gmailStatus.data.sources = [
    {
      id: "connector-source-gmail-1",
      metadata: { subject: "Should not be in UI-safe status evidence" },
    },
  ];

  const result = await runPreflight(routes);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Gmail status\.sources exposed metadata/);
});

async function runPreflight(routes: Record<string, MockRoute>): Promise<{ status: number | null; stdout: string; stderr: string }> {
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const route = routes[request.url ?? ""];

    response.writeHead(route?.status ?? 404, { "content-type": "application/json" });
    response.end(JSON.stringify(route?.body ?? { error: { message: "missing" } }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    assert(address && typeof address === "object");

    const child = spawn(process.execPath, ["scripts/check-gmail-ui-preflight.mjs"], {
      cwd: repoRoot,
      env: {
        ...process.env,
        BASE_URL: `http://127.0.0.1:${address.port}`,
        GMAIL_UI_PREFLIGHT_USER_ID: "ui-preflight-user",
        GMAIL_UI_PREFLIGHT_WORKSPACE_ID: "ui-preflight-workspace",
        GMAIL_UI_PREFLIGHT_PROJECT_ID: "ui-preflight-project",
        GMAIL_UI_PREFLIGHT_SPHERE_ID: "ui-preflight-sphere",
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
  } finally {
    server.close();
  }
}

function routesReadyForUiPreflight(): Record<string, MockRoute> {
  return {
    "/api/brain/documents": {
      status: 200,
      body: {
        data: {
          sourceOfTruth: "sessions_sources_claims_claim_versions_edges_moves_artifacts",
          meta: {
            documentCount: 0,
          },
        },
      },
    },
    "/api/brain/memory/profile": {
      status: 200,
      body: {
        data: {
          sourceOfTruth: "private_user_memory_sources_chunks_nodes_edges_profile_signals",
          stats: {
            sourceCount: 0,
            memoryNodeCount: 0,
          },
        },
      },
    },
    "/api/brain/recents": {
      status: 200,
      body: {
        data: {
          recents: [],
        },
      },
    },
    "/api/connectors/google": {
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
                  scope: "https://www.googleapis.com/auth/gmail.readonly",
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
    },
    "/api/connectors/google/gmail/status": {
      status: 200,
      body: {
        data: {
          configured: true,
          status: "available",
          scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
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
    },
  };
}

type MockRoute = {
  status: number;
  body: unknown;
};
