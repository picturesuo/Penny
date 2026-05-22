import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const verifier = ["scripts/verify-gmail-smoke-evidence.mjs", "-", "--connect-preflight"];

test("Gmail smoke evidence verifier accepts sanitized non-destructive evidence", () => {
  const output = execFileSync(process.execPath, verifier, {
    cwd: repoRoot,
    encoding: "utf8",
    input: JSON.stringify(validEvidence()),
  });
  const payload = JSON.parse(output) as { ok: boolean; connectPreflightVerified: boolean; stepCount: number };

  assert.equal(payload.ok, true);
  assert.equal(payload.connectPreflightVerified, true);
  assert.equal(payload.stepCount, 11);
});

test("Gmail smoke evidence verifier rejects raw connect links or session tokens", () => {
  const evidence = validEvidence();
  const connectStep = evidence.steps.find((step) => step.step === "connect.preflight") as Record<string, unknown>;

  connectStep.connectLink = "https://connect.nango.dev/session-token";
  connectStep.token = "gmail-session-token";

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /connectLink must not be present/);
  assert.match(failure, /token must not be present/);
  assert.match(failure, /raw connect\/session\/token value/);
});

test("Gmail smoke evidence verifier accepts connect preflight-only evidence", () => {
  const output = execFileSync(process.execPath, ["scripts/verify-gmail-smoke-evidence.mjs", "-", "--connect-preflight-only"], {
    cwd: repoRoot,
    encoding: "utf8",
    input: JSON.stringify(connectPreflightOnlyEvidence()),
  });
  const payload = JSON.parse(output) as { ok: boolean; connectPreflightOnly: boolean; connectPreflightVerified: boolean; stepCount: number };

  assert.equal(payload.ok, true);
  assert.equal(payload.connectPreflightOnly, true);
  assert.equal(payload.connectPreflightVerified, true);
  assert.equal(payload.stepCount, 2);
});

test("Gmail smoke evidence verifier accepts destructive revoke and delete evidence", () => {
  const output = execFileSync(process.execPath, [...verifier, "--destructive"], {
    cwd: repoRoot,
    encoding: "utf8",
    input: JSON.stringify(destructiveEvidence()),
  });
  const payload = JSON.parse(output) as { ok: boolean; destructive: boolean };

  assert.equal(payload.ok, true);
  assert.equal(payload.destructive, true);
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

  assert.fail("Expected verifier to reject unsafe evidence.");
}

function validEvidence(): Record<string, unknown> & { steps: Array<Record<string, unknown>> } {
  return {
    baseUrl: "http://localhost:3000",
    startedAt: "2026-05-22T12:00:00.000Z",
    completedAt: "2026-05-22T12:01:00.000Z",
    steps: [
      {
        step: "connect.preflight",
        providerConfigKey: "google-gmail",
        connectLinkPresent: true,
        connectLinkHost: "connect.nango.dev",
        tokenPresent: true,
        expiresAtPresent: true,
        requestedSurfaceIds: ["google_gmail"],
        requestableSurfaceIds: ["google_gmail"],
        requestableScopeUrls: ["https://www.googleapis.com/auth/gmail.readonly"],
        restrictedScope: true,
        gated: true,
        private: true,
        scopeAuditReason: "read email for private Brain memory and email search.",
        warningsCount: 0,
      },
      {
        step: "status.initial",
        restrictedScope: true,
        gated: true,
        private: true,
        rawRetentionDefault: false,
        noHumanReview: true,
        statusStatePrivacySafe: true,
        providerStatePrivacySafe: true,
        connectionCount: 1,
      },
      {
        step: "sync",
        messageCount: 1,
        partialFailureCount: 0,
        cursorPresent: true,
        historyIdPresent: false,
      },
      {
        step: "status.afterSync",
        messageCount: 1,
        statusStatePrivacySafe: true,
        providerStatePrivacySafe: true,
      },
      {
        step: "sync.repeat",
        partialFailureCount: 0,
        statusMessageCountUnchanged: true,
        selectedSourceCountUnchanged: true,
        duplicateSourceRefsAbsent: true,
      },
      {
        step: "keywordSearch",
        query: '"launch partner evidence" from:alice@example.com subject:"Launch plan"',
        stored: false,
        resultCount: 1,
        memoryCountUnchanged: true,
      },
      {
        step: "keywordSearch.syncExplicit",
        query: '"launch partner evidence" from:alice@example.com subject:"Launch plan"',
        stored: true,
        resultCount: 1,
        partialFailureCount: 0,
        duplicateSourceRefsAbsent: true,
      },
      {
        step: "semanticSearch",
        resultCount: 1,
        contextLight: false,
        rawScoreHidden: true,
      },
      {
        step: "create.first",
        memoryCountUsed: 1,
        sourceCountUsed: 1,
        expectedEvidencePresent: true,
      },
      {
        step: "create.export",
        expectedEvidencePresent: true,
        unsafePrivacyClaimAbsent: true,
      },
      {
        step: "revoke.delete.skipped",
        reason: "non destructive",
      },
    ],
  };
}

function connectPreflightOnlyEvidence(): Record<string, unknown> & { steps: Array<Record<string, unknown>> } {
  return {
    baseUrl: "http://localhost:3000",
    startedAt: "2026-05-22T12:00:00.000Z",
    completedAt: "2026-05-22T12:00:10.000Z",
    steps: [
      {
        step: "connect.preflight",
        providerConfigKey: "google-gmail",
        connectLinkPresent: true,
        connectLinkHost: "connect.nango.dev",
        tokenPresent: true,
        expiresAtPresent: true,
        requestedSurfaceIds: ["google_gmail"],
        requestableSurfaceIds: ["google_gmail"],
        requestableScopeUrls: ["https://www.googleapis.com/auth/gmail.readonly"],
        restrictedScope: true,
        gated: true,
        private: true,
        scopeAuditReason: "read email for private Brain memory and email search.",
        warningsCount: 0,
      },
      {
        step: "connect.preflightOnly.completed",
        reason: "Connect-session preflight completed without running post-OAuth Gmail smoke checks.",
      },
    ],
  };
}

function destructiveEvidence(): Record<string, unknown> & { steps: Array<Record<string, unknown>> } {
  const evidence = validEvidence();

  evidence.steps = evidence.steps.filter((step) => step.step !== "revoke.delete.skipped");
  evidence.steps.push(
    {
      step: "revoke",
      revoked: true,
      syncAfterRevokeStatus: 409,
      searchAfterRevokeStatus: 409,
      semanticAfterRevokeStatus: 409,
    },
    {
      step: "deleteSource",
      brainSourceDeleted: true,
      brainProfileSourceAbsent: true,
      brainRetrieveDeletedSourceAbsent: true,
      semanticDeletedSourceAbsent: true,
      createDeletedSourceAbsent: true,
      createDeletedMemoryAbsent: true,
    },
  );

  return evidence;
}
