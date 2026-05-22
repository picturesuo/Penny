import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const gmailReadonlyScope = "https://www.googleapis.com/auth/gmail.readonly";

test("Gmail staging readiness checker accepts strict env, safe status, and connect preflight", async () => {
  const requests: Array<{ method: string | undefined; url: string | undefined }> = [];
  const result = await runReadiness({
    routes: readinessRoutes(),
    requests,
    env: readyStrictEnv({
      GMAIL_READINESS_REQUIRE_STAGING: "true",
      GMAIL_READINESS_CONNECT_PREFLIGHT: "true",
    }),
  });
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    checks: Array<{ name: string; connectLinkHost?: string; tokenPresent?: boolean }>;
  };

  assert.equal(result.status, 0);
  assert.equal(payload.ok, true);
  assert.deepEqual(
    payload.checks.map((check) => check.name),
    ["env.gmail", "env.strictStaging", "api.googleProvider", "api.gmailStatus", "api.connectPreflight"],
  );
  assert.equal(payload.checks[4]?.connectLinkHost, "connect.nango.test");
  assert.equal(payload.checks[4]?.tokenPresent, true);
  assert.deepEqual(
    requests.map((request) => `${request.method} ${request.url}`),
    ["GET /api/connectors/google", "GET /api/connectors/google/gmail/status", "POST /api/connectors/google/gmail/connect"],
  );
  assert.doesNotMatch(result.stdout, /readiness-secret-value|readiness-public-value|strict-api-token|session-secret-value/i);
  assert.doesNotMatch(result.stdout, /connect-session-token|https:\/\/connect\.nango\.test/i);
  assert.doesNotMatch(result.stderr, /readiness-secret-value|readiness-public-value|strict-api-token|session-secret-value/i);
});

test("Gmail staging readiness checker rejects missing NANGO_GMAIL_INTEGRATION_ID before API calls", async () => {
  const requests: Array<{ method: string | undefined; url: string | undefined }> = [];
  const env = readyStrictEnv();

  delete env.NANGO_GMAIL_INTEGRATION_ID;

  const result = await runReadiness({
    routes: readinessRoutes(),
    requests,
    env,
  });

  assert.equal(result.status, 1);
  assert.equal(requests.length, 0);
  assert.match(result.stderr, /NANGO_GMAIL_INTEGRATION_ID must be set for Gmail staging readiness/);
  assert.doesNotMatch(result.stderr, /readiness-secret-value|readiness-public-value|strict-api-token|session-secret-value/i);
});

test("Gmail staging readiness checker rejects dev auth in strict staging mode before API calls", async () => {
  const requests: Array<{ method: string | undefined; url: string | undefined }> = [];
  const result = await runReadiness({
    routes: readinessRoutes(),
    requests,
    env: readyStrictEnv({
      GMAIL_READINESS_REQUIRE_STAGING: "true",
      PENNY_AUTH_MODE: "dev",
    }),
  });

  assert.equal(result.status, 1);
  assert.equal(requests.length, 0);
  assert.match(result.stderr, /PENNY_AUTH_MODE must be token for strict Gmail staging readiness/);
});

async function runReadiness(input: {
  routes: Record<string, MockRoute>;
  requests: Array<{ method: string | undefined; url: string | undefined }>;
  env: Record<string, string>;
}): Promise<{ status: number | null; stdout: string; stderr: string }> {
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    input.requests.push({ method: request.method, url: request.url });
    const route = input.routes[`${request.method} ${request.url}`];

    response.writeHead(route?.status ?? 404, { "content-type": "application/json" });
    response.end(JSON.stringify(route?.body ?? { error: { message: "missing mock route" } }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();

    assert(address && typeof address === "object");

    const child = spawn(process.execPath, ["scripts/check-gmail-staging-readiness.mjs"], {
      cwd: repoRoot,
      env: {
        PATH: process.env.PATH ?? "",
        BASE_URL: `http://127.0.0.1:${address.port}`,
        GMAIL_READINESS_USER_ID: "readiness-user",
        GMAIL_READINESS_WORKSPACE_ID: "readiness-workspace",
        GMAIL_READINESS_PROJECT_ID: "readiness-project",
        GMAIL_READINESS_SPHERE_ID: "readiness-sphere",
        ...input.env,
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
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function readyStrictEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    ENABLE_GOOGLE_CONNECTOR: "true",
    ENABLE_GMAIL_CONNECTOR: "true",
    ENABLE_RESTRICTED_GOOGLE_SCOPES: "true",
    NANGO_SECRET_KEY: "readiness-secret-value",
    NANGO_PUBLIC_KEY: "readiness-public-value",
    NANGO_BASE_URL: "https://api.nango.test",
    NANGO_GMAIL_INTEGRATION_ID: "google-gmail-staging",
    DATABASE_URL: "postgresql://penny:penny@db.example.test:5432/penny",
    PENNY_AUTH_MODE: "token",
    PENNY_API_TOKEN: "strict-api-token-value-32-characters",
    PENNY_SESSION_SECRET: "session-secret-value-32-characters",
    PENNY_TRUST_AUTH_HEADERS: "false",
    ...overrides,
  };
}

function readinessRoutes(): Record<string, MockRoute> {
  return {
    "GET /api/connectors/google": {
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
            connections: [safeConnection()],
            sources: [safeGmailSource()],
            syncJobs: [],
          },
        },
      },
    },
    "GET /api/connectors/google/gmail/status": {
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
          connections: [safeConnection()],
          sources: [safeGmailSource()],
          state: {
            connections: [safeConnection()],
            sources: [safeGmailSource()],
            syncJobs: [],
          },
          messageCount: 1,
        },
      },
    },
    "POST /api/connectors/google/gmail/connect": {
      status: 201,
      body: {
        data: {
          providerConfigKey: "google-gmail-staging",
          connectLink: "https://connect.nango.test/connect-session-token",
          token: "connect-session-token",
          expiresAt: "2026-05-22T12:05:00.000Z",
          requestableSurfaceIds: ["google_gmail"],
          requestableScopeUrls: [gmailReadonlyScope],
          restrictedScope: true,
          gated: true,
          private: true,
        },
      },
    },
  };
}

function safeConnection() {
  return {
    id: "connector-gmail-connection-1",
    status: "connected",
    surfaces: ["google_gmail"],
    credential: {
      providerConfigKey: "google-gmail-staging",
      connectionId: "nango-gmail-1",
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

type MockRoute = {
  status: number;
  body: unknown;
};
