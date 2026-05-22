import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const verifier = ["scripts/verify-gmail-readiness-evidence.mjs", "-", "--strict-staging", "--connect-preflight"];

test("Gmail readiness evidence verifier accepts sanitized strict connect preflight evidence", () => {
  const output = execFileSync(process.execPath, verifier, {
    cwd: repoRoot,
    encoding: "utf8",
    input: JSON.stringify(validReadinessEvidence()),
  });
  const payload = JSON.parse(output) as {
    ok: boolean;
    readinessOk: boolean;
    strictStagingVerified: boolean;
    connectPreflightVerified: boolean;
    checkCount: number;
  };

  assert.equal(payload.ok, true);
  assert.equal(payload.readinessOk, true);
  assert.equal(payload.strictStagingVerified, true);
  assert.equal(payload.connectPreflightVerified, true);
  assert.equal(payload.checkCount, 6);
});

test("Gmail readiness evidence verifier accepts sanitized failure evidence only when requested", () => {
  const output = execFileSync(process.execPath, ["scripts/verify-gmail-readiness-evidence.mjs", "-", "--allow-failure"], {
    cwd: repoRoot,
    encoding: "utf8",
    input: JSON.stringify(failedReadinessEvidence()),
  });
  const payload = JSON.parse(output) as { ok: boolean; readinessOk: boolean; checkCount: number };

  assert.equal(payload.ok, true);
  assert.equal(payload.readinessOk, false);
  assert.equal(payload.checkCount, 1);

  const failure = runVerifierExpectingFailure(failedReadinessEvidence());

  assert.match(failure, /Failed readiness evidence is only valid with --allow-failure/);
});

test("Gmail readiness evidence verifier rejects raw connect links or session tokens", () => {
  const evidence = validReadinessEvidence();
  const connect = evidence.checks.find((check) => check.name === "api.connectPreflight") as Record<string, unknown>;

  connect.connectLink = "https://connect.nango.dev/session-token";
  connect.token = "gmail-session-token";

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /connectLink must not be present/);
  assert.match(failure, /token must not be present/);
  assert.match(failure, /raw connect\/session\/token value/);
});

test("Gmail readiness evidence verifier rejects unsafe run ids without echoing them", () => {
  const evidence = validReadinessEvidence();

  evidence.stagingRunId = "staged-account@example.com";

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /Readiness evidence stagingRunId must be a safe opaque slug/);
  assert.doesNotMatch(failure, /staged-account@example\.com/);
});

test("Gmail readiness evidence verifier rejects weak staging evidence", () => {
  const evidence = validReadinessEvidence();

  evidence.requireStaging = false;
  evidence.checks = evidence.checks.filter((check) => check.name !== "env.strictStaging");

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /Strict staging verification requires requireStaging=true/);
  assert.match(failure, /Readiness evidence must include env.strictStaging/);
});

test("Gmail readiness evidence verifier rejects unknown readiness check rows", () => {
  const evidence = validReadinessEvidence();

  evidence.checks.push({
    name: "legacy.gmailReady",
    ok: true,
  });

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /Readiness evidence check 7 name must match an allowed readiness check/);
});

test("Gmail readiness evidence verifier rejects duplicate readiness check rows", () => {
  const evidence = validReadinessEvidence();

  evidence.checks.push({ ...evidence.checks[0] });

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /Readiness evidence must include env\.requiredPresence only once/);
});

function runVerifierExpectingFailure(evidence: Record<string, unknown>): string {
  try {
    execFileSync(process.execPath, verifier, {
      cwd: repoRoot,
      encoding: "utf8",
      input: JSON.stringify(evidence),
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (caught) {
    const error = caught as { status?: number; stderr?: Buffer | string };

    assert.equal(error.status, 1);

    return String(error.stderr);
  }

  assert.fail("Expected verifier to reject readiness evidence.");
}

function validReadinessEvidence(): Record<string, unknown> & { requireStaging: boolean; checks: Array<Record<string, unknown> & { name: string }> } {
  return {
    ok: true,
    baseUrl: "https://penny-staging.example.test",
    userId: "readiness-user",
    workspaceId: "readiness-workspace",
    projectId: "readiness-project",
    sphereId: "readiness-sphere",
    requireStaging: true,
    connectPreflight: true,
    checkedAt: "2026-05-22T12:00:00.000Z",
    checks: [
      {
        name: "env.requiredPresence",
        envFileConfigured: true,
        envFileLoaded: true,
        envFileLoadErrorPresent: false,
        requireStaging: true,
        connectPreflight: true,
        enableGoogleConnector: true,
        enableGmailConnector: true,
        enableRestrictedGoogleScopes: true,
        nangoSecretPresent: true,
        nangoPublicPresent: true,
        nangoBaseUrlPresent: true,
        nangoGmailIntegrationIdPresent: true,
        databaseUrlPresent: true,
        pennyAuthModePresent: true,
        apiTokenPresent: true,
        sessionSecretPresent: true,
        corsOriginsPresent: true,
        rateLimitPresent: true,
        trustAuthHeadersPresent: true,
        databasePrepBypass: false,
      },
      {
        name: "env.gmail",
        envFileLoaded: true,
        enableGoogleConnector: true,
        enableGmailConnector: true,
        enableRestrictedGoogleScopes: true,
        nangoSecretPresent: true,
        nangoPublicPresent: true,
        nangoBaseHost: "api.nango.dev",
        nangoGmailIntegrationId: "google-gmail-staging",
        databasePrepBypass: false,
      },
      {
        name: "env.strictStaging",
        databaseUrlPresent: true,
        pennyAuthMode: "token",
        apiTokenPresent: true,
        sessionSecretPresent: true,
        baseUrlOrigin: "https://penny-staging.example.test",
        baseUrlHttpsOrLoopback: true,
        corsOriginCount: 1,
        corsIncludesBaseOrigin: true,
        corsWildcardAbsent: true,
        rateLimitMax: 120,
        trustAuthHeaders: false,
      },
      {
        name: "api.googleProvider",
        configured: true,
        surfaceCount: 2,
        gmailStatus: "available",
        providerStatePrivacySafe: true,
      },
      {
        name: "api.gmailStatus",
        status: "available",
        connectionCount: 0,
        sourceCount: 0,
        messageCount: 0,
        restrictedScope: true,
        gated: true,
        private: true,
        statusStatePrivacySafe: true,
      },
      {
        name: "api.connectPreflight",
        providerConfigKey: "google-gmail-staging",
        connectLinkPresent: true,
        connectLinkHost: "connect.nango.dev",
        tokenPresent: true,
        expiresAtPresent: true,
        requestableSurfaceIds: ["google_gmail"],
        requestableScopeUrls: ["https://www.googleapis.com/auth/gmail.readonly"],
        restrictedScope: true,
        gated: true,
        private: true,
      },
    ],
  };
}

function failedReadinessEvidence(): Record<string, unknown> {
  return {
    ok: false,
    baseUrl: "http://localhost:3000",
    userId: "readiness-user",
    workspaceId: "readiness-workspace",
    projectId: "readiness-project",
    sphereId: "readiness-sphere",
    requireStaging: true,
    connectPreflight: false,
    failedAt: "2026-05-22T12:00:00.000Z",
    error: "NANGO_PUBLIC_KEY must be set for Gmail staging readiness.",
    checks: [
      {
        name: "env.requiredPresence",
        envFileConfigured: true,
        envFileLoaded: true,
        envFileLoadErrorPresent: false,
        requireStaging: true,
        connectPreflight: false,
        enableGoogleConnector: true,
        enableGmailConnector: true,
        enableRestrictedGoogleScopes: true,
        nangoSecretPresent: true,
        nangoPublicPresent: false,
        nangoBaseUrlPresent: true,
        nangoGmailIntegrationIdPresent: true,
        databaseUrlPresent: true,
        pennyAuthModePresent: true,
        apiTokenPresent: true,
        sessionSecretPresent: true,
        corsOriginsPresent: true,
        rateLimitPresent: true,
        trustAuthHeadersPresent: true,
        databasePrepBypass: false,
      },
    ],
  };
}
