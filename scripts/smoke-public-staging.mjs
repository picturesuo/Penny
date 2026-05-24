#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const baseUrl = env("PENNY_PUBLIC_SMOKE_BASE_URL", env("BASE_URL", "http://localhost:3000")).replace(/\/+$/, "");
const apiToken = env("PENNY_PUBLIC_SMOKE_API_TOKEN", env("PENNY_API_TOKEN", ""));
const evidenceFile = env("PENNY_PUBLIC_SMOKE_EVIDENCE_FILE", "");
const expectTokenAuth = envFlag("PENNY_PUBLIC_SMOKE_EXPECT_TOKEN_AUTH", true);
const userId = env("PENNY_PUBLIC_SMOKE_USER_ID", "public-smoke-user");
const workspaceId = env("PENNY_PUBLIC_SMOKE_WORKSPACE_ID", "public-smoke-workspace");
const projectId = env("PENNY_PUBLIC_SMOKE_PROJECT_ID", "public-smoke-project");
const sphereId = env("PENNY_PUBLIC_SMOKE_SPHERE_ID", "public-smoke-sphere");
const stagingRunId = env("PENNY_PUBLIC_SMOKE_RUN_ID", "");
const safeRunIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/;
const safeScopeIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const checks = [];

try {
  assert(apiToken, "PENNY_PUBLIC_SMOKE_API_TOKEN or PENNY_API_TOKEN is required.");
  assertSafeIds();

  const frontend = await fetchText("/", { auth: false });
  assert(frontend.status === 200, `GET / returned ${frontend.status}.`);
  const loginGateVisible = /Enter the private access token|private access token/i.test(frontend.text);
  if (expectTokenAuth) {
    assert(loginGateVisible, "Frontend did not show the token-auth login gate.");
  }
  record("frontend.loginGate", {
    status: frontend.status,
    loginGateVisible,
  });

  if (expectTokenAuth) {
    const unauthorized = await fetchJson("/api/brain/documents", { auth: false, allowError: true });
    assert(unauthorized.status === 401, `Unauthenticated API probe returned ${unauthorized.status}, expected 401.`);
    assert(/Bearer/i.test(unauthorized.headers.get("www-authenticate") ?? ""), "Unauthenticated API probe did not request Bearer auth.");
    record("api.unauthorized", {
      status: unauthorized.status,
      bearerChallenge: true,
    });
  }

  const documents = await requestJson("GET", "/api/brain/documents");
  assert(
    documents.data?.sourceOfTruth === "sessions_sources_claims_claim_versions_edges_moves_artifacts",
    "Brain documents route returned an unexpected contract.",
  );
  record("brain.documents", {
    documentCount: numberValue(documents.data?.meta?.documentCount),
  });

  const profile = await requestJson("GET", "/api/brain/memory/profile");
  assert(
    profile.data?.sourceOfTruth === "private_user_memory_sources_chunks_nodes_edges_profile_signals",
    "Brain memory profile returned an unexpected contract.",
  );
  record("brain.memoryProfile", {
    sourceCount: numberValue(profile.data?.stats?.sourceCount),
    memoryNodeCount: numberValue(profile.data?.stats?.memoryNodeCount),
  });

  const recents = await requestJson("GET", "/api/brain/recents");
  assert(Array.isArray(recents.data?.recents), "Brain recents route did not return a recents array.");
  record("brain.recents", {
    recentCount: recents.data.recents.length,
  });

  const created = await requestJson("POST", "/api/create/next", {
    rawIdea:
      "Public staging smoke: verify Penny can generate five Create directions from a context-light readiness idea without claiming live connectors.",
    projectId,
    sessionId: `${stagingRunId || "public-smoke"}-create-session`,
  });
  const createData = created.data;
  const optionLenses = Array.isArray(createData?.optionSet?.options)
    ? createData.optionSet.options.map((option) => option?.lens)
    : [];
  assert.deepEqual(optionLenses, ["Personal", "Practical", "Valuable", "Critical", "Weird"], "Create did not return the five required lenses.");
  assert(createData?.artifact?.id, "Create did not return an artifact id.");
  assertNoUnsupportedConnectorClaims(createData, "Create response");
  record("create.next", {
    optionSetId: stringOrNull(createData?.optionSet?.id),
    artifactId: stringOrNull(createData?.artifact?.id),
    lensCount: optionLenses.length,
    exportReady: Boolean(createData?.exportReady),
    fakeConnectorClaimAbsent: true,
  });

  const exported = await requestJson("POST", "/api/create/export-coding-prompt", {
    artifact: createData.artifact,
    verification: createData.verification,
    judgmentEvent: createData.judgmentEvent,
  });
  const promptExport = exported.data?.export;
  assert(promptExport?.id, "Create export did not return an export id.");
  assert(Array.isArray(promptExport?.targets) && promptExport.targets.includes("Codex"), "Create export did not target Codex.");
  assertNoUnsupportedConnectorClaims(promptExport?.text ?? "", "Create export");
  record("create.export", {
    exportId: stringOrNull(promptExport.id),
    targetCount: promptExport.targets.length,
    promptLength: typeof promptExport.text === "string" ? promptExport.text.length : 0,
    completenessScore: numberValue(promptExport.qualitySignals?.promptCompletenessScore),
    missingCount: Array.isArray(promptExport.qualitySignals?.missing) ? promptExport.qualitySignals.missing.length : 0,
    fakeConnectorClaimAbsent: true,
  });

  const result = {
    ok: true,
    baseUrl,
    ...scopeEvidence(),
    ...runIdEvidence(),
    checkedAt: new Date().toISOString(),
    checks,
  };
  writeEvidence(result);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  const result = {
    ok: false,
    baseUrl,
    ...scopeEvidence(),
    ...runIdEvidence(),
    failedAt: new Date().toISOString(),
    error: sanitizeError(error),
    checks,
  };
  writeEvidence(result);
  console.error(JSON.stringify(result, null, 2));
  process.exitCode = 1;
}

async function requestJson(method, path, body) {
  const response = await fetchJson(path, { method, body, auth: true });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${safePayloadMessage(response.payload)}`);
  }

  assertNoFailedQuery(response.payload, `${method} ${path}`);

  return response.payload;
}

async function fetchJson(path, { method = "GET", body, auth = true, allowError = false } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(auth ? { authorization: `Bearer ${apiToken}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
      "x-user-id": userId,
      "x-workspace-id": workspaceId,
      "x-project-id": projectId,
      "x-sphere-id": sphereId,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await response.text();
  const payload = raw.trim() ? safeJson(raw) : {};

  if (!allowError && response.status >= 400) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${safePayloadMessage(payload)}`);
  }

  return { status: response.status, headers: response.headers, payload };
}

async function fetchText(path, { auth = true } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      ...(auth ? { authorization: `Bearer ${apiToken}` } : {}),
    },
  });

  return {
    status: response.status,
    text: await response.text(),
  };
}

function writeEvidence(result) {
  if (!evidenceFile) {
    return;
  }

  mkdirSync(dirname(evidenceFile), { recursive: true });
  writeFileSync(evidenceFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

function record(name, data) {
  checks.push({
    name,
    at: new Date().toISOString(),
    ...data,
  });
}

function assertSafeIds() {
  for (const [name, value] of [
    ["PENNY_PUBLIC_SMOKE_USER_ID", userId],
    ["PENNY_PUBLIC_SMOKE_WORKSPACE_ID", workspaceId],
    ["PENNY_PUBLIC_SMOKE_PROJECT_ID", projectId],
    ["PENNY_PUBLIC_SMOKE_SPHERE_ID", sphereId],
  ]) {
    assert(isSafeScopeId(value), `${name} must be a safe opaque slug.`);
  }

  if (stagingRunId) {
    assert(safeRunIdPattern.test(stagingRunId.trim()), "PENNY_PUBLIC_SMOKE_RUN_ID must be a safe opaque slug.");
  }
}

function scopeEvidence() {
  return {
    userId,
    workspaceId,
    projectId,
    sphereId,
  };
}

function runIdEvidence() {
  return safeRunIdPattern.test(stagingRunId.trim()) ? { stagingRunId: stagingRunId.trim() } : {};
}

function isSafeScopeId(value) {
  return typeof value === "string" && safeScopeIdPattern.test(value.trim());
}

function assertNoUnsupportedConnectorClaims(value, label) {
  const text = JSON.stringify(value);
  const unsafePatterns = [
    /\blive Gmail connected\b/i,
    /\bGmail OAuth connected\b/i,
    /\breal iMessage\b/i,
    /\blive SMS\b/i,
    /\bSlack connected\b/i,
    /\bGoogle Drive connected\b/i,
    /\bCalendar connected\b/i,
  ];

  for (const pattern of unsafePatterns) {
    assert(!pattern.test(text), `${label} included an unsupported live connector claim.`);
  }
}

function assertNoFailedQuery(payload, label) {
  const message = payload?.error?.message ?? payload?.message ?? "";
  if (/failed query|relation .* does not exist|database|migration/i.test(message)) {
    throw new Error(`${label} needs a valid migrated DATABASE_URL before public staging smoke can pass.`);
  }
}

function safePayloadMessage(payload) {
  return sanitizeText(payload?.error?.message ?? payload?.message ?? "unexpected response");
}

function sanitizeError(error) {
  return sanitizeText(error instanceof Error ? error.message : String(error));
}

function sanitizeText(value) {
  let text = String(value);

  if (apiToken) {
    text = text.replace(new RegExp(escapeRegExp(apiToken), "g"), "<redacted-token>");
  }

  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/https?:\/\/connect\.[^\s"']+/gi, "https://connect.<redacted>")
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgresql://<redacted>")
    .split(/\r?\n/)
    .slice(0, 3)
    .join(" | ")
    .slice(0, 800);
}

function safeJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Response was not JSON: ${sanitizeText(raw)}`);
  }
}

function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringOrNull(value) {
  return typeof value === "string" && value ? value : null;
}

function env(name, fallback = "") {
  return process.env[name]?.trim() || fallback;
}

function envFlag(name, fallback) {
  const value = process.env[name]?.trim().toLowerCase();

  if (!value) {
    return fallback;
  }

  if (["1", "true", "yes", "on"].includes(value)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(value)) {
    return false;
  }

  return fallback;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
