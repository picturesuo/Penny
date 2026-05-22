#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const envFile = process.env.GMAIL_READINESS_ENV_FILE?.trim() ?? "";
let envFileLoadError = "";

if (envFile) {
  try {
    loadEnvFile(envFile);
  } catch (error) {
    envFileLoadError = error instanceof Error ? error.message : String(error);
  }
}

const baseUrl = env("BASE_URL", "http://localhost:3000").replace(/\/+$/, "");
const gmailReadonlyScope = "https://www.googleapis.com/auth/gmail.readonly";
const requireStaging = envFlag("GMAIL_READINESS_REQUIRE_STAGING");
const connectPreflight = envFlag("GMAIL_READINESS_CONNECT_PREFLIGHT");
const apiToken = env("GMAIL_READINESS_API_TOKEN", env("PENNY_API_TOKEN", ""));
const userId = env("GMAIL_READINESS_USER_ID", env("PENNY_AUTH_USER_ID", env("PENNY_USER_ID", "gmail-readiness-user")));
const workspaceId = env(
  "GMAIL_READINESS_WORKSPACE_ID",
  env("PENNY_AUTH_WORKSPACE_ID", env("PENNY_WORKSPACE_ID", "gmail-readiness-workspace")),
);
const projectId = env(
  "GMAIL_READINESS_PROJECT_ID",
  env("PENNY_AUTH_PROJECT_ID", env("PENNY_PROJECT_ID", "gmail-readiness-project")),
);
const sphereId = env(
  "GMAIL_READINESS_SPHERE_ID",
  env("PENNY_AUTH_SPHERE_ID", env("PENNY_SPHERE_ID", "gmail-readiness-sphere")),
);
const stagingRunId = env("GMAIL_STAGING_RUN_ID", env("GMAIL_READINESS_STAGING_RUN_ID", ""));
const evidenceFile = env("GMAIL_READINESS_EVIDENCE_FILE", "");
const safeStagingRunIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/;
const safeEvidenceScopeIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const checks = [];

try {
  assertSafeStagingRunId();
  assertSafeEvidenceScopeIds();
  recordRequiredEnvPresence();
  assert(!envFileLoadError, envFileLoadError);

  const nangoGmailIntegrationId = checkBaseEnv();

  if (requireStaging) {
    checkStrictStagingEnv();
  }

  const provider = await request("GET", "/api/connectors/google");
  assert(provider.data?.configured === true, "Google connector provider is not configured.");
  assert(Array.isArray(provider.data?.surfaces), "Google provider did not return surfaces.");
  const gmailSurface = provider.data.surfaces.find((surface) => surface?.id === "google_gmail");
  assert(gmailSurface, "Google provider did not expose the Gmail surface.");
  assert(
    Array.isArray(gmailSurface?.scopes) &&
      gmailSurface.scopes.some((scope) => scope?.scope === gmailReadonlyScope && scope?.gated === true),
    "Google provider Gmail surface did not expose gated gmail.readonly scope.",
  );
  assertConnectorStatePrivacy(provider.data, "Google provider");
  record("api.googleProvider", {
    configured: provider.data.configured,
    surfaceCount: provider.data.surfaces.length,
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
  assertConnectionIntegrationMatches(gmail.data?.connections, nangoGmailIntegrationId, "Gmail status.connections");
  assertConnectorStatePrivacy(gmail.data, "Gmail status");
  record("api.gmailStatus", {
    status: gmail.data.status,
    connectionCount: Array.isArray(gmail.data.connections) ? gmail.data.connections.length : 0,
    sourceCount: Array.isArray(gmail.data.sources) ? gmail.data.sources.length : 0,
    messageCount: numberValue(gmail.data.messageCount),
    restrictedScope: gmail.data.restrictedScope,
    gated: gmail.data.gated,
    private: gmail.data.private,
    statusStatePrivacySafe: true,
  });

  if (connectPreflight) {
    const connect = await request("POST", "/api/connectors/google/gmail/connect", {});
    assertConnectPreflight(connect.data, nangoGmailIntegrationId);
    record("api.connectPreflight", {
      providerConfigKey: connect.data.providerConfigKey,
      connectLinkPresent: typeof connect.data.connectLink === "string" && connect.data.connectLink.length > 0,
      connectLinkHost: safeUrlHost(connect.data.connectLink),
      tokenPresent: typeof connect.data.token === "string" && connect.data.token.length > 0,
      expiresAtPresent: typeof connect.data.expiresAt === "string" && connect.data.expiresAt.length > 0,
      requestableSurfaceIds: connect.data.requestableSurfaceIds,
      requestableScopeUrls: connect.data.requestableScopeUrls,
      restrictedScope: connect.data.restrictedScope,
      gated: connect.data.gated,
      private: connect.data.private,
    });
  }

  const payload = {
    ok: true,
    baseUrl,
    ...safeScopeEvidence(),
    ...stagingRunIdEvidence(),
    requireStaging,
    connectPreflight,
    checkedAt: new Date().toISOString(),
    checks,
  };

  writeEvidence(payload);
  console.log(JSON.stringify(payload, null, 2));
} catch (error) {
  const payload = {
    ok: false,
    baseUrl,
    ...safeScopeEvidence(),
    ...stagingRunIdEvidence(),
    requireStaging,
    connectPreflight,
    failedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
    checks,
  };

  writeEvidence(payload);
  console.error(JSON.stringify(payload, null, 2));
  process.exitCode = 1;
}

function checkBaseEnv() {
  assertEnvFlag("ENABLE_GOOGLE_CONNECTOR");
  assertEnvFlag("ENABLE_GMAIL_CONNECTOR");
  assertEnvFlag("ENABLE_RESTRICTED_GOOGLE_SCOPES");
  const nangoSecretPresent = Boolean(requiredEnv("NANGO_SECRET_KEY"));
  const nangoPublicPresent = Boolean(requiredEnv("NANGO_PUBLIC_KEY"));
  const nangoBaseUrl = requiredEnv("NANGO_BASE_URL");
  const nangoGmailIntegrationId = requiredEnv("NANGO_GMAIL_INTEGRATION_ID");
  const nangoBase = parsedUrl(nangoBaseUrl, "NANGO_BASE_URL");

  assert(nangoBase.protocol === "https:", "NANGO_BASE_URL must use https for Gmail staging readiness.");

  assert(!envFlag("PENNY_SKIP_DATABASE_PREP"), "PENNY_SKIP_DATABASE_PREP must not be true for Gmail staging readiness.");

  record("env.gmail", {
    envFileLoaded: Boolean(envFile),
    enableGoogleConnector: true,
    enableGmailConnector: true,
    enableRestrictedGoogleScopes: true,
    nangoSecretPresent,
    nangoPublicPresent,
    nangoBaseHost: nangoBase.host,
    nangoGmailIntegrationId,
    databasePrepBypass: false,
  });

  return nangoGmailIntegrationId;
}

function assertSafeStagingRunId() {
  if (!stagingRunId) {
    return;
  }

  assert(isSafeStagingRunId(stagingRunId), "GMAIL_STAGING_RUN_ID must be a safe opaque slug for Gmail staging readiness.");
}

function stagingRunIdEvidence() {
  return isSafeStagingRunId(stagingRunId) ? { stagingRunId: stagingRunId.trim() } : {};
}

function isSafeStagingRunId(value) {
  return typeof value === "string" && safeStagingRunIdPattern.test(value.trim());
}

function assertSafeEvidenceScopeIds() {
  for (const [field, name, value] of scopeIdEntries()) {
    assert(isSafeEvidenceScopeId(value), `${name} must be a safe opaque slug for Gmail staging readiness.`);
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
    ["userId", "GMAIL_READINESS_USER_ID", userId],
    ["workspaceId", "GMAIL_READINESS_WORKSPACE_ID", workspaceId],
    ["projectId", "GMAIL_READINESS_PROJECT_ID", projectId],
    ["sphereId", "GMAIL_READINESS_SPHERE_ID", sphereId],
  ];
}

function isSafeEvidenceScopeId(value) {
  return typeof value === "string" && safeEvidenceScopeIdPattern.test(value.trim());
}

function recordRequiredEnvPresence() {
  const presence = {
    envFileConfigured: Boolean(envFile),
    envFileLoaded: Boolean(envFile && !envFileLoadError),
    envFileLoadErrorPresent: Boolean(envFileLoadError),
    requireStaging,
    connectPreflight,
    enableGoogleConnector: envFlag("ENABLE_GOOGLE_CONNECTOR"),
    enableGmailConnector: envFlag("ENABLE_GMAIL_CONNECTOR"),
    enableRestrictedGoogleScopes: envFlag("ENABLE_RESTRICTED_GOOGLE_SCOPES"),
    nangoSecretPresent: hasEnv("NANGO_SECRET_KEY"),
    nangoPublicPresent: hasEnv("NANGO_PUBLIC_KEY"),
    nangoBaseUrlPresent: hasEnv("NANGO_BASE_URL"),
    nangoGmailIntegrationIdPresent: hasEnv("NANGO_GMAIL_INTEGRATION_ID"),
    databaseUrlPresent: hasEnv("DATABASE_URL"),
    pennyAuthModePresent: hasEnv("PENNY_AUTH_MODE"),
    apiTokenPresent: hasEnv("PENNY_API_TOKEN"),
    sessionSecretPresent: hasEnv("PENNY_SESSION_SECRET"),
    corsOriginsPresent: hasEnv("PENNY_CORS_ORIGINS"),
    rateLimitPresent: hasEnv("PENNY_RATE_LIMIT_MAX"),
    trustAuthHeadersPresent: hasEnv("PENNY_TRUST_AUTH_HEADERS"),
    databasePrepBypass: envFlag("PENNY_SKIP_DATABASE_PREP"),
  };

  record("env.requiredPresence", {
    ...presence,
    missingRequirementKeys: missingRequirementKeys(presence),
  });
}

function missingRequirementKeys(presence) {
  const requirements = [
    ["enableGoogleConnector", "ENABLE_GOOGLE_CONNECTOR", true],
    ["enableGmailConnector", "ENABLE_GMAIL_CONNECTOR", true],
    ["enableRestrictedGoogleScopes", "ENABLE_RESTRICTED_GOOGLE_SCOPES", true],
    ["nangoSecretPresent", "NANGO_SECRET_KEY", true],
    ["nangoPublicPresent", "NANGO_PUBLIC_KEY", true],
    ["nangoBaseUrlPresent", "NANGO_BASE_URL", true],
    ["nangoGmailIntegrationIdPresent", "NANGO_GMAIL_INTEGRATION_ID", true],
    ["databasePrepBypass", "PENNY_SKIP_DATABASE_PREP_FALSE", false],
  ];

  if (presence.envFileLoadErrorPresent) {
    requirements.unshift(["envFileLoaded", "GMAIL_READINESS_ENV_FILE", true]);
  }

  if (presence.requireStaging) {
    requirements.push(
      ["databaseUrlPresent", "DATABASE_URL", true],
      ["pennyAuthModePresent", "PENNY_AUTH_MODE", true],
      ["apiTokenPresent", "PENNY_API_TOKEN", true],
      ["sessionSecretPresent", "PENNY_SESSION_SECRET", true],
      ["corsOriginsPresent", "PENNY_CORS_ORIGINS", true],
      ["rateLimitPresent", "PENNY_RATE_LIMIT_MAX", true],
      ["trustAuthHeadersPresent", "PENNY_TRUST_AUTH_HEADERS", true],
    );
  }

  return requirements
    .filter(([field, , expected]) => presence[field] !== expected)
    .map(([, key]) => key);
}

function checkStrictStagingEnv() {
  const authMode = requiredEnv("PENNY_AUTH_MODE");
  const apiToken = requiredEnv("PENNY_API_TOKEN");
  const sessionSecret = requiredEnv("PENNY_SESSION_SECRET");
  const corsOrigins = parseCorsOrigins(requiredEnv("PENNY_CORS_ORIGINS"));
  const rateLimitMax = positiveInt(requiredEnv("PENNY_RATE_LIMIT_MAX"), "PENNY_RATE_LIMIT_MAX");
  const trustAuthHeaders = requiredEnv("PENNY_TRUST_AUTH_HEADERS");
  const base = parsedUrl(baseUrl, "BASE_URL");

  assert(requiredEnv("DATABASE_URL"), "DATABASE_URL must be set for strict Gmail staging readiness.");
  assert(base.protocol === "https:" || isLoopbackHost(base.hostname), "BASE_URL must use https for strict Gmail staging readiness unless it is loopback.");
  assert(authMode === "token", "PENNY_AUTH_MODE must be token for strict Gmail staging readiness.");
  assert(apiToken.length >= 32, "PENNY_API_TOKEN must be at least 32 characters for strict Gmail staging readiness.");
  assert(sessionSecret.length >= 32, "PENNY_SESSION_SECRET must be at least 32 characters for strict Gmail staging readiness.");
  assert(!corsOrigins.includes("*"), "PENNY_CORS_ORIGINS must not include wildcard origins for strict Gmail staging readiness.");
  assert(corsOrigins.includes(base.origin), "PENNY_CORS_ORIGINS must include the exact BASE_URL origin.");
  assert(
    corsOrigins.every((origin) => {
      const parsed = parsedUrl(origin, "PENNY_CORS_ORIGINS");

      return parsed.protocol === "https:" || isLoopbackHost(parsed.hostname);
    }),
    "PENNY_CORS_ORIGINS must use https origins unless an origin is loopback.",
  );
  assert(rateLimitMax >= 1 && rateLimitMax <= 1000, "PENNY_RATE_LIMIT_MAX must be between 1 and 1000 for strict Gmail staging readiness.");
  assert(
    trustAuthHeaders.toLowerCase() === "false",
    "PENNY_TRUST_AUTH_HEADERS must be false for strict Gmail staging readiness.",
  );

  record("env.strictStaging", {
    databaseUrlPresent: true,
    pennyAuthMode: authMode,
    apiTokenPresent: true,
    sessionSecretPresent: true,
    baseUrlOrigin: base.origin,
    baseUrlHttpsOrLoopback: true,
    corsOriginCount: corsOrigins.length,
    corsIncludesBaseOrigin: true,
    corsWildcardAbsent: true,
    rateLimitMax,
    trustAuthHeaders: false,
  });
}

async function request(method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: headers(body !== undefined),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
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

function headers(withJsonBody) {
  return {
    ...(apiToken ? { authorization: `Bearer ${apiToken}` } : {}),
    ...(withJsonBody ? { "content-type": "application/json" } : {}),
    "x-user-id": userId,
    "x-workspace-id": workspaceId,
    "x-project-id": projectId,
    "x-sphere-id": sphereId,
  };
}

function assertConnectPreflight(data, nangoGmailIntegrationId) {
  assert(data?.providerConfigKey === nangoGmailIntegrationId, "Gmail connect preflight returned the wrong providerConfigKey.");
  assert(typeof data?.connectLink === "string" && data.connectLink.length > 0, "Gmail connect preflight did not return a connect link.");
  assert(typeof data?.token === "string" && data.token.length > 0, "Gmail connect preflight did not return a session token.");
  assert(typeof data?.expiresAt === "string" && data.expiresAt.length > 0, "Gmail connect preflight did not return an expiration.");
  assert(Array.isArray(data?.requestableSurfaceIds) && data.requestableSurfaceIds.includes("google_gmail"), "Gmail connect preflight did not request the Gmail surface.");
  assertGmailReadonlyOnly(data?.requestableScopeUrls, "Gmail connect preflight");
  assert(data?.restrictedScope === true, "Gmail connect preflight did not report restrictedScope=true.");
  assert(data?.gated === true, "Gmail connect preflight did not report gated=true.");
  assert(data?.private === true, "Gmail connect preflight did not report private=true.");
}

function assertConnectionIntegrationMatches(connections, nangoGmailIntegrationId, label) {
  if (!Array.isArray(connections)) {
    return;
  }

  for (const connection of connections) {
    const providerConfigKey = connection?.credential?.providerConfigKey;

    if (providerConfigKey) {
      assert(providerConfigKey === nangoGmailIntegrationId, `${label} exposed unexpected providerConfigKey.`);
    }
  }
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

  return "Gmail staging readiness needs a valid migrated DATABASE_URL.";
}

function record(name, data) {
  checks.push({
    name,
    at: new Date().toISOString(),
    ...data,
  });
}

function requiredEnv(name) {
  const value = env(name, "");

  assert(value, `${name} must be set for Gmail staging readiness.`);
  assert(!/^<.*>$/.test(value), `${name} must be a real value, not a placeholder.`);

  return value;
}

function parseCorsOrigins(value) {
  const origins = value
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);

  assert(origins.length > 0, "PENNY_CORS_ORIGINS must include at least one origin for strict Gmail staging readiness.");

  return origins;
}

function positiveInt(value, label) {
  const parsed = Number.parseInt(value, 10);

  assert(Number.isFinite(parsed) && String(parsed) === value, `${label} must be a positive integer.`);
  assert(parsed > 0, `${label} must be a positive integer.`);

  return parsed;
}

function parsedUrl(value, label) {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
}

function isLoopbackHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function loadEnvFile(path) {
  let raw = "";

  try {
    raw = readFileSync(resolve(path), "utf8");
  } catch (error) {
    throw new Error(`GMAIL_READINESS_ENV_FILE could not be loaded: ${error instanceof Error ? error.message : String(error)}`);
  }

  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);

    if (!match) {
      throw new Error(`GMAIL_READINESS_ENV_FILE has an invalid assignment on line ${index + 1}.`);
    }

    const [, key, rawValue] = match;

    if (process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = unquoteEnvValue(rawValue.trim());
  }
}

function writeEvidence(payload) {
  if (!evidenceFile) {
    return;
  }

  writeFileSync(resolve(evidenceFile), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function unquoteEnvValue(value) {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }

  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  return value.replace(/\s+#.*$/, "").trim();
}

function assertEnvFlag(name) {
  assert(envFlag(name), `${name} must be true for Gmail staging readiness.`);
}

function envFlag(name) {
  const value = process.env[name]?.trim().toLowerCase();

  return value === "true" || value === "1" || value === "yes";
}

function hasEnv(name) {
  return Boolean(env(name, ""));
}

function env(name, fallback) {
  const value = process.env[name];

  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safeJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return { nonJson: true, rawLength: raw.length };
  }
}

function safeUrlHost(value) {
  try {
    return new URL(value).host;
  } catch {
    return "";
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
