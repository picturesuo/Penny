#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const baseUrl = env("BASE_URL", "http://localhost:3011").replace(/\/+$/, "");
const apiToken = env("GMAIL_UI_PREFLIGHT_API_TOKEN", env("PENNY_API_TOKEN", ""));
const evidenceFile = env("GMAIL_UI_PREFLIGHT_EVIDENCE_FILE", "");
const userId = env("GMAIL_UI_PREFLIGHT_USER_ID", env("PENNY_AUTH_USER_ID", env("PENNY_USER_ID", "gmail-ui-preflight-user")));
const workspaceId = env(
  "GMAIL_UI_PREFLIGHT_WORKSPACE_ID",
  env("PENNY_AUTH_WORKSPACE_ID", env("PENNY_WORKSPACE_ID", "gmail-ui-preflight-workspace")),
);
const projectId = env(
  "GMAIL_UI_PREFLIGHT_PROJECT_ID",
  env("PENNY_AUTH_PROJECT_ID", env("PENNY_PROJECT_ID", "gmail-ui-preflight-project")),
);
const sphereId = env(
  "GMAIL_UI_PREFLIGHT_SPHERE_ID",
  env("PENNY_AUTH_SPHERE_ID", env("PENNY_SPHERE_ID", "gmail-ui-preflight-sphere")),
);
const stagingRunId = env("GMAIL_STAGING_RUN_ID", env("GMAIL_UI_PREFLIGHT_STAGING_RUN_ID", ""));
const gmailReadonlyScope = "https://www.googleapis.com/auth/gmail.readonly";
const safeStagingRunIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/;
const safeEvidenceScopeIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const checks = [];

try {
  assertSafeStagingRunId();
  assertSafeEvidenceScopeIds();
  const documents = await request("GET", "/api/brain/documents");
  assert(documents.data?.sourceOfTruth === "sessions_sources_claims_claim_versions_edges_moves_artifacts", "Brain documents route returned an unexpected contract.");
  record("brain.documents", {
    documentCount: numberValue(documents.data?.meta?.documentCount),
  });

  const profile = await request("GET", "/api/brain/memory/profile");
  assert(profile.data?.sourceOfTruth === "private_user_memory_sources_chunks_nodes_edges_profile_signals", "Brain memory profile returned an unexpected contract.");
  record("brain.memoryProfile", {
    sourceCount: numberValue(profile.data?.stats?.sourceCount),
    memoryNodeCount: numberValue(profile.data?.stats?.memoryNodeCount),
  });

  const recents = await request("GET", "/api/brain/recents");
  assert(Array.isArray(recents.data?.recents), "Brain recents route did not return recents.");
  record("brain.recents", {
    recentCount: recents.data.recents.length,
  });

  const provider = await request("GET", "/api/connectors/google");
  const providerView = provider.data?.provider ?? provider.data;
  const providerState = provider.data?.state ? provider.data : providerView;
  assert(providerView?.configured === true, "Google connector provider is not configured.");
  assert(Array.isArray(providerView?.surfaces), "Google provider did not return surfaces.");
  const gmailSurface = providerView.surfaces.find((surface) => surface?.id === "google_gmail");
  assert(gmailSurface, "Google provider did not expose the Gmail surface.");
  assert(
    Array.isArray(gmailSurface?.scopes) &&
      gmailSurface.scopes.some((scope) => scope?.scope === gmailReadonlyScope && scope?.gated === true),
    "Google provider Gmail surface did not expose gated gmail.readonly scope.",
  );
  assertConnectorStatePrivacy(providerState, "Google provider");
  record("google.provider", {
    configured: providerView.configured,
    surfaceCount: providerView.surfaces.length,
    gmailStatus: gmailSurface?.status ?? null,
    providerStatePrivacySafe: true,
  });

  const gmail = await request("GET", "/api/connectors/google/gmail/status");
  assert(gmail.data?.configured === true, "Gmail connector is not configured.");
  assertGmailReadonlyOnly(gmail.data?.scopes, "Gmail status");
  assert(gmail.data?.restrictedScope === true, "Gmail status did not report restrictedScope=true.");
  assert(gmail.data?.gated === true, "Gmail status did not report gated=true.");
  assert(gmail.data?.private === true, "Gmail status did not report private=true.");
  assert(gmail.data?.privacy?.trainingUse === false, "Gmail privacy did not report trainingUse=false.");
  assert(gmail.data?.privacy?.rawRetentionDefault === false, "Gmail privacy did not report rawRetentionDefault=false.");
  assert(gmail.data?.privacy?.noHumanReview === true, "Gmail privacy did not report noHumanReview=true.");
  assertConnectorStatePrivacy(gmail.data, "Gmail status");
  record("gmail.status", {
    status: gmail.data.status,
    connectionCount: Array.isArray(gmail.data.connections) ? gmail.data.connections.length : 0,
    sourceCount: Array.isArray(gmail.data.sources) ? gmail.data.sources.length : 0,
    messageCount: numberValue(gmail.data.messageCount),
    restrictedScope: gmail.data.restrictedScope,
    gated: gmail.data.gated,
    private: gmail.data.private,
    statusStatePrivacySafe: true,
  });

  const result = {
    ok: true,
    baseUrl,
    ...safeScopeEvidence(),
    ...stagingRunIdEvidence(),
    checkedAt: new Date().toISOString(),
    checks,
  };
  writeEvidence(result);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  const result = {
    ok: false,
    baseUrl,
    ...safeScopeEvidence(),
    ...stagingRunIdEvidence(),
    failedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
    checks,
  };
  writeEvidence(result);
  console.error(JSON.stringify(result, null, 2));
  process.exitCode = 1;
}

function writeEvidence(result) {
  if (!evidenceFile) {
    return;
  }

  mkdirSync(dirname(evidenceFile), { recursive: true });
  writeFileSync(evidenceFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

function assertSafeStagingRunId() {
  if (!stagingRunId) {
    return;
  }

  assert(isSafeStagingRunId(stagingRunId), "GMAIL_STAGING_RUN_ID must be a safe opaque slug for Gmail UI preflight.");
}

function stagingRunIdEvidence() {
  return isSafeStagingRunId(stagingRunId) ? { stagingRunId: stagingRunId.trim() } : {};
}

function isSafeStagingRunId(value) {
  return typeof value === "string" && safeStagingRunIdPattern.test(value.trim());
}

function assertSafeEvidenceScopeIds() {
  for (const [field, name, value] of scopeIdEntries()) {
    assert(isSafeEvidenceScopeId(value), `${name} must be a safe opaque slug for Gmail UI preflight.`);
  }
}

function safeScopeEvidence() {
  return Object.fromEntries(
    scopeIdEntries()
      .filter(([, , value]) => isSafeEvidenceScopeId(value))
      .map(([field, , value]) => [field, value.trim()]),
  );
}

function scopeIdEntries() {
  return [
    ["userId", "GMAIL_UI_PREFLIGHT_USER_ID", userId],
    ["workspaceId", "GMAIL_UI_PREFLIGHT_WORKSPACE_ID", workspaceId],
    ["projectId", "GMAIL_UI_PREFLIGHT_PROJECT_ID", projectId],
    ["sphereId", "GMAIL_UI_PREFLIGHT_SPHERE_ID", sphereId],
  ];
}

function isSafeEvidenceScopeId(value) {
  return typeof value === "string" && safeEvidenceScopeIdPattern.test(value.trim());
}

async function request(method, path) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: headers(),
  });
  const raw = await response.text();
  const payload = raw.trim() ? safeJson(raw) : {};

  if (response.status < 200 || response.status >= 300) {
    const message = payload.error?.message ?? payload.message ?? `HTTP ${response.status}`;
    const hint = failedQueryHint(message);

    throw new Error(`${method} ${path} failed with ${response.status}: ${hint ?? message}`);
  }

  assertNoFailedQuery(payload, `${method} ${path}`);

  return payload;
}

function headers() {
  return {
    ...(apiToken ? { authorization: `Bearer ${apiToken}` } : {}),
    "x-user-id": userId,
    "x-workspace-id": workspaceId,
    "x-project-id": projectId,
    "x-sphere-id": sphereId,
  };
}

function record(name, data) {
  checks.push({
    name,
    at: new Date().toISOString(),
    ...data,
  });
}

function assertConnectorStatePrivacy(data, label) {
  const state = data?.state;

  assertNoUnsafeSourceFields(data?.sources, `${label}.sources`);
  assertNoUnsafeSourceFields(state?.sources, `${label}.state.sources`);
  assertNoUnsafeConnectionFields(data?.connections, `${label}.connections`);
  assertNoUnsafeConnectionFields(state?.connections, `${label}.state.connections`);
  assertNoUnsafeSyncJobFields(state?.syncJobs, `${label}.state.syncJobs`);

  for (const field of ["cursors", "audits"]) {
    assert(!(state && field in state), `${label}.state exposed ${field}.`);
  }
}

function assertNoUnsafeSourceFields(sources, label) {
  if (!Array.isArray(sources)) {
    return;
  }

  for (const source of sources) {
    for (const field of ["metadata", "provenance", "sourceRef", "scope", "trainingUse", "rawContentStored", "rawRetention", "brainNodeIds"]) {
      assert(!(field in source), `${label} exposed ${field}.`);
    }
    for (const field of ["trainingUse", "rawContentStored", "productionLogSafe", "visibility"]) {
      assert(!(field in (source.privacy ?? {})), `${label}.privacy exposed ${field}.`);
    }
    assert(hasNoRawEmailFields(source), `${label} exposed a raw email field.`);
  }
}

function assertNoUnsafeConnectionFields(connections, label) {
  if (!Array.isArray(connections)) {
    return;
  }

  for (const connection of connections) {
    const credential = connection?.credential ?? {};

    for (const field of ["credentialRef", "accessToken", "refreshToken", "token", "encryptedToken", "encryptedRefreshToken"]) {
      assert(!(field in credential), `${label}.credential exposed ${field}.`);
    }
  }
}

function assertNoUnsafeSyncJobFields(syncJobs, label) {
  if (!Array.isArray(syncJobs)) {
    return;
  }

  for (const job of syncJobs) {
    for (const field of ["cursorBefore", "cursorAfter", "sourceCounts", "error", "scope"]) {
      assert(!(field in job), `${label} exposed ${field}.`);
    }
  }
}

function assertGmailReadonlyOnly(scopes, label) {
  assert(Array.isArray(scopes), `${label} did not report Gmail scopes.`);
  assert(scopes.length === 1 && scopes[0] === gmailReadonlyScope, `${label} did not report exactly gmail.readonly.`);
}

function hasNoRawEmailFields(value) {
  return !["body", "plainTextBody", "raw", "rawBody", "html", "payload", "score"].some((field) => field in (value ?? {}));
}

function assertNoFailedQuery(payload, label) {
  const serialized = JSON.stringify(payload);
  const hint = failedQueryHint(serialized);

  assert(!hint, `${label} returned a database readiness failure: ${hint}`);
}

function failedQueryHint(value) {
  if (!/DATABASE_URL is required|Failed query:|relation .* does not exist|does not exist/i.test(String(value))) {
    return null;
  }

  return "local UI preflight needs a valid migrated DATABASE_URL before opening the browser.";
}

function safeJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return { nonJson: true, rawLength: raw.length };
  }
}

function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function env(name, fallback) {
  const value = process.env[name];

  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
