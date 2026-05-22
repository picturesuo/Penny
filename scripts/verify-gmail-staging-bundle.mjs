#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const readinessFile = optionValue("--readiness");
const smokeFile = optionValue("--smoke");
const destructiveFile = optionValue("--destructive-smoke");
const uiPreflightFile = optionValue("--ui-preflight");
const browserEvidenceFile = optionValue("--browser-evidence");
const browserArtifactRoot = optionValue("--browser-artifact-root");
const finalStaging = args.includes("--final-staging");
const requireReadinessConnect = finalStaging || args.includes("--readiness-connect-preflight");
const requireSmokeConnect = args.includes("--smoke-connect-preflight");
const requireKeywordFilters = finalStaging || args.includes("--require-keyword-filters");
const requireDestructive = finalStaging || args.includes("--require-destructive");
const requireUiPreflight = finalStaging || args.includes("--require-ui-preflight");
const requireBrowserEvidence = finalStaging || args.includes("--require-browser-evidence");
const requireBrowserArtifactFiles = finalStaging || args.includes("--require-browser-artifact-files");
const minMessages = optionInt("--min-messages", 1);
const errors = [];

if (
  args.includes("--help") ||
  args.includes("-h") ||
  !readinessFile ||
  !smokeFile ||
  (requireDestructive && !destructiveFile) ||
  (requireUiPreflight && !uiPreflightFile) ||
  (requireBrowserEvidence && !browserEvidenceFile) ||
  (requireBrowserArtifactFiles && !browserEvidenceFile) ||
  (requireBrowserArtifactFiles && !browserArtifactRoot)
) {
  printUsage();
  process.exit(
    readinessFile &&
      smokeFile &&
      (!requireDestructive || destructiveFile) &&
      (!requireUiPreflight || uiPreflightFile) &&
      (!requireBrowserEvidence || browserEvidenceFile) &&
      (!requireBrowserArtifactFiles || browserEvidenceFile) &&
      (!requireBrowserArtifactFiles || browserArtifactRoot)
      ? 0
      : 1,
  );
}

const readiness = readEvidence(readinessFile, "readiness");
const smoke = readEvidence(smokeFile, "smoke");
const destructive = destructiveFile ? readEvidence(destructiveFile, "destructive smoke") : null;
const uiPreflight = uiPreflightFile ? readEvidence(uiPreflightFile, "UI preflight") : null;
const browserEvidence = browserEvidenceFile ? readEvidence(browserEvidenceFile, "browser evidence") : null;

runVerifier("readiness", [
  "scripts/verify-gmail-readiness-evidence.mjs",
  readinessFile,
  "--strict-staging",
  ...(requireReadinessConnect ? ["--connect-preflight"] : []),
]);
runVerifier("smoke", [
  "scripts/verify-gmail-smoke-evidence.mjs",
  smokeFile,
  `--min-messages=${minMessages}`,
  ...(requireSmokeConnect ? ["--connect-preflight"] : []),
  ...(requireKeywordFilters ? ["--require-keyword-filters"] : []),
]);

if (destructiveFile) {
  runVerifier("destructive smoke", [
    "scripts/verify-gmail-smoke-evidence.mjs",
    destructiveFile,
    "--destructive",
    `--min-messages=${minMessages}`,
    ...(requireKeywordFilters ? ["--require-keyword-filters"] : []),
  ]);
}

if (browserEvidenceFile) {
  runVerifier("browser evidence", [
    "scripts/verify-gmail-browser-evidence.mjs",
    browserEvidenceFile,
    ...(browserArtifactRoot ? [`--artifact-root=${browserArtifactRoot}`] : []),
    ...(requireBrowserArtifactFiles ? ["--require-artifact-files"] : []),
  ]);
}

if (readiness && smoke) {
  assertMatchingScope(readiness, smoke, "smoke");
  assert(smoke.ok !== false, "Smoke evidence must not be failed evidence.");
  assert(Boolean(smoke.completedAt), "Smoke evidence must include completedAt.");
}

if (readiness && destructive) {
  assertMatchingScope(readiness, destructive, "destructive smoke");
  assert(destructive.ok !== false, "Destructive smoke evidence must not be failed evidence.");
  assert(Boolean(destructive.completedAt), "Destructive smoke evidence must include completedAt.");
}

if (readiness && uiPreflight) {
  assertMatchingScope(readiness, uiPreflight, "UI preflight");
  assertUiPreflightEvidence(uiPreflight);
}

if (readiness && browserEvidence) {
  assertMatchingScope(readiness, browserEvidence, "browser");
}

if (smoke && destructive) {
  assertMatchingScope(smoke, destructive, "destructive smoke");
}

if (errors.length) {
  printErrors();
} else {
  console.log(
    JSON.stringify(
      {
        ok: true,
        readiness: evidenceSummary(readinessFile, readiness),
        smoke: evidenceSummary(smokeFile, smoke),
        destructive: destructiveFile ? evidenceSummary(destructiveFile, destructive) : null,
        uiPreflight: uiPreflightFile ? evidenceSummary(uiPreflightFile, uiPreflight) : null,
        browserEvidence: browserEvidenceFile ? evidenceSummary(browserEvidenceFile, browserEvidence) : null,
        readinessConnectPreflightRequired: requireReadinessConnect,
        smokeConnectPreflightRequired: requireSmokeConnect,
        keywordFilterCoverageRequired: requireKeywordFilters,
        destructiveRequired: requireDestructive,
        uiPreflightRequired: requireUiPreflight,
        browserEvidenceRequired: requireBrowserEvidence,
        browserArtifactFilesRequired: requireBrowserArtifactFiles,
        finalStaging,
        minMessages,
      },
      null,
      2,
    ),
  );
}

function runVerifier(label, verifierArgs) {
  const result = spawnSync(process.execPath, verifierArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    errors.push(`${label} verifier failed with status ${result.status ?? "unknown"}: ${summarizeFailure(result.stderr || result.stdout)}`);
  }
}

function assertUiPreflightEvidence(evidence) {
  assert(evidence.ok !== false, "UI preflight evidence must not be failed evidence.");
  assert(Boolean(evidence.checkedAt), "UI preflight evidence must include checkedAt.");
  assertNoUnsafeUiPreflightEvidence(evidence);

  const requiredChecks = ["brain.documents", "brain.memoryProfile", "brain.recents", "google.provider", "gmail.status"];
  const checks = Array.isArray(evidence.checks) ? evidence.checks : [];
  const checkNames = new Set(checks.map((check) => check?.name));

  for (const checkName of requiredChecks) {
    assert(checkNames.has(checkName), `UI preflight evidence must include ${checkName}.`);
  }

  const providerCheck = checks.find((check) => check?.name === "google.provider");
  const gmailCheck = checks.find((check) => check?.name === "gmail.status");

  assert(providerCheck?.configured === true, "UI preflight Google provider check must be configured.");
  assert(providerCheck?.providerStatePrivacySafe === true, "UI preflight Google provider check must be privacy-safe.");
  assert(gmailCheck?.restrictedScope === true, "UI preflight Gmail status must report restrictedScope=true.");
  assert(gmailCheck?.gated === true, "UI preflight Gmail status must report gated=true.");
  assert(gmailCheck?.private === true, "UI preflight Gmail status must report private=true.");
  assert(gmailCheck?.statusStatePrivacySafe === true, "UI preflight Gmail status check must be privacy-safe.");
}

function assertNoUnsafeUiPreflightEvidence(evidence) {
  const serialized = JSON.stringify(evidence);
  const unsafePattern =
    /connectLink|credentialRef|accessToken|refreshToken|encryptedToken|encryptedRefreshToken|rawBody|plainTextBody|private raw Gmail body/i;

  assert(!unsafePattern.test(serialized), "UI preflight evidence includes unsafe Gmail, credential, or raw body fields.");
}

function readEvidence(file, label) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    errors.push(`${label} evidence could not be read as JSON: ${error instanceof Error ? error.message : String(error)}`);

    return null;
  }
}

function assertMatchingScope(left, right, label) {
  for (const field of ["baseUrl", "userId", "workspaceId", "projectId", "sphereId"]) {
    assert(
      left?.[field] === right?.[field],
      `${label} evidence ${field} must match readiness evidence.`,
    );
  }
}

function evidenceSummary(file, evidence) {
  return {
    file: basename(file),
    ok: evidence?.ok ?? null,
    baseUrl: evidence?.baseUrl ?? null,
    userId: evidence?.userId ?? null,
    workspaceId: evidence?.workspaceId ?? null,
    projectId: evidence?.projectId ?? null,
    sphereId: evidence?.sphereId ?? null,
    stepCount: Array.isArray(evidence?.steps) ? evidence.steps.length : null,
    checkCount: Array.isArray(evidence?.checks) ? evidence.checks.length : null,
  };
}

function optionValue(name) {
  return args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}

function optionInt(name, fallback) {
  const value = optionValue(name);
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function summarizeFailure(value) {
  return String(value).trim().split(/\r?\n/).slice(0, 6).join(" | ");
}

function assert(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function printErrors() {
  console.error(`Gmail staging evidence bundle failed ${errors.length} check${errors.length === 1 ? "" : "s"}:`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
}

function printUsage() {
  console.error(
    "Usage: node scripts/verify-gmail-staging-bundle.mjs --readiness=<readiness.json> --smoke=<smoke.json> [--destructive-smoke=<smoke-full.json>] [--ui-preflight=<ui-preflight.json>] [--browser-evidence=<browser-evidence.json>] [--browser-artifact-root=<dir>] [--final-staging] [--require-destructive] [--require-ui-preflight] [--require-browser-evidence] [--require-browser-artifact-files] [--readiness-connect-preflight] [--smoke-connect-preflight] [--require-keyword-filters] [--min-messages=N]",
  );
}
