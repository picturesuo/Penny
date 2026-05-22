#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith("--"));
const allowFailure = args.includes("--allow-failure");
const safeStagingRunIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/;
const safeEvidenceScopeIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const requiredCheckNames = ["brain.documents", "brain.memoryProfile", "brain.recents", "google.provider", "gmail.status"];
const errors = [];

if (!file || args.includes("--help") || args.includes("-h")) {
  printUsage();
  process.exit(args.includes("--help") || args.includes("-h") ? 0 : 1);
}

const evidence = safeJson(file === "-" ? await readStdin() : await readFile(file, "utf8"));
const checks = Array.isArray(evidence?.checks) ? evidence.checks : [];

assert(Boolean(evidence), "UI preflight evidence must be valid JSON.");
assert(typeof evidence?.baseUrl === "string" && evidence.baseUrl.length > 0, "UI preflight evidence must include baseUrl.");
assertSafeScopeId(evidence?.userId, "userId");
assertSafeScopeId(evidence?.workspaceId, "workspaceId");
assertSafeScopeId(evidence?.projectId, "projectId");
assertSafeScopeId(evidence?.sphereId, "sphereId");
assert(Array.isArray(evidence?.checks), "UI preflight evidence must include checks.");
assertSafeStagingRunId(evidence);
assertUiPreflightChecks(checks, { requireAll: evidence?.ok === true });
assertNoUnsafeEvidence(evidence);

if (evidence?.ok === false) {
  assert(allowFailure, "Failed UI preflight evidence is only valid with --allow-failure.");
  assert(typeof evidence?.failedAt === "string" && evidence.failedAt.length > 0, "Failed UI preflight evidence must include failedAt.");
  assert(typeof evidence?.error === "string" && evidence.error.length > 0, "Failed UI preflight evidence must include an error message.");
  printResult({ preflightOk: false });
  process.exit(errors.length ? 1 : 0);
}

assert(evidence?.ok === true, "UI preflight evidence must include ok=true.");
assert(typeof evidence?.checkedAt === "string" && evidence.checkedAt.length > 0, "UI preflight evidence must include checkedAt.");
assertSuccessfulChecks(checks);

if (errors.length) {
  printErrors();
} else {
  printResult({ preflightOk: true });
}

function assertSuccessfulChecks(checksValue) {
  const documentsCheck = checksValue.find((check) => check?.name === "brain.documents");
  const memoryProfileCheck = checksValue.find((check) => check?.name === "brain.memoryProfile");
  const recentsCheck = checksValue.find((check) => check?.name === "brain.recents");
  const providerCheck = checksValue.find((check) => check?.name === "google.provider");
  const gmailCheck = checksValue.find((check) => check?.name === "gmail.status");

  assert(numberValue(documentsCheck?.documentCount) >= 0, "UI preflight Brain documents check must include documentCount.");
  assert(numberValue(memoryProfileCheck?.sourceCount) >= 0, "UI preflight Brain memory profile check must include sourceCount.");
  assert(numberValue(memoryProfileCheck?.memoryNodeCount) >= 0, "UI preflight Brain memory profile check must include memoryNodeCount.");
  assert(numberValue(recentsCheck?.recentCount) >= 0, "UI preflight Brain recents check must include recentCount.");
  assert(providerCheck?.configured === true, "UI preflight Google provider check must be configured.");
  assert(numberValue(providerCheck?.surfaceCount) >= 1, "UI preflight Google provider check must include at least one surface.");
  assert(typeof providerCheck?.gmailStatus === "string" && providerCheck.gmailStatus.length > 0, "UI preflight Google provider check must include gmailStatus.");
  assert(providerCheck?.providerStatePrivacySafe === true, "UI preflight Google provider check must be privacy-safe.");
  assert(typeof gmailCheck?.status === "string" && gmailCheck.status.length > 0, "UI preflight Gmail status check must include status.");
  assert(numberValue(gmailCheck?.connectionCount) >= 0, "UI preflight Gmail status check must include connectionCount.");
  assert(numberValue(gmailCheck?.sourceCount) >= 0, "UI preflight Gmail status check must include sourceCount.");
  assert(numberValue(gmailCheck?.messageCount) >= 0, "UI preflight Gmail status check must include messageCount.");
  assert(gmailCheck?.restrictedScope === true, "UI preflight Gmail status must report restrictedScope=true.");
  assert(gmailCheck?.gated === true, "UI preflight Gmail status must report gated=true.");
  assert(gmailCheck?.private === true, "UI preflight Gmail status must report private=true.");
  assert(gmailCheck?.statusStatePrivacySafe === true, "UI preflight Gmail status check must be privacy-safe.");
}

function assertUiPreflightChecks(value, options) {
  if (!Array.isArray(value)) {
    return;
  }

  const allowed = new Set(requiredCheckNames);
  const seen = new Set();

  for (const [index, check] of value.entries()) {
    const isObject = Boolean(check) && typeof check === "object" && !Array.isArray(check);

    assert(isObject, `UI preflight evidence check ${index + 1} must be an object.`);

    if (!isObject) {
      continue;
    }

    const name = typeof check.name === "string" ? check.name.trim() : "";

    assert(Boolean(name), `UI preflight evidence check ${index + 1} must include a name.`);

    if (!name) {
      continue;
    }

    assert(allowed.has(name), `UI preflight evidence check ${index + 1} name must match an allowed UI preflight check.`);
    assert(!seen.has(name), `UI preflight evidence must include ${name} only once.`);
    seen.add(name);
  }

  if (options.requireAll) {
    for (const checkName of requiredCheckNames) {
      assert(seen.has(checkName), `UI preflight evidence must include ${checkName}.`);
    }
  }
}

function assertSafeStagingRunId(value) {
  const runId = typeof value?.stagingRunId === "string" ? value.stagingRunId.trim() : "";

  if (!runId) {
    return;
  }

  assert(isSafeStagingRunId(runId), "UI preflight evidence stagingRunId must be a safe opaque slug.");
}

function isSafeStagingRunId(value) {
  return typeof value === "string" && safeStagingRunIdPattern.test(value.trim());
}

function assertSafeScopeId(value, field) {
  const text = typeof value === "string" ? value.trim() : "";

  assert(Boolean(text), `UI preflight evidence must include ${field}.`);
  assert(!/^REPLACE_WITH_/i.test(text), `UI preflight evidence ${field} must not be a template placeholder.`);
  assert(isSafeEvidenceScopeId(text), `UI preflight evidence ${field} must be a safe opaque scope id.`);
}

function isSafeEvidenceScopeId(value) {
  return typeof value === "string" && safeEvidenceScopeIdPattern.test(value.trim());
}

function assertNoUnsafeEvidence(value) {
  const unsafeKeys = new Set([
    "accesstoken",
    "body",
    "connectlink",
    "credentialref",
    "encryptedrefreshtoken",
    "encryptedtoken",
    "html",
    "metadata",
    "payload",
    "plaintextbody",
    "provenance",
    "raw",
    "rawbody",
    "refreshtoken",
    "score",
    "token",
  ]);
  const unsafeValuePattern =
    /(https:\/\/connect\.[^\s"]+|session-token|gmail-session-token|ya29\.|refresh_token|plainTextBody|rawBody|private raw Gmail body|raw Gmail body|raw email body|BEGIN PRIVATE KEY)/i;

  walk(value, "$", (item, path) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      for (const key of Object.keys(item)) {
        if (unsafeKeys.has(normalizeKey(key))) {
          errors.push(`${path}.${key} must not be present in UI preflight evidence.`);
        }
      }
    }

    if (typeof item === "string" && unsafeValuePattern.test(item)) {
      errors.push(`${path} looks like it contains a raw connect/session/token or Gmail body value.`);
    }
  });
}

function normalizeKey(value) {
  return String(value).replace(/[-_\s]/g, "").toLowerCase();
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

function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
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
    errors.push("UI preflight evidence file must contain parseable JSON.");

    return null;
  }
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
        checkCount: Array.isArray(evidence?.checks) ? evidence.checks.length : 0,
      },
      null,
      2,
    ),
  );
}

function printErrors() {
  console.error(`Gmail UI preflight evidence failed ${errors.length} check${errors.length === 1 ? "" : "s"}:`);
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
  console.error("Usage: node scripts/verify-gmail-ui-preflight-evidence.mjs <evidence.json|-> [--allow-failure]");
}
