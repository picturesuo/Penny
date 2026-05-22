#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const gmailReadonlyScope = "https://www.googleapis.com/auth/gmail.readonly";
const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith("--"));
const destructive = args.includes("--destructive");
const requireConnectPreflight = args.includes("--connect-preflight");
const connectPreflightOnly = args.includes("--connect-preflight-only");
const minMessages = optionInt("--min-messages", 1);
const errors = [];

if (!file || args.includes("--help") || args.includes("-h")) {
  printUsage();
  process.exit(file ? 0 : 1);
}

const evidence = safeJson(file === "-" ? await readStdin() : await readFile(file, "utf8"));
const steps = new Map(Array.isArray(evidence?.steps) ? evidence.steps.map((step) => [step.step, step]) : []);

assert(Boolean(evidence), "Evidence file must be valid JSON.");
assert(typeof evidence?.baseUrl === "string" && evidence.baseUrl.length > 0, "Evidence must include baseUrl.");
assert(typeof evidence?.startedAt === "string" && evidence.startedAt.length > 0, "Evidence must include startedAt.");
assert(typeof evidence?.completedAt === "string" && evidence.completedAt.length > 0, "Evidence must include completedAt.");
assert(Array.isArray(evidence?.steps) && evidence.steps.length > 0, "Evidence must include steps.");
assertNoUnsafeEvidence(evidence);

if (requireConnectPreflight || steps.has("connect.preflight")) {
  assertConnectPreflight(requireStep("connect.preflight"));
}

if (connectPreflightOnly) {
  const completed = requireStep("connect.preflightOnly.completed");

  assert(!destructive, "Connect-preflight-only evidence cannot also be destructive evidence.");
  assert(typeof completed.reason === "string" && completed.reason.length > 0, "Connect preflight-only evidence must include a completion reason.");
  printResult({
    connectPreflightOnly: true,
    destructive: false,
    connectPreflightVerified: true,
  });
  process.exit(errors.length ? 1 : 0);
}

const initial = requireStep("status.initial");
assert(initial.restrictedScope === true, "Initial status must be restrictedScope=true.");
assert(initial.gated === true, "Initial status must be gated=true.");
assert(initial.private === true, "Initial status must be private=true.");
assert(initial.rawRetentionDefault === false, "Initial status must report rawRetentionDefault=false.");
assert(initial.noHumanReview === true, "Initial status must report noHumanReview=true.");
assert(initial.statusStatePrivacySafe === true, "Initial Gmail status state must be privacy-safe.");
assert(initial.providerStatePrivacySafe === true, "Initial Google provider state must be privacy-safe.");
assert(numberValue(initial.connectionCount) >= 1, "Evidence must include at least one connected Gmail account.");

const sync = requireStep("sync");
assert(numberValue(sync.messageCount) >= minMessages, `Sync must import at least ${minMessages} Gmail message(s).`);
assertExpectedPartialFailures(sync, "Sync");
assert(sync.cursorPresent === true || sync.historyIdPresent === true, "Sync must include cursor or historyId evidence.");

const afterSync = requireStep("status.afterSync");
assert(numberValue(afterSync.messageCount) >= minMessages, `Status after sync must report at least ${minMessages} Gmail message(s).`);
assert(afterSync.statusStatePrivacySafe === true, "Status after sync must be privacy-safe.");
assert(afterSync.providerStatePrivacySafe === true, "Provider state after sync must be privacy-safe.");

const repeat = requireStep("sync.repeat");
assertExpectedPartialFailures(repeat, "Repeated sync");
assert(repeat.statusMessageCountUnchanged === true, "Repeated sync must leave overall Gmail message count unchanged.");
assert(repeat.selectedSourceCountUnchanged === true, "Repeated sync must leave selected account source count unchanged.");
assert(repeat.duplicateSourceRefsAbsent === true, "Repeated sync must not create duplicate source refs.");

const keyword = requireStep("keywordSearch");
assert(typeof keyword.query === "string" && keyword.query.trim().length > 0, "Keyword search evidence must include the Gmail q query.");
assert(keyword.stored === false, "Keyword search must not store results unless sync=true.");
assert(numberValue(keyword.resultCount) >= 1, "Keyword search must return at least one result.");
assert(keyword.memoryCountUnchanged === true, "Keyword search without sync=true must not change Gmail memory count.");

const keywordSync = requireStep("keywordSearch.syncExplicit");
assert(typeof keywordSync.query === "string" && keywordSync.query.trim().length > 0, "Keyword search sync evidence must include the Gmail q query.");
assert(keywordSync.stored === true, "Keyword search with sync=true must report stored=true.");
assert(numberValue(keywordSync.resultCount) >= 1, "Keyword search with sync=true must return at least one result.");
assert(keywordSync.partialFailureCount === 0, "Keyword search with sync=true must have zero partial failures.");
assert(keywordSync.duplicateSourceRefsAbsent === true, "Keyword search with sync=true must not create duplicate source refs.");

const semantic = requireStep("semanticSearch");
assert(numberValue(semantic.resultCount) >= 1, "Semantic search must return at least one synced Gmail memory result.");
assert(semantic.contextLight === false, "Semantic search evidence must not be context-light after sync.");
assert(semantic.rawScoreHidden === true, "Semantic search must hide raw numeric scores.");

const createFirst = requireStep("create.first");
assert(numberValue(createFirst.memoryCountUsed) >= 1, "Create must use at least one memory.");
assert(numberValue(createFirst.sourceCountUsed) >= 1, "Create must use at least one source.");
assert(createFirst.expectedEvidencePresent === true, "Create must include the expected Gmail evidence text.");

const exported = requireStep("create.export");
assert(exported.expectedEvidencePresent === true, "Export prompt must include the expected Gmail-derived context.");
assert(exported.unsafePrivacyClaimAbsent === true, "Export prompt must not include unsafe privacy claims.");

if (destructive) {
  const revoke = requireStep("revoke");
  assert(revoke.revoked === true, "Destructive evidence must include revoked=true.");
  assert(numberValue(revoke.syncAfterRevokeStatus) >= 400, "Sync must fail after revoke.");
  assert(numberValue(revoke.searchAfterRevokeStatus) >= 400, "Keyword search must fail after revoke.");
  assert(numberValue(revoke.semanticAfterRevokeStatus) >= 400, "Semantic search must fail after revoke.");

  const deleted = requireStep("deleteSource");
  assert(deleted.brainSourceDeleted === true, "Delete evidence must report brainSourceDeleted=true.");
  assert(deleted.brainProfileSourceAbsent === true, "Deleted Gmail source must be absent from Brain profile.");
  assert(deleted.brainRetrieveDeletedSourceAbsent === true, "Deleted Gmail source must be absent from Brain retrieval.");
  assert(deleted.semanticDeletedSourceAbsent === true, "Deleted Gmail source must be absent from semantic search.");
  assert(deleted.createDeletedSourceAbsent === true, "Deleted Gmail source must be absent from Create sources.");
  assert(deleted.createDeletedMemoryAbsent === true, "Deleted Gmail memory must be absent from Create memory refs.");
} else {
  requireStep("revoke.delete.skipped");
}

if (errors.length) {
  printErrors();
} else {
  printResult({
    destructive,
    connectPreflightVerified: requireConnectPreflight || steps.has("connect.preflight"),
  });
}

function requireStep(name) {
  const step = steps.get(name);

  assert(Boolean(step), `Evidence must include ${name}.`);

  return step ?? {};
}

function assertConnectPreflight(step) {
  assert(typeof step.providerConfigKey === "string" && step.providerConfigKey.length > 0, "Connect preflight must include providerConfigKey.");
  assert(step.connectLinkPresent === true, "Connect preflight must report connectLinkPresent=true.");
  assert(typeof step.connectLinkHost === "string" && !/^https?:\/\//i.test(step.connectLinkHost), "Connect preflight must record only the connect link host.");
  assert(step.tokenPresent === true, "Connect preflight must report tokenPresent=true without storing the token.");
  assert(step.expiresAtPresent === true, "Connect preflight must report expiresAtPresent=true.");
  assertGmailReadonlyOnly(step.requestableScopeUrls, "Connect preflight");
  assert(Array.isArray(step.requestedSurfaceIds) && step.requestedSurfaceIds.includes("google_gmail"), "Connect preflight must request google_gmail.");
  assert(Array.isArray(step.requestableSurfaceIds) && step.requestableSurfaceIds.includes("google_gmail"), "Connect preflight must report google_gmail as requestable.");
  assert(step.restrictedScope === true, "Connect preflight must report restrictedScope=true.");
  assert(step.gated === true, "Connect preflight must report gated=true.");
  assert(step.private === true, "Connect preflight must report private=true.");
  assert(
    typeof step.scopeAuditReason === "string" && step.scopeAuditReason.includes("read email for private Brain memory and email search"),
    "Connect preflight must include the Gmail scope audit reason.",
  );
}

function assertGmailReadonlyOnly(scopes, label) {
  assert(Array.isArray(scopes), `${label} must include requestableScopeUrls.`);
  assert(scopes.length === 1 && scopes[0] === gmailReadonlyScope, `${label} must request exactly gmail.readonly.`);
}

function assertExpectedPartialFailures(step, label) {
  const expectedStage = typeof step.expectedPartialFailureStage === "string" ? step.expectedPartialFailureStage.trim() : "";

  if (!expectedStage) {
    assert(step.partialFailureCount === 0, `${label} must have zero unexpected partial failures.`);
    return;
  }

  assert(numberValue(step.partialFailureCount) >= 1, `${label} must report at least one expected partial failure.`);
  assert(step.partialFailureStageMatched === true, `${label} must match the expected ${expectedStage} partial failure stage.`);
  assert(step.partialFailuresSanitized === true, `${label} partial failure evidence must be sanitized.`);
}

function assertNoUnsafeEvidence(value) {
  const unsafeKeys = new Set([
    "accessToken",
    "body",
    "connectLink",
    "credentialRef",
    "encryptedRefreshToken",
    "encryptedToken",
    "html",
    "metadata",
    "payload",
    "plainTextBody",
    "provenance",
    "raw",
    "rawBody",
    "refreshToken",
    "token",
  ]);
  const allowedKeys = new Set(["connectLinkHost", "connectLinkPresent", "rawRetentionDefault", "rawScoreHidden", "tokenPresent"]);
  const unsafeValuePattern = /(https:\/\/connect\.[^\s"]+|session-token|gmail-session-token|ya29\.|refresh_token)/i;

  walk(value, "$", (item, path) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      for (const key of Object.keys(item)) {
        if (unsafeKeys.has(key) && !allowedKeys.has(key)) {
          errors.push(`${path}.${key} must not be present in evidence.`);
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
    errors.push("Evidence file must contain parseable JSON.");

    return null;
  }
}

function optionInt(name, fallback) {
  const value = args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
  const parsed = Number.parseInt(value ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
        ...extra,
        stepCount: evidence.steps.length,
      },
      null,
      2,
    ),
  );
}

function printErrors() {
  console.error(`Gmail smoke evidence failed ${errors.length} check${errors.length === 1 ? "" : "s"}:`);
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
  console.error("Usage: node scripts/verify-gmail-smoke-evidence.mjs <evidence.json|-> [--connect-preflight] [--connect-preflight-only] [--destructive] [--min-messages=N]");
}
