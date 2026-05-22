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

async function runSmoke(input: { baseUrl: string; evidenceFile: string }): Promise<{ status: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, ["scripts/smoke-gmail-staging.mjs"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      BASE_URL: input.baseUrl,
      GMAIL_SMOKE_CONNECT_PREFLIGHT_ONLY: "true",
      GMAIL_SMOKE_EVIDENCE_FILE: input.evidenceFile,
      GMAIL_SMOKE_USER_ID: "gmail-smoke-user",
      GMAIL_SMOKE_WORKSPACE_ID: "gmail-smoke-workspace",
      GMAIL_SMOKE_PROJECT_ID: "gmail-smoke-project",
      GMAIL_SMOKE_SPHERE_ID: "gmail-smoke-sphere",
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
