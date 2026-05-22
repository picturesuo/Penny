import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    checks: Array<{
      name: string;
      baseUrlHttpsOrLoopback?: boolean;
      corsIncludesBaseOrigin?: boolean;
      corsWildcardAbsent?: boolean;
      rateLimitMax?: number;
      connectLinkHost?: string;
      tokenPresent?: boolean;
      nangoPublicPresent?: boolean;
    }>;
  };

  assert.equal(result.status, 0);
  assert.equal(payload.ok, true);
  assert.deepEqual(
    payload.checks.map((check) => check.name),
    ["env.requiredPresence", "env.gmail", "env.strictStaging", "api.googleProvider", "api.gmailStatus", "api.connectPreflight"],
  );
  assert.equal(payload.checks[0]?.nangoPublicPresent, true);
  assert.equal(payload.checks[2]?.baseUrlHttpsOrLoopback, true);
  assert.equal(payload.checks[2]?.corsIncludesBaseOrigin, true);
  assert.equal(payload.checks[2]?.corsWildcardAbsent, true);
  assert.equal(payload.checks[2]?.rateLimitMax, 120);
  assert.equal(payload.checks[5]?.connectLinkHost, "connect.nango.test");
  assert.equal(payload.checks[5]?.tokenPresent, true);
  assert.deepEqual(
    requests.map((request) => `${request.method} ${request.url}`),
    ["GET /api/connectors/google", "GET /api/connectors/google/gmail/status", "POST /api/connectors/google/gmail/connect"],
  );
  assert.doesNotMatch(result.stdout, /readiness-secret-value|readiness-public-value|strict-api-token|session-secret-value/i);
  assert.doesNotMatch(result.stdout, /connect-session-token|https:\/\/connect\.nango\.test/i);
  assert.doesNotMatch(result.stderr, /readiness-secret-value|readiness-public-value|strict-api-token|session-secret-value/i);
});

test("Gmail staging readiness checker rejects unsafe run ids without writing them", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "penny-gmail-readiness-"));
  const evidenceFile = join(tmp, "unsafe-run-id-evidence.json");
  const requests: Array<{ method: string | undefined; url: string | undefined }> = [];
  const unsafeRunId = "staged-account@example.com";

  try {
    const result = await runReadiness({
      routes: readinessRoutes(),
      requests,
      env: readyStrictEnv({
        GMAIL_STAGING_RUN_ID: unsafeRunId,
        GMAIL_READINESS_EVIDENCE_FILE: evidenceFile,
      }),
    });
    const evidenceText = await readFile(evidenceFile, "utf8");
    const evidence = JSON.parse(evidenceText) as { ok: boolean; stagingRunId?: string; error?: string };

    assert.equal(result.status, 1);
    assert.equal(requests.length, 0);
    assert.equal(evidence.ok, false);
    assert.equal(evidence.stagingRunId, undefined);
    assert.match(evidence.error ?? "", /GMAIL_STAGING_RUN_ID must be a safe opaque slug/);
    assert.doesNotMatch(result.stderr, new RegExp(unsafeRunId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(evidenceText, new RegExp(unsafeRunId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("Gmail staging readiness checker rejects missing NANGO_GMAIL_INTEGRATION_ID before API calls", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "penny-gmail-readiness-"));
  const evidenceFile = join(tmp, "missing-integration-evidence.json");
  const requests: Array<{ method: string | undefined; url: string | undefined }> = [];
  const env = readyStrictEnv();

  delete env.NANGO_GMAIL_INTEGRATION_ID;
  env.GMAIL_READINESS_EVIDENCE_FILE = evidenceFile;

  try {
    const result = await runReadiness({
      routes: readinessRoutes(),
      requests,
      env,
    });
    const evidence = JSON.parse(await readFile(evidenceFile, "utf8")) as {
      ok: boolean;
      error?: string;
      checks: Array<{ name?: string; nangoGmailIntegrationIdPresent?: boolean; nangoPublicPresent?: boolean }>;
    };

    assert.equal(result.status, 1);
    assert.equal(requests.length, 0);
    assert.equal(evidence.ok, false);
    assert.equal(evidence.checks.length, 1);
    assert.equal(evidence.checks[0]?.name, "env.requiredPresence");
    assert.equal(evidence.checks[0]?.nangoGmailIntegrationIdPresent, false);
    assert.equal(evidence.checks[0]?.nangoPublicPresent, true);
    assert.match(result.stderr, /NANGO_GMAIL_INTEGRATION_ID must be set for Gmail staging readiness/);
    assert.match(evidence.error ?? "", /NANGO_GMAIL_INTEGRATION_ID must be set for Gmail staging readiness/);
    assert.doesNotMatch(result.stderr, /readiness-secret-value|readiness-public-value|strict-api-token|session-secret-value/i);
    assert.doesNotMatch(JSON.stringify(evidence), /readiness-secret-value|readiness-public-value|strict-api-token|session-secret-value/i);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("Gmail staging readiness checker records missing NANGO_PUBLIC_KEY before API calls", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "penny-gmail-readiness-"));
  const evidenceFile = join(tmp, "missing-public-key-evidence.json");
  const requests: Array<{ method: string | undefined; url: string | undefined }> = [];
  const env = readyStrictEnv();

  delete env.NANGO_PUBLIC_KEY;
  env.GMAIL_READINESS_EVIDENCE_FILE = evidenceFile;

  try {
    const result = await runReadiness({
      routes: readinessRoutes(),
      requests,
      env,
    });
    const evidence = JSON.parse(await readFile(evidenceFile, "utf8")) as {
      ok: boolean;
      error?: string;
      checks: Array<{ name?: string; nangoSecretPresent?: boolean; nangoPublicPresent?: boolean; nangoGmailIntegrationIdPresent?: boolean }>;
    };

    assert.equal(result.status, 1);
    assert.equal(requests.length, 0);
    assert.equal(evidence.ok, false);
    assert.equal(evidence.checks.length, 1);
    assert.equal(evidence.checks[0]?.name, "env.requiredPresence");
    assert.equal(evidence.checks[0]?.nangoSecretPresent, true);
    assert.equal(evidence.checks[0]?.nangoPublicPresent, false);
    assert.equal(evidence.checks[0]?.nangoGmailIntegrationIdPresent, true);
    assert.match(result.stderr, /NANGO_PUBLIC_KEY must be set for Gmail staging readiness/);
    assert.match(evidence.error ?? "", /NANGO_PUBLIC_KEY must be set for Gmail staging readiness/);
    assert.doesNotMatch(result.stderr, /readiness-secret-value|readiness-public-value|strict-api-token|session-secret-value/i);
    assert.doesNotMatch(JSON.stringify(evidence), /readiness-secret-value|readiness-public-value|strict-api-token|session-secret-value/i);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
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

test("Gmail staging readiness checker rejects wildcard CORS in strict staging mode before API calls", async () => {
  const requests: Array<{ method: string | undefined; url: string | undefined }> = [];
  const result = await runReadiness({
    routes: readinessRoutes(),
    requests,
    env: readyStrictEnv({
      GMAIL_READINESS_REQUIRE_STAGING: "true",
      PENNY_CORS_ORIGINS: "*",
    }),
  });

  assert.equal(result.status, 1);
  assert.equal(requests.length, 0);
  assert.match(result.stderr, /PENNY_CORS_ORIGINS must not include wildcard origins/);
});

test("Gmail staging readiness checker loads an env file without leaking values", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "penny-gmail-readiness-"));
  const envFile = join(tmp, "gmail.env");
  const evidenceFile = join(tmp, "readiness-evidence.json");
  const requests: Array<{ method: string | undefined; url: string | undefined }> = [];

  await writeFile(
    envFile,
    [
      "ENABLE_GOOGLE_CONNECTOR=true",
      "ENABLE_GMAIL_CONNECTOR=true",
      "ENABLE_RESTRICTED_GOOGLE_SCOPES=true",
      "NANGO_SECRET_KEY=file-secret-value",
      "NANGO_PUBLIC_KEY=file-public-value",
      "NANGO_BASE_URL=https://api.nango.test",
      "NANGO_GMAIL_INTEGRATION_ID=google-gmail-staging",
      "DATABASE_URL='postgresql://penny:penny@db.example.test:5432/penny'",
      "PENNY_AUTH_MODE=token",
      "PENNY_API_TOKEN=file-api-token-value-32-characters",
      "PENNY_SESSION_SECRET=file-session-secret-32-characters",
      "PENNY_TRUST_AUTH_HEADERS=false",
      "PENNY_RATE_LIMIT_MAX=120",
      "",
    ].join("\n"),
  );

  try {
    const result = await runReadiness({
      routes: readinessRoutes(),
      requests,
      env: {
        GMAIL_READINESS_ENV_FILE: envFile,
        GMAIL_READINESS_EVIDENCE_FILE: evidenceFile,
        GMAIL_READINESS_REQUIRE_STAGING: "true",
        GMAIL_READINESS_CONNECT_PREFLIGHT: "true",
      },
    });
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      checks: Array<{ name: string; envFileConfigured?: boolean; envFileLoaded?: boolean }>;
    };
    const evidence = JSON.parse(await readFile(evidenceFile, "utf8")) as typeof payload;
    const presenceCheck = payload.checks.find((check) => check.name === "env.requiredPresence");
    const envCheck = payload.checks.find((check) => check.name === "env.gmail");
    const evidencePresenceCheck = evidence.checks.find((check) => check.name === "env.requiredPresence");
    const evidenceEnvCheck = evidence.checks.find((check) => check.name === "env.gmail");

    assert.equal(result.status, 0);
    assert.equal(payload.ok, true);
    assert.equal(evidence.ok, true);
    assert.equal(presenceCheck?.envFileConfigured, true);
    assert.equal(presenceCheck?.envFileLoaded, true);
    assert.equal(envCheck?.envFileLoaded, true);
    assert.equal(evidencePresenceCheck?.envFileConfigured, true);
    assert.equal(evidencePresenceCheck?.envFileLoaded, true);
    assert.equal(evidenceEnvCheck?.envFileLoaded, true);
    assert.deepEqual(
      requests.map((request) => `${request.method} ${request.url}`),
      ["GET /api/connectors/google", "GET /api/connectors/google/gmail/status", "POST /api/connectors/google/gmail/connect"],
    );
    assert.doesNotMatch(result.stdout, /file-secret-value|file-public-value|file-api-token|file-session-secret/i);
    assert.doesNotMatch(result.stderr, /file-secret-value|file-public-value|file-api-token|file-session-secret/i);
    assert.doesNotMatch(JSON.stringify(evidence), /file-secret-value|file-public-value|file-api-token|file-session-secret/i);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
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
        PENNY_CORS_ORIGINS: `http://127.0.0.1:${address.port}`,
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
    PENNY_RATE_LIMIT_MAX: "120",
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
