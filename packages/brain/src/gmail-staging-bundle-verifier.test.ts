import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

test("Gmail staging bundle verifier accepts matching readiness, smoke, and destructive evidence", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "penny-gmail-bundle-"));

  try {
    const files = await writeBundleFiles(tmp);
    await writeBrowserArtifacts(tmp);
    const output = execFileSync(
      process.execPath,
      [
        "scripts/verify-gmail-staging-bundle.mjs",
        `--readiness=${files.readiness}`,
        `--smoke=${files.smoke}`,
        `--destructive-smoke=${files.destructive}`,
        `--ui-preflight=${files.uiPreflight}`,
        `--browser-evidence=${files.browserEvidence}`,
        `--browser-artifact-root=${tmp}`,
        "--readiness-connect-preflight",
        "--smoke-connect-preflight",
        "--require-keyword-filters",
        "--require-destructive",
        "--require-ui-preflight",
        "--require-browser-evidence",
        "--require-browser-artifact-files",
        "--min-messages=1",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );
    const payload = JSON.parse(output) as {
      ok: boolean;
      readiness: { checkCount: number };
      smoke: { stepCount: number };
      destructive: { stepCount: number } | null;
      uiPreflight: { checkCount: number } | null;
      browserEvidence: { checkCount: number } | null;
      keywordFilterCoverageRequired: boolean;
      uiPreflightRequired: boolean;
      browserEvidenceRequired: boolean;
      browserArtifactFilesRequired: boolean;
    };

    assert.equal(payload.ok, true);
    assert.equal(payload.keywordFilterCoverageRequired, true);
    assert.equal(payload.uiPreflightRequired, true);
    assert.equal(payload.browserEvidenceRequired, true);
    assert.equal(payload.browserArtifactFilesRequired, true);
    assert.equal(payload.readiness.checkCount, 5);
    assert.equal(payload.smoke.stepCount, 11);
    assert.equal(payload.destructive?.stepCount, 12);
    assert.equal(payload.uiPreflight?.checkCount, 5);
    assert.equal(payload.browserEvidence?.checkCount, 8);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("Gmail staging bundle verifier rejects mismatched scope evidence", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "penny-gmail-bundle-"));

  try {
    const files = await writeBundleFiles(tmp, {
      smoke: {
        workspaceId: "other-workspace",
      },
    });
    const failure = runBundleExpectingFailure([
      `--readiness=${files.readiness}`,
      `--smoke=${files.smoke}`,
      "--readiness-connect-preflight",
      "--smoke-connect-preflight",
    ]);

    assert.match(failure, /smoke evidence workspaceId must match readiness evidence/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("Gmail staging bundle verifier requires UI preflight evidence when requested", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "penny-gmail-bundle-"));

  try {
    const files = await writeBundleFiles(tmp);
    const failure = runBundleExpectingFailure([
      `--readiness=${files.readiness}`,
      `--smoke=${files.smoke}`,
      "--require-ui-preflight",
    ]);

    assert.match(failure, /Usage: node scripts\/verify-gmail-staging-bundle\.mjs/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("Gmail staging bundle verifier rejects mismatched UI preflight scope", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "penny-gmail-bundle-"));

  try {
    const files = await writeBundleFiles(tmp, {
      uiPreflight: {
        projectId: "other-project",
      },
    });
    const failure = runBundleExpectingFailure([
      `--readiness=${files.readiness}`,
      `--smoke=${files.smoke}`,
      `--ui-preflight=${files.uiPreflight}`,
    ]);

    assert.match(failure, /UI preflight evidence projectId must match readiness evidence/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("Gmail staging bundle verifier requires browser evidence when requested", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "penny-gmail-bundle-"));

  try {
    const files = await writeBundleFiles(tmp);
    const failure = runBundleExpectingFailure([
      `--readiness=${files.readiness}`,
      `--smoke=${files.smoke}`,
      "--require-browser-evidence",
    ]);

    assert.match(failure, /Usage: node scripts\/verify-gmail-staging-bundle\.mjs/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("Gmail staging bundle verifier requires browser artifact root when requested", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "penny-gmail-bundle-"));

  try {
    const files = await writeBundleFiles(tmp);
    const failure = runBundleExpectingFailure([
      `--readiness=${files.readiness}`,
      `--smoke=${files.smoke}`,
      `--browser-evidence=${files.browserEvidence}`,
      "--require-browser-artifact-files",
    ]);

    assert.match(failure, /Usage: node scripts\/verify-gmail-staging-bundle\.mjs/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("Gmail staging bundle verifier requires browser evidence when artifact files are requested", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "penny-gmail-bundle-"));

  try {
    const files = await writeBundleFiles(tmp);
    const failure = runBundleExpectingFailure([
      `--readiness=${files.readiness}`,
      `--smoke=${files.smoke}`,
      `--browser-artifact-root=${tmp}`,
      "--require-browser-artifact-files",
    ]);

    assert.match(failure, /Usage: node scripts\/verify-gmail-staging-bundle\.mjs/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("Gmail staging bundle verifier rejects mismatched browser evidence scope", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "penny-gmail-bundle-"));

  try {
    const files = await writeBundleFiles(tmp, {
      browserEvidence: {
        userId: "other-user",
      },
    });
    const failure = runBundleExpectingFailure([
      `--readiness=${files.readiness}`,
      `--smoke=${files.smoke}`,
      `--browser-evidence=${files.browserEvidence}`,
    ]);

    assert.match(failure, /browser evidence userId must match readiness evidence/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("Gmail staging bundle verifier requires destructive evidence when requested", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "penny-gmail-bundle-"));

  try {
    const files = await writeBundleFiles(tmp);
    const failure = runBundleExpectingFailure([
      `--readiness=${files.readiness}`,
      `--smoke=${files.smoke}`,
      "--require-destructive",
    ]);

    assert.match(failure, /Usage: node scripts\/verify-gmail-staging-bundle\.mjs/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

async function writeBundleFiles(
  directory: string,
  overrides: {
    readiness?: Record<string, unknown>;
    smoke?: Record<string, unknown>;
    destructive?: Record<string, unknown>;
    uiPreflight?: Record<string, unknown>;
    browserEvidence?: Record<string, unknown>;
  } = {},
): Promise<{ readiness: string; smoke: string; destructive: string; uiPreflight: string; browserEvidence: string }> {
  const readiness = join(directory, "readiness.json");
  const smoke = join(directory, "smoke.json");
  const destructive = join(directory, "destructive.json");
  const uiPreflight = join(directory, "ui-preflight.json");
  const browserEvidence = join(directory, "browser-evidence.json");

  await writeFile(readiness, `${JSON.stringify({ ...validReadinessEvidence(), ...overrides.readiness }, null, 2)}\n`, "utf8");
  await writeFile(smoke, `${JSON.stringify({ ...validSmokeEvidence(), ...overrides.smoke }, null, 2)}\n`, "utf8");
  await writeFile(destructive, `${JSON.stringify({ ...validDestructiveEvidence(), ...overrides.destructive }, null, 2)}\n`, "utf8");
  await writeFile(uiPreflight, `${JSON.stringify({ ...validUiPreflightEvidence(), ...overrides.uiPreflight }, null, 2)}\n`, "utf8");
  await writeFile(browserEvidence, `${JSON.stringify({ ...validBrowserEvidence(), ...overrides.browserEvidence }, null, 2)}\n`, "utf8");

  return { readiness, smoke, destructive, uiPreflight, browserEvidence };
}

async function writeBrowserArtifacts(directory: string): Promise<void> {
  const screenshots = join(directory, "screenshots");

  await mkdir(screenshots, { recursive: true });
  await writeFile(join(screenshots, "gmail-pre-oauth.png"), "safe screenshot placeholder\n", "utf8");
  await writeFile(join(screenshots, "gmail-connected-results.png"), "safe screenshot placeholder\n", "utf8");
  await writeFile(join(screenshots, "gmail-create-export-post-delete.png"), "safe screenshot placeholder\n", "utf8");
}

function runBundleExpectingFailure(args: string[]): string {
  try {
    execFileSync(process.execPath, ["scripts/verify-gmail-staging-bundle.mjs", ...args], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (caught) {
    const error = caught as { status?: number; stderr?: Buffer | string };

    assert.equal(error.status, 1);

    return String(error.stderr);
  }

  assert.fail("Expected bundle verifier to reject evidence.");
}

function validReadinessEvidence(): Record<string, unknown> {
  return {
    ok: true,
    ...scope(),
    requireStaging: true,
    connectPreflight: true,
    checkedAt: "2026-05-22T12:00:00.000Z",
    checks: [
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

function validSmokeEvidence(): Record<string, unknown> {
  return {
    ...scope(),
    connectPreflightEnabled: true,
    connectPreflightOnly: false,
    destructiveRevokeEnabled: false,
    destructiveDeleteEnabled: false,
    startedAt: "2026-05-22T12:00:00.000Z",
    completedAt: "2026-05-22T12:05:00.000Z",
    steps: [
      {
        step: "connect.preflight",
        providerConfigKey: "google-gmail-staging",
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
        cursorPresent: true,
        historyIdPresent: false,
        statusMessageCountUnchanged: true,
        selectedSourceCountUnchanged: true,
        duplicateSourceRefsAbsent: true,
      },
      {
        step: "keywordSearch",
        query: '"launch partner evidence"',
        stored: false,
        filtersUsed: keywordFilters(),
        maxResultsUsed: 5,
        resultCount: 1,
        memoryCountUnchanged: true,
      },
      {
        step: "keywordSearch.syncExplicit",
        query: '"launch partner evidence"',
        stored: true,
        filtersUsed: keywordFilters(),
        maxResultsUsed: 5,
        resultCount: 1,
        partialFailureCount: 0,
        duplicateSourceRefsAbsent: true,
      },
      {
        step: "semanticSearch",
        resultCount: 1,
        contextLight: false,
        resultShapeVerified: true,
        sourceRefPresent: true,
        memoryRefPresent: true,
        scoreReasonPresent: true,
        groundingLabels: ["grounded"],
        rawScoreHidden: true,
        deleteTargetMatchedSemanticResult: true,
        deleteTargetMemoryIdCount: 1,
      },
      {
        step: "create.first",
        memoryCountUsed: 1,
        sourceCountUsed: 1,
        selectedOptionCount: 2,
        selectedLenses: ["Critical", "Personal"],
        personalOptionPresent: true,
        criticalOptionPresent: true,
        gmailMemoryEvidencePresent: true,
        gmailSourceEvidencePresent: true,
        personalOptionExpectedEvidencePresent: true,
        criticalOptionExpectedEvidencePresent: true,
        expectedEvidencePresent: true,
      },
      {
        step: "create.export",
        expectedEvidencePresent: true,
        unsafePrivacyClaimAbsent: true,
        rawEmailBodyAbsent: true,
        secretOrConnectTokenAbsent: true,
        unsupportedHumanReviewClaimAbsent: true,
      },
      {
        step: "revoke.delete.skipped",
        reason: "non destructive",
      },
    ],
  };
}

function keywordFilters() {
  return {
    from: "alice@example.com",
    to: "bob@example.com",
    subject: "Launch plan",
    label: "inbox",
    after: "2026-05-01",
    before: "2026-05-22",
    hasAttachment: true,
  };
}

function validDestructiveEvidence(): Record<string, unknown> {
  const evidence = validSmokeEvidence() as Record<string, unknown> & { steps: Array<Record<string, unknown>> };

  evidence.destructiveRevokeEnabled = true;
  evidence.destructiveDeleteEnabled = true;
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
      sourceIdPresent: true,
      brainSourceIdPresent: true,
      brainSourceDeleted: true,
      brainProfileSourceAbsent: true,
      brainRetrieveDeletedSourceAbsent: true,
      semanticDeletedSourceAbsent: true,
      createDeletedSourceAbsent: true,
      createDeletedMemoryAbsent: true,
      trackedDeletedMemoryIdCount: 1,
    },
  );

  return evidence;
}

function validUiPreflightEvidence(): Record<string, unknown> {
  return {
    ok: true,
    ...scope(),
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

function validBrowserEvidence(): Record<string, unknown> {
  return {
    ok: true,
    ...scope(),
    capturedAt: "2026-05-22T12:06:00.000Z",
    mode: "manual",
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
