import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

test("Gmail browser evidence verifier accepts complete manual browser proof", () => {
  const output = execFileSync(process.execPath, ["scripts/verify-gmail-browser-evidence.mjs", "-"], {
    cwd: repoRoot,
    encoding: "utf8",
    input: JSON.stringify(validBrowserEvidence()),
  });
  const payload = JSON.parse(output) as { ok: boolean; browserEvidenceVerified: boolean; preOAuthOnly: boolean; checkCount: number };

  assert.equal(payload.ok, true);
  assert.equal(payload.browserEvidenceVerified, true);
  assert.equal(payload.preOAuthOnly, false);
  assert.equal(payload.checkCount, 8);
});

test("Gmail browser evidence verifier accepts pre-OAuth UI preflight proof", () => {
  const output = execFileSync(process.execPath, ["scripts/verify-gmail-browser-evidence.mjs", "-", "--pre-oauth-only"], {
    cwd: repoRoot,
    encoding: "utf8",
    input: JSON.stringify(preOAuthEvidence()),
  });
  const payload = JSON.parse(output) as { ok: boolean; preOAuthOnly: boolean; checkCount: number };

  assert.equal(payload.ok, true);
  assert.equal(payload.preOAuthOnly, true);
  assert.equal(payload.checkCount, 3);
});

test("Gmail browser evidence verifier rejects missing post-OAuth surfaces by default", () => {
  const failure = runVerifierExpectingFailure(preOAuthEvidence());

  assert.match(failure, /Browser evidence must include brain\.gmailConnectedResults/);
  assert.match(failure, /Browser evidence must include brain\.gmailSemanticResults/);
  assert.match(failure, /Browser evidence must include create\.gmailEvidenceDrawer/);
  assert.match(failure, /Browser evidence must include create\.gmailExport/);
  assert.match(failure, /Browser evidence must include brain\.gmailPostRevokeDelete/);
});

test("Gmail browser evidence verifier rejects missing stable selector proof", () => {
  const evidence = validBrowserEvidence();
  const connectedResults = evidence.checks.find((check) => check.name === "brain.gmailConnectedResults") as Record<string, unknown>;

  delete connectedResults.selectorTargetsPresent;

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /stable connected Gmail selector targets/);
});

test("Gmail browser evidence verifier rejects raw Gmail, token, and score data", () => {
  const evidence = validBrowserEvidence();
  const semantic = evidence.checks.find((check) => check.name === "brain.gmailSemanticResults") as Record<string, unknown>;

  semantic.score = 0.91;
  evidence.notes = "Copied row included plainTextBody and https://connect.nango.dev/session-token";

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /score must not be present/);
  assert.match(failure, /raw Gmail, credential, connect, or token data/);
});

function runVerifierExpectingFailure(evidence: Record<string, unknown>): string {
  try {
    execFileSync(process.execPath, ["scripts/verify-gmail-browser-evidence.mjs", "-"], {
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

  assert.fail("Expected browser evidence verifier to reject evidence.");
}

function preOAuthEvidence(): Record<string, unknown> & { checks: Array<Record<string, unknown>> } {
  return {
    ok: true,
    ...scope(),
    capturedAt: "2026-05-22T12:00:00.000Z",
    mode: "manual",
    screenshots: [
      {
        label: "Brain Gmail pre-OAuth",
        file: "screenshots/gmail-pre-oauth.png",
        proves: ["brain.gmailPanel.preOAuth", "brain.gmailKeywordFilters"],
      },
    ],
    checks: [
      {
        name: "brain.gmailPanel.preOAuth",
        selectorTargetsPresent: true,
        gmailCardVisible: true,
        gmailReadonlyVisible: true,
        restrictedPrivateCopyVisible: true,
        privacyCopyVisible: true,
        syncDisabledBeforeConnection: true,
        keywordSearchDisabledBeforeConnection: true,
        semanticSearchDisabledBeforeConnection: true,
        revokeDisabledBeforeConnection: true,
        deleteDisabledBeforeConnection: true,
      },
      {
        name: "brain.gmailKeywordFilters",
        selectorTargetsPresent: true,
        disclosureOpen: true,
        fieldsVisible: ["from", "to", "subject", "label", "after", "before", "hasAttachment"],
      },
      {
        name: "create.contextLightSurface",
        selectorTargetsPresent: true,
        createSurfaceVisible: true,
        contextLightStateVisible: true,
        detailsButtonsVisible: true,
        exportPromptControlVisible: true,
      },
    ],
  };
}

function validBrowserEvidence(): Record<string, unknown> & { checks: Array<Record<string, unknown>> } {
  return {
    ...preOAuthEvidence(),
    screenshots: [
      {
        label: "Brain Gmail full smoke",
        file: "screenshots/gmail-full-smoke.png",
        proves: ["brain.gmailConnectedResults", "brain.gmailSemanticResults", "create.gmailEvidenceDrawer", "create.gmailExport"],
      },
    ],
    checks: [
      ...preOAuthEvidence().checks,
      {
        name: "brain.gmailConnectedResults",
        selectorTargetsPresent: true,
        connectedStateVisible: true,
        gmailReadonlyVisible: true,
        messageCountVisible: true,
        sourceCountVisible: true,
        syncEnabled: true,
        revokeEnabled: true,
        deleteEnabled: true,
        keywordResultSnippetVisible: true,
        keywordMessageRefVisible: true,
        keywordThreadRefVisible: true,
        keywordSourceRefVisible: true,
      },
      {
        name: "brain.gmailSemanticResults",
        selectorTargetsPresent: true,
        resultVisible: true,
        groundingLabelVisible: true,
        scoreReasonVisible: true,
        sourceRefVisible: true,
        memoryRefVisible: true,
        rawNumericScoreHidden: true,
      },
      {
        name: "create.gmailEvidenceDrawer",
        selectorTargetsPresent: true,
        drawerVisible: true,
        realGmailRefsOnlyWhenUsed: true,
        gmailSourceRefVisible: true,
        gmailMemoryRefVisible: true,
      },
      {
        name: "create.gmailExport",
        selectorTargetsPresent: true,
        exportVisible: true,
        gmailContextOnlyWhenUsed: true,
        rawEmailBodyAbsent: true,
        secretOrConnectTokenAbsent: true,
        unsupportedHumanReviewClaimAbsent: true,
      },
      {
        name: "brain.gmailPostRevokeDelete",
        selectorTargetsPresent: true,
        postRevokeStateVisible: true,
        syncBlockedAfterRevoke: true,
        searchBlockedAfterRevoke: true,
        semanticBlockedAfterRevoke: true,
        deletedSourceAbsentFromBrainRetrieval: true,
        deletedSourceAbsentFromCreateEvidence: true,
        deletedSourceAbsentFromExport: true,
      },
    ],
  };
}

function scope() {
  return {
    baseUrl: "https://penny-staging.example.test",
    userId: "gmail-smoke-user",
    workspaceId: "gmail-smoke-workspace",
    projectId: "gmail-smoke-project",
    sphereId: "gmail-smoke-sphere",
  };
}
