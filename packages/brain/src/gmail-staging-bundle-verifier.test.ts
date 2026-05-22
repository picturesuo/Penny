import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

test("Gmail staging bundle verifier accepts matching readiness, smoke, and destructive evidence", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "penny-gmail-bundle-"));

  try {
    const files = await writeBundleFiles(tmp);
    const output = execFileSync(
      process.execPath,
      [
        "scripts/verify-gmail-staging-bundle.mjs",
        `--readiness=${files.readiness}`,
        `--smoke=${files.smoke}`,
        `--destructive-smoke=${files.destructive}`,
        `--ui-preflight=${files.uiPreflight}`,
        "--readiness-connect-preflight",
        "--smoke-connect-preflight",
        "--require-keyword-filters",
        "--require-destructive",
        "--require-ui-preflight",
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
      keywordFilterCoverageRequired: boolean;
      uiPreflightRequired: boolean;
    };

    assert.equal(payload.ok, true);
    assert.equal(payload.keywordFilterCoverageRequired, true);
    assert.equal(payload.uiPreflightRequired, true);
    assert.equal(payload.readiness.checkCount, 5);
    assert.equal(payload.smoke.stepCount, 11);
    assert.equal(payload.destructive?.stepCount, 12);
    assert.equal(payload.uiPreflight?.checkCount, 5);
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
  overrides: { readiness?: Record<string, unknown>; smoke?: Record<string, unknown>; destructive?: Record<string, unknown>; uiPreflight?: Record<string, unknown> } = {},
): Promise<{ readiness: string; smoke: string; destructive: string; uiPreflight: string }> {
  const readiness = join(directory, "readiness.json");
  const smoke = join(directory, "smoke.json");
  const destructive = join(directory, "destructive.json");
  const uiPreflight = join(directory, "ui-preflight.json");

  await writeFile(readiness, `${JSON.stringify({ ...validReadinessEvidence(), ...overrides.readiness }, null, 2)}\n`, "utf8");
  await writeFile(smoke, `${JSON.stringify({ ...validSmokeEvidence(), ...overrides.smoke }, null, 2)}\n`, "utf8");
  await writeFile(destructive, `${JSON.stringify({ ...validDestructiveEvidence(), ...overrides.destructive }, null, 2)}\n`, "utf8");
  await writeFile(uiPreflight, `${JSON.stringify({ ...validUiPreflightEvidence(), ...overrides.uiPreflight }, null, 2)}\n`, "utf8");

  return { readiness, smoke, destructive, uiPreflight };
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

function scope() {
  return {
    baseUrl: "https://penny-staging.example.test",
    userId: "gmail-smoke-user",
    workspaceId: "gmail-smoke-workspace",
    projectId: "gmail-smoke-project",
    sphereId: "gmail-smoke-sphere",
  };
}
