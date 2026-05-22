#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const gmailReadonlyScope = "https://www.googleapis.com/auth/gmail.readonly";
const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith("--"));
const requireStrictStaging = args.includes("--strict-staging");
const requireConnectPreflight = args.includes("--connect-preflight");
const allowFailure = args.includes("--allow-failure");
const safeStagingRunIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/;
const errors = [];

if (!file || args.includes("--help") || args.includes("-h")) {
  printUsage();
  process.exit(file ? 0 : 1);
}

const evidence = safeJson(file === "-" ? await readStdin() : await readFile(file, "utf8"));
const checks = new Map(Array.isArray(evidence?.checks) ? evidence.checks.map((check) => [check.name, check]) : []);

assert(Boolean(evidence), "Readiness evidence must be valid JSON.");
assert(typeof evidence?.baseUrl === "string" && evidence.baseUrl.length > 0, "Readiness evidence must include baseUrl.");
assert(typeof evidence?.userId === "string" && evidence.userId.length > 0, "Readiness evidence must include userId.");
assert(typeof evidence?.workspaceId === "string" && evidence.workspaceId.length > 0, "Readiness evidence must include workspaceId.");
assert(typeof evidence?.projectId === "string" && evidence.projectId.length > 0, "Readiness evidence must include projectId.");
assert(typeof evidence?.sphereId === "string" && evidence.sphereId.length > 0, "Readiness evidence must include sphereId.");
assert(typeof evidence?.requireStaging === "boolean", "Readiness evidence must include requireStaging.");
assert(typeof evidence?.connectPreflight === "boolean", "Readiness evidence must include connectPreflight.");
assert(Array.isArray(evidence?.checks), "Readiness evidence must include checks.");
assertSafeStagingRunId(evidence);
assertNoUnsafeEvidence(evidence);

if (evidence?.ok === false) {
  assert(allowFailure, "Failed readiness evidence is only valid with --allow-failure.");
  assert(typeof evidence?.failedAt === "string" && evidence.failedAt.length > 0, "Failed readiness evidence must include failedAt.");
  assert(typeof evidence?.error === "string" && evidence.error.length > 0, "Failed readiness evidence must include an error message.");
  printResult({
    readinessOk: false,
    strictStagingVerified: false,
    connectPreflightVerified: false,
  });
  process.exit(errors.length ? 1 : 0);
}

assert(evidence?.ok === true, "Readiness evidence must include ok=true.");
assert(typeof evidence?.checkedAt === "string" && evidence.checkedAt.length > 0, "Readiness evidence must include checkedAt.");
assert(checks.size > 0, "Successful readiness evidence must include checks.");

const envGmail = requireCheck("env.gmail");
assert(envGmail.enableGoogleConnector === true, "env.gmail must report ENABLE_GOOGLE_CONNECTOR=true.");
assert(envGmail.enableGmailConnector === true, "env.gmail must report ENABLE_GMAIL_CONNECTOR=true.");
assert(envGmail.enableRestrictedGoogleScopes === true, "env.gmail must report ENABLE_RESTRICTED_GOOGLE_SCOPES=true.");
assert(envGmail.nangoSecretPresent === true, "env.gmail must report NANGO_SECRET_KEY present.");
assert(envGmail.nangoPublicPresent === true, "env.gmail must report NANGO_PUBLIC_KEY present.");
assert(typeof envGmail.nangoBaseHost === "string" && envGmail.nangoBaseHost.length > 0, "env.gmail must include a sanitized Nango base host.");
assert(
  typeof envGmail.nangoGmailIntegrationId === "string" && envGmail.nangoGmailIntegrationId.length > 0,
  "env.gmail must include NANGO_GMAIL_INTEGRATION_ID.",
);
assert(envGmail.databasePrepBypass === false, "env.gmail must report databasePrepBypass=false.");

if (requireStrictStaging) {
  assert(evidence.requireStaging === true, "Strict staging verification requires requireStaging=true.");
  const strict = requireCheck("env.strictStaging");

  assert(strict.databaseUrlPresent === true, "env.strictStaging must report DATABASE_URL present.");
  assert(strict.pennyAuthMode === "token", "env.strictStaging must report PENNY_AUTH_MODE=token.");
  assert(strict.apiTokenPresent === true, "env.strictStaging must report PENNY_API_TOKEN present.");
  assert(strict.sessionSecretPresent === true, "env.strictStaging must report PENNY_SESSION_SECRET present.");
  assert(typeof strict.baseUrlOrigin === "string" && strict.baseUrlOrigin.length > 0, "env.strictStaging must report baseUrlOrigin.");
  assert(strict.baseUrlHttpsOrLoopback === true, "env.strictStaging must report baseUrlHttpsOrLoopback=true.");
  assert(numberValue(strict.corsOriginCount) >= 1, "env.strictStaging must report at least one CORS origin.");
  assert(strict.corsIncludesBaseOrigin === true, "env.strictStaging must report corsIncludesBaseOrigin=true.");
  assert(strict.corsWildcardAbsent === true, "env.strictStaging must report corsWildcardAbsent=true.");
  assert(numberValue(strict.rateLimitMax) >= 1 && numberValue(strict.rateLimitMax) <= 1000, "env.strictStaging must report a bounded rateLimitMax.");
  assert(strict.trustAuthHeaders === false, "env.strictStaging must report trustAuthHeaders=false.");
}

const provider = requireCheck("api.googleProvider");
assert(provider.configured === true, "api.googleProvider must report configured=true.");
assert(numberValue(provider.surfaceCount) >= 1, "api.googleProvider must report at least one surface.");
assert(provider.providerStatePrivacySafe === true, "api.googleProvider must report providerStatePrivacySafe=true.");

const status = requireCheck("api.gmailStatus");
assert(typeof status.status === "string" && status.status.length > 0, "api.gmailStatus must include status.");
assert(status.restrictedScope === true, "api.gmailStatus must report restrictedScope=true.");
assert(status.gated === true, "api.gmailStatus must report gated=true.");
assert(status.private === true, "api.gmailStatus must report private=true.");
assert(status.statusStatePrivacySafe === true, "api.gmailStatus must report statusStatePrivacySafe=true.");
assert(numberValue(status.connectionCount) >= 0, "api.gmailStatus must include connectionCount.");
assert(numberValue(status.sourceCount) >= 0, "api.gmailStatus must include sourceCount.");
assert(numberValue(status.messageCount) >= 0, "api.gmailStatus must include messageCount.");

if (requireConnectPreflight || evidence.connectPreflight === true || checks.has("api.connectPreflight")) {
  assert(evidence.connectPreflight === true, "Connect preflight verification requires connectPreflight=true.");
  assertConnectPreflight(requireCheck("api.connectPreflight"), envGmail.nangoGmailIntegrationId);
}

if (errors.length) {
  printErrors();
} else {
  printResult({
    readinessOk: true,
    strictStagingVerified: requireStrictStaging,
    connectPreflightVerified: requireConnectPreflight || checks.has("api.connectPreflight"),
  });
}

function requireCheck(name) {
  const check = checks.get(name);

  assert(Boolean(check), `Readiness evidence must include ${name}.`);

  return check ?? {};
}

function assertSafeStagingRunId(value) {
  const runId = typeof value?.stagingRunId === "string" ? value.stagingRunId.trim() : "";

  if (!runId) {
    return;
  }

  assert(isSafeStagingRunId(runId), "Readiness evidence stagingRunId must be a safe opaque slug.");
}

function isSafeStagingRunId(value) {
  return typeof value === "string" && safeStagingRunIdPattern.test(value.trim());
}

function assertConnectPreflight(check, expectedProviderConfigKey) {
  assert(check.providerConfigKey === expectedProviderConfigKey, "api.connectPreflight must match NANGO_GMAIL_INTEGRATION_ID.");
  assert(check.connectLinkPresent === true, "api.connectPreflight must report connectLinkPresent=true.");
  assert(typeof check.connectLinkHost === "string" && !/^https?:\/\//i.test(check.connectLinkHost), "api.connectPreflight must record only the connect link host.");
  assert(check.tokenPresent === true, "api.connectPreflight must report tokenPresent=true without storing the token.");
  assert(check.expiresAtPresent === true, "api.connectPreflight must report expiresAtPresent=true.");
  assert(Array.isArray(check.requestableSurfaceIds) && check.requestableSurfaceIds.includes("google_gmail"), "api.connectPreflight must report google_gmail as requestable.");
  assertGmailReadonlyOnly(check.requestableScopeUrls, "api.connectPreflight");
  assert(check.restrictedScope === true, "api.connectPreflight must report restrictedScope=true.");
  assert(check.gated === true, "api.connectPreflight must report gated=true.");
  assert(check.private === true, "api.connectPreflight must report private=true.");
}

function assertGmailReadonlyOnly(scopes, label) {
  assert(Array.isArray(scopes), `${label} must include requestableScopeUrls.`);
  assert(scopes.length === 1 && scopes[0] === gmailReadonlyScope, `${label} must request exactly gmail.readonly.`);
}

function assertNoUnsafeEvidence(value) {
  const unsafeKeys = new Set([
    "accessToken",
    "body",
    "connectLink",
    "credentialRef",
    "databaseUrl",
    "encryptedRefreshToken",
    "encryptedToken",
    "html",
    "metadata",
    "nangoPublicKey",
    "nangoSecretKey",
    "payload",
    "plainTextBody",
    "provenance",
    "raw",
    "rawBody",
    "refreshToken",
    "sessionSecret",
    "token",
  ]);
  const allowedKeys = new Set(["connectLinkHost", "connectLinkPresent", "nangoPublicPresent", "nangoSecretPresent", "sessionSecretPresent", "tokenPresent"]);
  const unsafeValuePattern = /(https:\/\/connect\.[^\s"]+|session-token|gmail-session-token|ya29\.|refresh_token|BEGIN PRIVATE KEY)/i;

  walk(value, "$", (item, path) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      for (const key of Object.keys(item)) {
        if (unsafeKeys.has(key) && !allowedKeys.has(key)) {
          errors.push(`${path}.${key} must not be present in readiness evidence.`);
        }
      }
    }

    if (typeof item === "string" && unsafeValuePattern.test(item)) {
      errors.push(`${path} looks like it contains a raw connect/session/token value.`);
    }
  });
}

function walk(value, path, visitor) {
  visitor(value, path);

  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, visitor));
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      walk(item, `${path}.${key}`, visitor);
    }
  }
}

function assert(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function safeJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    errors.push("Readiness evidence file must contain parseable JSON.");

    return null;
  }
}

function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
}

function printResult(extra) {
  if (errors.length) {
    printErrors();
    return;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        file,
        stagingRunId: isSafeStagingRunId(evidence?.stagingRunId) ? evidence.stagingRunId.trim() : null,
        ...extra,
        checkCount: evidence.checks.length,
      },
      null,
      2,
    ),
  );
}

function printErrors() {
  console.error(`Gmail readiness evidence failed ${errors.length} check${errors.length === 1 ? "" : "s"}:`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
}

async function readStdin() {
  let raw = "";

  for await (const chunk of process.stdin) {
    raw += chunk;
  }

  return raw;
}

function printUsage() {
  console.error("Usage: node scripts/verify-gmail-readiness-evidence.mjs <evidence.json|-> [--strict-staging] [--connect-preflight] [--allow-failure]");
}
