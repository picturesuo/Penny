import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

test("Gmail browser evidence verifier accepts complete manual browser proof", () => {
  const output = execFileSync(process.execPath, ["scripts/verify-gmail-browser-evidence.mjs", "-"], {
    cwd: repoRoot,
    encoding: "utf8",
    input: JSON.stringify(validBrowserEvidence()),
  });
  const payload = JSON.parse(output) as { ok: boolean; browserEvidenceVerified: boolean; preOAuthOnly: boolean; checkCount: number; proofArtifactCount: number };

  assert.equal(payload.ok, true);
  assert.equal(payload.browserEvidenceVerified, true);
  assert.equal(payload.preOAuthOnly, false);
  assert.equal(payload.checkCount, 8);
  assert.equal(payload.proofArtifactCount, 3);
});

test("Gmail browser evidence verifier accepts pre-OAuth UI preflight proof", () => {
  const output = execFileSync(process.execPath, ["scripts/verify-gmail-browser-evidence.mjs", "-", "--pre-oauth-only"], {
    cwd: repoRoot,
    encoding: "utf8",
    input: JSON.stringify(preOAuthEvidence()),
  });
  const payload = JSON.parse(output) as { ok: boolean; preOAuthOnly: boolean; checkCount: number; proofArtifactCount: number };

  assert.equal(payload.ok, true);
  assert.equal(payload.preOAuthOnly, true);
  assert.equal(payload.checkCount, 3);
  assert.equal(payload.proofArtifactCount, 1);
});

test("Gmail browser evidence verifier validates local proof artifact files", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "penny-gmail-browser-artifacts-"));

  try {
    await writeBrowserArtifacts(tmp);
    const output = execFileSync(
      process.execPath,
      ["scripts/verify-gmail-browser-evidence.mjs", "-", `--artifact-root=${tmp}`, "--require-artifact-files"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        input: JSON.stringify(validBrowserEvidence()),
      },
    );
    const payload = JSON.parse(output) as { ok: boolean; artifactFilesVerified: boolean; proofArtifactCount: number };

    assert.equal(payload.ok, true);
    assert.equal(payload.artifactFilesVerified, true);
    assert.equal(payload.proofArtifactCount, 3);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("Gmail browser evidence verifier rejects missing local proof artifact files", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "penny-gmail-browser-artifacts-"));

  try {
    const failure = runVerifierExpectingFailure(validBrowserEvidence(), `--artifact-root=${tmp}`, "--require-artifact-files");

    assert.match(failure, /screenshots\/gmail-pre-oauth\.png could not be read/);
    assert.match(failure, /screenshots\/gmail-connected-results\.png could not be read/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
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

test("Gmail browser evidence verifier rejects missing OAuth and Nango webhook proof", () => {
  const evidence = validBrowserEvidence();
  const connectedResults = evidence.checks.find((check) => check.name === "brain.gmailConnectedResults") as Record<string, unknown>;

  delete connectedResults.oauthCompleted;
  connectedResults.nangoAuthWebhookVerified = false;

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /OAuth completed for the staged Gmail account/);
  assert.match(failure, /Nango delivered and Penny accepted the Gmail auth webhook/);
});

test("Gmail browser evidence verifier rejects missing staged account and Nango delivery proof", () => {
  const evidence = validBrowserEvidence();
  const connectedResults = evidence.checks.find((check) => check.name === "brain.gmailConnectedResults") as Record<string, unknown>;

  connectedResults.stagedAccountAliasPresent = false;
  connectedResults.nangoIntegrationKeyPresent = false;
  connectedResults.nangoWebhookDeliveryStatusPresent = false;
  connectedResults.selectedAccountStateVisible = false;

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /staged Gmail account alias/);
  assert.match(failure, /Nango Gmail integration key/);
  assert.match(failure, /Nango auth webhook delivery status/);
  assert.match(failure, /selected Gmail account state/);
});

test("Gmail browser evidence verifier rejects missing workflow action proof", () => {
  const evidence = validBrowserEvidence();
  const connectedResults = evidence.checks.find((check) => check.name === "brain.gmailConnectedResults") as Record<string, unknown>;

  connectedResults.syncCompleted = false;
  connectedResults.keywordSearchRan = false;

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /Sync now completed/);
  assert.match(failure, /keyword search ran/);
});

test("Gmail browser evidence verifier rejects missing downstream action proof", () => {
  const evidence = validBrowserEvidence();
  const semanticResults = evidence.checks.find((check) => check.name === "brain.gmailSemanticResults") as Record<string, unknown>;
  const createEvidence = evidence.checks.find((check) => check.name === "create.gmailEvidenceDrawer") as Record<string, unknown>;
  const exportEvidence = evidence.checks.find((check) => check.name === "create.gmailExport") as Record<string, unknown>;
  const postRevokeDelete = evidence.checks.find((check) => check.name === "brain.gmailPostRevokeDelete") as Record<string, unknown>;

  semanticResults.semanticSearchRan = false;
  createEvidence.createRunCompleted = false;
  createEvidence.evidenceDrawerOpened = false;
  exportEvidence.exportPromptGenerated = false;
  postRevokeDelete.revokeCompleted = false;
  postRevokeDelete.deleteCompleted = false;

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /semantic search ran/);
  assert.match(failure, /Create run completed/);
  assert.match(failure, /evidence drawer was opened/);
  assert.match(failure, /prompt export was generated/);
  assert.match(failure, /Gmail revoke completed/);
  assert.match(failure, /Gmail source delete completed/);
});

test("Gmail browser evidence verifier rejects missing proof artifact coverage", () => {
  const evidence = validBrowserEvidence();

  evidence.screenshots = [
    {
      label: "Incomplete browser proof",
      file: "screenshots/incomplete.png",
      proves: ["brain.gmailPanel.preOAuth"],
    },
  ];

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /proof artifacts must cover brain\.gmailKeywordFilters/);
  assert.match(failure, /proof artifacts must cover create\.gmailExport/);
});

test("Gmail browser evidence verifier rejects raw Gmail, token, and score data", () => {
  const evidence = validBrowserEvidence();
  const semantic = evidence.checks.find((check) => check.name === "brain.gmailSemanticResults") as Record<string, unknown>;

  semantic.score = 0.91;
  evidence.notes = "Copied row included plainTextBody, https://connect.nango.dev/session-token, and global training.";

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /score must not be present/);
  assert.match(failure, /raw Gmail, credential, connect, or token data/);
  assert.match(failure, /unsafe Gmail privacy claim/);
});

test("Gmail browser evidence verifier rejects weak Create export privacy proof", () => {
  const evidence = validBrowserEvidence();
  const exported = evidence.checks.find((check) => check.name === "create.gmailExport") as Record<string, unknown>;

  exported.unsafePrivacyClaimAbsent = false;

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /Export evidence must prove unsafe Gmail privacy claims are absent/);
});

function runVerifierExpectingFailure(evidence: Record<string, unknown>, ...args: string[]): string {
  try {
    execFileSync(process.execPath, ["scripts/verify-gmail-browser-evidence.mjs", "-", ...args], {
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

async function writeBrowserArtifacts(directory: string): Promise<void> {
  await mkdir(join(directory, "screenshots"), { recursive: true });
  await writeFile(join(directory, "screenshots/gmail-pre-oauth.png"), "safe screenshot placeholder\n", "utf8");
  await writeFile(join(directory, "screenshots/gmail-connected-results.png"), "safe screenshot placeholder\n", "utf8");
  await writeFile(join(directory, "screenshots/gmail-create-export-post-delete.png"), "safe screenshot placeholder\n", "utf8");
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
        proves: ["brain.gmailPanel.preOAuth", "brain.gmailKeywordFilters", "create.contextLightSurface"],
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
        label: "Brain Gmail pre-OAuth",
        file: "screenshots/gmail-pre-oauth.png",
        proves: ["brain.gmailPanel.preOAuth", "brain.gmailKeywordFilters", "create.contextLightSurface"],
      },
      {
        label: "Brain Gmail connected results",
        file: "screenshots/gmail-connected-results.png",
        proves: ["brain.gmailConnectedResults", "brain.gmailSemanticResults"],
      },
      {
        label: "Create Gmail evidence and post-delete absence",
        file: "screenshots/gmail-create-export-post-delete.png",
        proves: ["create.gmailEvidenceDrawer", "create.gmailExport", "brain.gmailPostRevokeDelete"],
      },
    ],
    checks: [
      ...preOAuthEvidence().checks,
      {
        name: "brain.gmailConnectedResults",
        selectorTargetsPresent: true,
        oauthCompleted: true,
        nangoAuthWebhookVerified: true,
        stagedAccountAliasPresent: true,
        nangoIntegrationKeyPresent: true,
        nangoWebhookDeliveryStatusPresent: true,
        selectedAccountStateVisible: true,
        syncCompleted: true,
        keywordSearchRan: true,
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
        semanticSearchRan: true,
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
        createRunCompleted: true,
        evidenceDrawerOpened: true,
        drawerVisible: true,
        realGmailRefsOnlyWhenUsed: true,
        gmailSourceRefVisible: true,
        gmailMemoryRefVisible: true,
      },
      {
        name: "create.gmailExport",
        selectorTargetsPresent: true,
        exportPromptGenerated: true,
        exportVisible: true,
        gmailContextOnlyWhenUsed: true,
        unsafePrivacyClaimAbsent: true,
        rawEmailBodyAbsent: true,
        secretOrConnectTokenAbsent: true,
        unsupportedHumanReviewClaimAbsent: true,
      },
      {
        name: "brain.gmailPostRevokeDelete",
        selectorTargetsPresent: true,
        revokeCompleted: true,
        deleteCompleted: true,
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
