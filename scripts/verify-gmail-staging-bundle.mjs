#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const readinessFile = optionValue("--readiness");
const smokeFile = optionValue("--smoke");
const destructiveFile = optionValue("--destructive-smoke");
const requireReadinessConnect = args.includes("--readiness-connect-preflight");
const requireSmokeConnect = args.includes("--smoke-connect-preflight");
const requireDestructive = args.includes("--require-destructive");
const minMessages = optionInt("--min-messages", 1);
const errors = [];

if (args.includes("--help") || args.includes("-h") || !readinessFile || !smokeFile || (requireDestructive && !destructiveFile)) {
  printUsage();
  process.exit(readinessFile && smokeFile && (!requireDestructive || destructiveFile) ? 0 : 1);
}

const readiness = readEvidence(readinessFile, "readiness");
const smoke = readEvidence(smokeFile, "smoke");
const destructive = destructiveFile ? readEvidence(destructiveFile, "destructive smoke") : null;

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
]);

if (destructiveFile) {
  runVerifier("destructive smoke", [
    "scripts/verify-gmail-smoke-evidence.mjs",
    destructiveFile,
    "--destructive",
    `--min-messages=${minMessages}`,
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
        readinessConnectPreflightRequired: requireReadinessConnect,
        smokeConnectPreflightRequired: requireSmokeConnect,
        destructiveRequired: requireDestructive,
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
    "Usage: node scripts/verify-gmail-staging-bundle.mjs --readiness=<readiness.json> --smoke=<smoke.json> [--destructive-smoke=<smoke-full.json>] [--require-destructive] [--readiness-connect-preflight] [--smoke-connect-preflight] [--min-messages=N]",
  );
}
