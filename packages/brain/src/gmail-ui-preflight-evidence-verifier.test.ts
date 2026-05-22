import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const verifier = ["scripts/verify-gmail-ui-preflight-evidence.mjs", "-"];

test("Gmail UI preflight evidence verifier accepts sanitized route evidence", () => {
  const output = execFileSync(process.execPath, verifier, {
    cwd: repoRoot,
    encoding: "utf8",
    input: JSON.stringify(validUiPreflightEvidence()),
  });
  const payload = JSON.parse(output) as {
    ok: boolean;
    preflightOk: boolean;
    stagingRunId: string | null;
    checkCount: number;
  };

  assert.equal(payload.ok, true);
  assert.equal(payload.preflightOk, true);
  assert.equal(payload.stagingRunId, "gmail-staging-run-2026-05-22");
  assert.equal(payload.checkCount, 5);
});

test("Gmail UI preflight evidence verifier accepts sanitized failure evidence only when requested", () => {
  const output = execFileSync(process.execPath, [...verifier, "--allow-failure"], {
    cwd: repoRoot,
    encoding: "utf8",
    input: JSON.stringify(failedUiPreflightEvidence()),
  });
  const payload = JSON.parse(output) as { ok: boolean; preflightOk: boolean; checkCount: number };

  assert.equal(payload.ok, true);
  assert.equal(payload.preflightOk, false);
  assert.equal(payload.checkCount, 1);

  const failure = runVerifierExpectingFailure(failedUiPreflightEvidence());

  assert.match(failure, /Failed UI preflight evidence is only valid with --allow-failure/);
});

test("Gmail UI preflight evidence verifier rejects unsafe run ids without echoing them", () => {
  const evidence = validUiPreflightEvidence();

  evidence.stagingRunId = "staged-account@example.com";

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /UI preflight evidence stagingRunId must be a safe opaque slug/);
  assert.doesNotMatch(failure, /staged-account@example\.com/);
});

test("Gmail UI preflight evidence verifier rejects unknown check rows", () => {
  const evidence = validUiPreflightEvidence();

  evidence.checks.push({ name: "legacy.uiReady", ok: true });

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /UI preflight evidence check 6 name must match an allowed UI preflight check/);
});

test("Gmail UI preflight evidence verifier rejects duplicate check rows", () => {
  const evidence = validUiPreflightEvidence();
  const firstCheck = evidence.checks[0];

  assert.ok(firstCheck);
  evidence.checks.push({ ...firstCheck });

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /UI preflight evidence must include brain\.documents only once/);
});

test("Gmail UI preflight evidence verifier rejects weak route facts", () => {
  const evidence = validUiPreflightEvidence();
  const documentsCheck = evidence.checks.find((check) => check.name === "brain.documents");
  const gmailCheck = evidence.checks.find((check) => check.name === "gmail.status");

  assert.ok(documentsCheck);
  assert.ok(gmailCheck);
  delete documentsCheck.documentCount;
  gmailCheck.messageCount = "0";

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /UI preflight Brain documents check must include documentCount/);
  assert.match(failure, /UI preflight Gmail status check must include messageCount/);
});

test("Gmail UI preflight evidence verifier rejects raw connect, token, and body fields", () => {
  const evidence = validUiPreflightEvidence();
  const providerCheck = evidence.checks.find((check) => check.name === "google.provider");
  const gmailCheck = evidence.checks.find((check) => check.name === "gmail.status");

  assert.ok(providerCheck);
  assert.ok(gmailCheck);
  providerCheck.connect_link = "https://connect.nango.dev/session-token";
  providerCheck.access_token = "ya29.example-token";
  gmailCheck.rawBody = "private raw Gmail body";

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /connect_link must not be present/);
  assert.match(failure, /access_token must not be present/);
  assert.match(failure, /rawBody must not be present/);
  assert.match(failure, /raw connect\/session\/token or Gmail body value/);
});

test("Gmail UI preflight evidence verifier rejects raw body markers in harmless-looking values", () => {
  const evidence = validUiPreflightEvidence();
  const gmailCheck = evidence.checks.find((check) => check.name === "gmail.status");

  assert.ok(gmailCheck);
  gmailCheck.operatorNote = "Copied route output mentioned plainTextBody in a sanitized note.";

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /raw connect\/session\/token or Gmail body value/);
});

function runVerifierExpectingFailure(evidence: Record<string, unknown>, ...args: string[]): string {
  try {
    execFileSync(process.execPath, [...verifier, ...args], {
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

  assert.fail("Expected verifier to reject UI preflight evidence.");
}

function validUiPreflightEvidence(): Record<string, unknown> & {
  stagingRunId: string;
  checks: Array<Record<string, unknown> & { name: string }>;
} {
  return {
    ok: true,
    baseUrl: "https://penny-staging.example.test",
    userId: "bundle-user",
    workspaceId: "bundle-workspace",
    projectId: "bundle-project",
    sphereId: "bundle-sphere",
    stagingRunId: "gmail-staging-run-2026-05-22",
    checkedAt: "2026-05-22T12:00:00.000Z",
    checks: [
      {
        name: "brain.documents",
        documentCount: 1,
      },
      {
        name: "brain.memoryProfile",
        sourceCount: 0,
        memoryNodeCount: 0,
      },
      {
        name: "brain.recents",
        recentCount: 0,
      },
      {
        name: "google.provider",
        configured: true,
        surfaceCount: 1,
        gmailStatus: "available",
        providerStatePrivacySafe: true,
      },
      {
        name: "gmail.status",
        status: "available",
        connectionCount: 0,
        sourceCount: 0,
        messageCount: 0,
        restrictedScope: true,
        gated: true,
        private: true,
        statusStatePrivacySafe: true,
      },
    ],
  };
}

function failedUiPreflightEvidence(): Record<string, unknown> & { checks: Array<Record<string, unknown> & { name: string }> } {
  return {
    ok: false,
    baseUrl: "https://penny-staging.example.test",
    userId: "bundle-user",
    workspaceId: "bundle-workspace",
    projectId: "bundle-project",
    sphereId: "bundle-sphere",
    stagingRunId: "gmail-staging-run-2026-05-22",
    failedAt: "2026-05-22T12:00:00.000Z",
    error: "local UI preflight needs a valid migrated DATABASE_URL before opening the browser",
    checks: [
      {
        name: "brain.documents",
        documentCount: 0,
      },
    ],
  };
}
