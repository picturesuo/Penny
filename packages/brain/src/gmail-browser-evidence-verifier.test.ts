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
  const payload = JSON.parse(output) as {
    ok: boolean;
    browserEvidenceVerified: boolean;
    preOAuthOnly: boolean;
    stagingRunId: string | null;
    checkCount: number;
    proofArtifactCount: number;
  };

  assert.equal(payload.ok, true);
  assert.equal(payload.browserEvidenceVerified, true);
  assert.equal(payload.preOAuthOnly, false);
  assert.equal(payload.stagingRunId, "gmail-staging-run-2026-05-22");
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
    const evidence = validBrowserEvidence();

    evidence.notes = [
      {
        label: "Sanitized browser evidence note",
        file: "notes/gmail-browser-evidence.md",
        proves: ["brain.gmailPanel.preOAuth"],
      },
    ];

    await writeBrowserArtifacts(tmp);
    await mkdir(join(tmp, "notes"), { recursive: true });
    await writeFile(join(tmp, "notes/gmail-browser-evidence.md"), "Sanitized note: selectors and safe refs were visible.\n", "utf8");

    const output = execFileSync(
      process.execPath,
      ["scripts/verify-gmail-browser-evidence.mjs", "-", `--artifact-root=${tmp}`, "--require-artifact-files"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        input: JSON.stringify(evidence),
      },
    );
    const payload = JSON.parse(output) as { ok: boolean; artifactFilesVerified: boolean; proofArtifactCount: number };

    assert.equal(payload.ok, true);
    assert.equal(payload.artifactFilesVerified, true);
    assert.equal(payload.proofArtifactCount, 4);
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

test("Gmail browser evidence verifier rejects unsafe local proof artifact text", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "penny-gmail-browser-artifacts-"));
  const evidence = validBrowserEvidence();

  evidence.notes = [
    {
      label: "Unsafe copied browser note",
      file: "notes/gmail-browser-evidence.md",
      proves: ["brain.gmailPanel.preOAuth"],
    },
  ];

  try {
    await writeBrowserArtifacts(tmp);
    await mkdir(join(tmp, "notes"), { recursive: true });
    await writeFile(
      join(tmp, "notes/gmail-browser-evidence.md"),
      "Copied row included plainTextBody, https://connect.nango.dev/session-token, and global training.\n",
      "utf8",
    );

    const failure = runVerifierExpectingFailure(evidence, `--artifact-root=${tmp}`, "--require-artifact-files");

    assert.match(failure, /notes\/gmail-browser-evidence\.md looks like it contains raw Gmail, credential, connect, or token data/);
    assert.match(failure, /notes\/gmail-browser-evidence\.md looks like it contains an unsafe Gmail privacy claim/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("Gmail browser evidence verifier rejects non-image screenshot artifacts", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "penny-gmail-browser-artifacts-"));

  try {
    await writeBrowserArtifacts(tmp);
    await writeFile(join(tmp, "screenshots/gmail-pre-oauth.png"), "not a browser screenshot\n", "utf8");

    const failure = runVerifierExpectingFailure(validBrowserEvidence(), `--artifact-root=${tmp}`, "--require-artifact-files");

    assert.match(failure, /screenshots\/gmail-pre-oauth\.png must be a valid png image artifact/);
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

test("Gmail browser evidence verifier requires a run id for full proof", () => {
  const evidence = validBrowserEvidence();

  delete evidence.stagingRunId;

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /Full browser evidence must include stagingRunId/);
});

test("Gmail browser evidence verifier rejects unsafe run ids without echoing them", () => {
  const evidence = validBrowserEvidence();

  evidence.stagingRunId = "staged-account@example.com";

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /Browser evidence stagingRunId must be a safe opaque slug/);
  assert.doesNotMatch(failure, /staged-account@example\.com/);
});

test("Gmail browser evidence verifier rejects placeholder scope and invalid timestamps", () => {
  const evidence = validBrowserEvidence();

  evidence.userId = "REPLACE_WITH_USER_ID";
  evidence.workspaceId = "REPLACE_WITH_WORKSPACE_ID";
  evidence.capturedAt = "not-a-date";

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /Browser evidence userId must replace template placeholder values/);
  assert.match(failure, /Browser evidence workspaceId must replace template placeholder values/);
  assert.match(failure, /Browser evidence capturedAt must be a valid timestamp/);
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

test("Gmail browser evidence verifier rejects missing result provenance proof", () => {
  const evidence = validBrowserEvidence();
  const connectedResults = evidence.checks.find((check) => check.name === "brain.gmailConnectedResults") as Record<string, unknown>;
  const semanticResults = evidence.checks.find((check) => check.name === "brain.gmailSemanticResults") as Record<string, unknown>;

  delete connectedResults.keywordSelectedSourceRefsMatched;
  delete semanticResults.semanticSelectedSourceRefsMatched;

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /keyword result refs match the selected Gmail source/);
  assert.match(failure, /semantic result refs match the selected Gmail source/);
});

test("Gmail browser evidence verifier rejects missing post-delete state proof", () => {
  const evidence = validBrowserEvidence();
  const postRevokeDelete = evidence.checks.find((check) => check.name === "brain.gmailPostRevokeDelete") as Record<string, unknown>;

  delete postRevokeDelete.revokedStateVisible;
  delete postRevokeDelete.deletedSourceCountZero;

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /Gmail connection revoked state/);
  assert.match(failure, /Gmail source count is zero after delete/);
});

test("Gmail browser evidence verifier rejects missing Create option evidence proof", () => {
  const evidence = validBrowserEvidence();
  const createEvidence = evidence.checks.find((check) => check.name === "create.gmailEvidenceDrawer") as Record<string, unknown>;

  delete createEvidence.personalOptionVisible;
  delete createEvidence.criticalOptionVisible;
  delete createEvidence.selectedOptionGmailEvidenceVisible;
  delete createEvidence.selectedOptionGmailRefsVisible;

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /Gmail-backed Personal option/);
  assert.match(failure, /Gmail-backed Critical option/);
  assert.match(failure, /selected-option Gmail evidence/);
  assert.match(failure, /selected-option Gmail refs/);
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

test("Gmail browser evidence verifier rejects missing export section proof", () => {
  const evidence = validBrowserEvidence();
  const exported = evidence.checks.find((check) => check.name === "create.gmailExport") as Record<string, unknown>;

  delete exported.selectedOptionHistoryVisible;
  delete exported.personalContextSectionVisible;
  delete exported.sourceMemoryEvidenceSectionVisible;
  delete exported.gmailEvidenceInPersonalContext;
  delete exported.gmailEvidenceInSourceMemorySection;

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /Export evidence must show selected option history/);
  assert.match(failure, /Export evidence must show the personal context section/);
  assert.match(failure, /Export evidence must show the source\/memory evidence section/);
  assert.match(failure, /Export evidence must prove Gmail evidence appears in the personal context section/);
  assert.match(failure, /Export evidence must prove Gmail evidence appears in the source\/memory evidence section/);
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
  await writeFile(join(directory, "screenshots/gmail-pre-oauth.png"), onePixelPng());
  await writeFile(join(directory, "screenshots/gmail-connected-results.png"), onePixelPng());
  await writeFile(join(directory, "screenshots/gmail-create-export-post-delete.png"), onePixelPng());
}

function onePixelPng(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64",
  );
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
    stagingRunId: "gmail-staging-run-2026-05-22",
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
        keywordSelectedSourceRefsMatched: true,
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
        semanticSelectedSourceRefsMatched: true,
        rawNumericScoreHidden: true,
      },
      {
        name: "create.gmailEvidenceDrawer",
        selectorTargetsPresent: true,
        createRunCompleted: true,
        evidenceDrawerOpened: true,
        drawerVisible: true,
        personalOptionVisible: true,
        criticalOptionVisible: true,
        selectedOptionGmailEvidenceVisible: true,
        selectedOptionGmailRefsVisible: true,
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
        selectedOptionHistoryVisible: true,
        personalContextSectionVisible: true,
        sourceMemoryEvidenceSectionVisible: true,
        gmailEvidenceInPersonalContext: true,
        gmailEvidenceInSourceMemorySection: true,
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
        revokedStateVisible: true,
        deletedSourceCountZero: true,
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
