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
    assert.equal(payload.readiness.checkCount, 6);
    assert.equal(payload.smoke.stepCount, 12);
    assert.equal(payload.destructive?.stepCount, 13);
    assert.equal(payload.uiPreflight?.checkCount, 5);
    assert.equal(payload.browserEvidence?.checkCount, 8);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("Gmail staging bundle verifier accepts final staging mode", async () => {
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
        "--final-staging",
        "--min-messages=1",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );
    const payload = JSON.parse(output) as {
      ok: boolean;
      finalStaging: boolean;
      readinessConnectPreflightRequired: boolean;
      keywordFilterCoverageRequired: boolean;
      destructiveRequired: boolean;
      uiPreflightRequired: boolean;
      browserEvidenceRequired: boolean;
      browserArtifactFilesRequired: boolean;
    };

    assert.equal(payload.ok, true);
    assert.equal(payload.finalStaging, true);
    assert.equal(payload.readinessConnectPreflightRequired, true);
    assert.equal(payload.keywordFilterCoverageRequired, true);
    assert.equal(payload.destructiveRequired, true);
    assert.equal(payload.uiPreflightRequired, true);
    assert.equal(payload.browserEvidenceRequired, true);
    assert.equal(payload.browserArtifactFilesRequired, true);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("Gmail staging bundle verifier final staging mode rejects stale evidence windows", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "penny-gmail-bundle-"));

  try {
    const files = await writeBundleFiles(tmp, {
      browserEvidence: {
        capturedAt: "2026-05-24T12:06:00.000Z",
      },
    });
    await writeBrowserArtifacts(tmp);
    const failure = runBundleExpectingFailure([
      `--readiness=${files.readiness}`,
      `--smoke=${files.smoke}`,
      `--destructive-smoke=${files.destructive}`,
      `--ui-preflight=${files.uiPreflight}`,
      `--browser-evidence=${files.browserEvidence}`,
      `--browser-artifact-root=${tmp}`,
      "--final-staging",
      "--min-messages=1",
    ]);

    assert.match(failure, /Final staging evidence timestamps must be within 24 hour/);
    assert.match(failure, /earliest readiness\.checkedAt/);
    assert.match(failure, /latest browser\.capturedAt/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("Gmail staging bundle verifier final staging mode rejects mismatched run ids", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "penny-gmail-bundle-"));

  try {
    const files = await writeBundleFiles(tmp, {
      browserEvidence: {
        stagingRunId: "other-gmail-run",
      },
    });
    await writeBrowserArtifacts(tmp);
    const failure = runBundleExpectingFailure([
      `--readiness=${files.readiness}`,
      `--smoke=${files.smoke}`,
      `--destructive-smoke=${files.destructive}`,
      `--ui-preflight=${files.uiPreflight}`,
      `--browser-evidence=${files.browserEvidence}`,
      `--browser-artifact-root=${tmp}`,
      "--final-staging",
      "--min-messages=1",
    ]);

    assert.match(failure, /browser evidence stagingRunId must match readiness evidence/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("Gmail staging bundle verifier final staging mode rejects unsafe run ids", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "penny-gmail-bundle-"));

  try {
    const files = await writeBundleFiles(tmp, {
      readiness: {
        stagingRunId: "staged-account@example.com",
      },
    });
    await writeBrowserArtifacts(tmp);
    const failure = runBundleExpectingFailure([
      `--readiness=${files.readiness}`,
      `--smoke=${files.smoke}`,
      `--destructive-smoke=${files.destructive}`,
      `--ui-preflight=${files.uiPreflight}`,
      `--browser-evidence=${files.browserEvidence}`,
      `--browser-artifact-root=${tmp}`,
      "--final-staging",
      "--min-messages=1",
    ]);

    assert.match(failure, /readiness evidence stagingRunId must be a safe opaque slug/);
    assert.doesNotMatch(failure, /staged-account@example\.com/);
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

test("Gmail staging bundle verifier final staging mode requires the full bundle", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "penny-gmail-bundle-"));

  try {
    const files = await writeBundleFiles(tmp);
    const failure = runBundleExpectingFailure([
      `--readiness=${files.readiness}`,
      `--smoke=${files.smoke}`,
      "--final-staging",
    ]);

    assert.match(failure, /Usage: node scripts\/verify-gmail-staging-bundle\.mjs/);
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

test("Gmail staging bundle verifier rejects unknown UI preflight check rows", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "penny-gmail-bundle-"));

  try {
    const uiPreflight = validUiPreflightEvidence() as { checks: Array<Record<string, unknown>> };
    const files = await writeBundleFiles(tmp, {
      uiPreflight: {
        checks: [...uiPreflight.checks, { name: "legacy.uiReady", ok: true }],
      },
    });
    const failure = runBundleExpectingFailure([
      `--readiness=${files.readiness}`,
      `--smoke=${files.smoke}`,
      `--ui-preflight=${files.uiPreflight}`,
    ]);

    assert.match(failure, /UI preflight evidence check 6 name must match an allowed UI preflight check/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("Gmail staging bundle verifier rejects duplicate UI preflight check rows", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "penny-gmail-bundle-"));

  try {
    const uiPreflight = validUiPreflightEvidence() as { checks: Array<Record<string, unknown>> };
    const firstCheck = uiPreflight.checks[0];

    assert.ok(firstCheck);

    const files = await writeBundleFiles(tmp, {
      uiPreflight: {
        checks: [...uiPreflight.checks, { ...firstCheck }],
      },
    });
    const failure = runBundleExpectingFailure([
      `--readiness=${files.readiness}`,
      `--smoke=${files.smoke}`,
      `--ui-preflight=${files.uiPreflight}`,
    ]);

    assert.match(failure, /UI preflight evidence must include brain\.documents only once/);
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
  await writeFile(join(screenshots, "gmail-pre-oauth.png"), pngWithDimensions(640, 360));
  await writeFile(join(screenshots, "gmail-connected-results.png"), pngWithDimensions(640, 360));
  await writeFile(join(screenshots, "gmail-create-export-post-delete.png"), pngWithDimensions(640, 360));
}

function pngWithDimensions(width: number, height: number): Buffer {
  const header = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  ]);
  const dimensions = Buffer.alloc(8);

  dimensions.writeUInt32BE(width, 0);
  dimensions.writeUInt32BE(height, 4);

  return Buffer.concat([header, dimensions]);
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
    stagingRunId: "gmail-staging-run-2026-05-22",
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

function validSmokeEvidence(): Record<string, unknown> {
  return {
    ...scope(),
    stagingRunId: "gmail-staging-run-2026-05-22",
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
        selectedAccountStateVisible: true,
        targetConnectionIdPresent: true,
        targetExternalConnectionIdPresent: true,
        targetProviderConfigKeyPresent: true,
        targetAccountAliasPresent: true,
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
        selectedSourceRefCount: 1,
        syncedSourceCount: 1,
        syncedSourceTrainingUseFalse: true,
        syncedSourceRawContentStoredFalse: true,
        syncedSourcePrivateUserMemory: true,
        syncedSourceRetrievalEnabled: true,
        brainProfileGmailSourceCount: 1,
        brainProfileMatchedSelectedSourceRefs: true,
        brainProfileTrainingUseFalse: true,
        brainProfileRawRetentionFalse: true,
        brainProfilePrivateVisibility: true,
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
        resultShapeVerified: true,
        messageRefPresent: true,
        threadRefPresent: true,
        sourceRefPresent: true,
        selectedSourceRefsMatched: true,
        snippetPresent: true,
        rawBodyAbsent: true,
        memoryCountUnchanged: true,
      },
      {
        step: "keywordSearch.syncExplicit",
        query: '"launch partner evidence"',
        stored: true,
        filtersUsed: keywordFilters(),
        maxResultsUsed: 5,
        resultCount: 1,
        resultShapeVerified: true,
        messageRefPresent: true,
        threadRefPresent: true,
        sourceRefPresent: true,
        selectedSourceRefsMatched: true,
        snippetPresent: true,
        rawBodyAbsent: true,
        partialFailureCount: 0,
        duplicateSourceRefsAbsent: true,
      },
      {
        step: "semanticSearch",
        resultCount: 1,
        contextLight: false,
        resultShapeVerified: true,
        subjectPresent: true,
        senderPresent: true,
        dateFieldPresent: true,
        messageRefPresent: true,
        threadRefPresent: true,
        snippetPresent: true,
        sourceRefPresent: true,
        selectedSourceRefsMatched: true,
        memoryRefPresent: true,
        scoreReasonPresent: true,
        groundingLabels: ["grounded"],
        rawScoreHidden: true,
        rawBodyAbsent: true,
        selectedMemoryRefCount: 1,
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
        selectedSemanticMemoryRefsMatched: true,
        selectedSemanticSourceRefsMatched: true,
        rankedCandidateCount: 5,
        nextBestMoveGrounded: true,
        rankedCandidateGmailMemoryEvidencePresent: true,
        rankedCandidateGmailSourceEvidencePresent: true,
        rankedCandidateSelectedSemanticMemoryRefsMatched: true,
        rankedCandidateSelectedSemanticSourceRefsMatched: true,
        personalOptionExpectedEvidencePresent: true,
        criticalOptionExpectedEvidencePresent: true,
        expectedEvidencePresent: true,
      },
      {
        step: "create.refined",
        artifactPresent: true,
        verificationPresent: true,
        judgmentEventPresent: true,
        selectedOptionCount: 2,
        selectedLenses: ["Critical", "Personal"],
        selectedOptionsMatched: true,
        gmailMemoryEvidencePresent: true,
        gmailSourceEvidencePresent: true,
        selectedSemanticMemoryRefsMatched: true,
        selectedSemanticSourceRefsMatched: true,
        expectedEvidencePresent: true,
        artifactExpectedEvidencePresent: true,
        rawEmailBodyAbsent: true,
        secretOrConnectTokenAbsent: true,
        unsupportedHumanReviewClaimAbsent: true,
      },
      {
        step: "create.export",
        expectedEvidencePresent: true,
        selectedOptionHistoryPresent: true,
        personalContextSectionPresent: true,
        sourceMemoryEvidenceSectionPresent: true,
        personalContextExpectedEvidencePresent: true,
        sourceMemoryEvidenceExpectedEvidencePresent: true,
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
      createAfterDeleteRankedCandidateCount: 5,
      createRankedCandidateDeletedSourceAbsent: true,
      createRankedCandidateDeletedMemoryAbsent: true,
      trackedDeletedMemoryIdCount: 1,
    },
  );

  return evidence;
}

function validUiPreflightEvidence(): Record<string, unknown> {
  return {
    ok: true,
    ...scope(),
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

function validBrowserEvidence(): Record<string, unknown> {
  return {
    ok: true,
    ...scope(),
    stagingRunId: "gmail-staging-run-2026-05-22",
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
