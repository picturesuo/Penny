#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith("--"));
const preOAuthOnly = args.includes("--pre-oauth-only");
const artifactRoot = optionValue("--artifact-root");
const requireArtifactFiles = args.includes("--require-artifact-files");
const errors = [];

if (!file || args.includes("--help") || args.includes("-h")) {
  printUsage();
  process.exit(file ? 0 : 1);
}

const evidence = safeJson(file === "-" ? await readStdin() : await readFile(file, "utf8"));
const checks = new Map(Array.isArray(evidence?.checks) ? evidence.checks.map((check) => [check.name, check]) : []);
const requiredCheckNames = [
  "brain.gmailPanel.preOAuth",
  "brain.gmailKeywordFilters",
  "create.contextLightSurface",
  ...(preOAuthOnly
    ? []
    : [
        "brain.gmailConnectedResults",
        "brain.gmailSemanticResults",
        "create.gmailEvidenceDrawer",
        "create.gmailExport",
        "brain.gmailPostRevokeDelete",
      ]),
];
const proofArtifacts = collectProofArtifacts(evidence);

assert(Boolean(evidence), "Browser evidence must be valid JSON.");
assert(evidence?.ok !== false, "Browser evidence must not be failed evidence.");
assert(typeof evidence?.baseUrl === "string" && evidence.baseUrl.length > 0, "Browser evidence must include baseUrl.");
assert(typeof evidence?.userId === "string" && evidence.userId.length > 0, "Browser evidence must include userId.");
assert(typeof evidence?.workspaceId === "string" && evidence.workspaceId.length > 0, "Browser evidence must include workspaceId.");
assert(typeof evidence?.projectId === "string" && evidence.projectId.length > 0, "Browser evidence must include projectId.");
assert(typeof evidence?.sphereId === "string" && evidence.sphereId.length > 0, "Browser evidence must include sphereId.");
assert(typeof evidence?.capturedAt === "string" && evidence.capturedAt.length > 0, "Browser evidence must include capturedAt.");
assert(Array.isArray(evidence?.checks), "Browser evidence must include checks.");
assertNoUnsafeEvidence(evidence);
assertProofArtifacts(proofArtifacts, requiredCheckNames);
await assertArtifactFiles(proofArtifacts, { artifactRoot, requireArtifactFiles });

assertPreOAuthPanel(requireCheck("brain.gmailPanel.preOAuth"));
assertKeywordFilters(requireCheck("brain.gmailKeywordFilters"));
assertCreateSurface(requireCheck("create.contextLightSurface"));

if (!preOAuthOnly) {
  assertConnectedKeywordResults(requireCheck("brain.gmailConnectedResults"));
  assertSemanticResults(requireCheck("brain.gmailSemanticResults"));
  assertCreateEvidenceDrawer(requireCheck("create.gmailEvidenceDrawer"));
  assertCreateExport(requireCheck("create.gmailExport"));
  assertPostRevokeDelete(requireCheck("brain.gmailPostRevokeDelete"));
}

if (errors.length) {
  printErrors();
} else {
  console.log(
    JSON.stringify(
      {
        ok: true,
        file,
        browserEvidenceVerified: true,
        preOAuthOnly,
        checkCount: evidence.checks.length,
        proofArtifactCount: proofArtifacts.length,
        artifactFilesVerified: Boolean(artifactRoot),
      },
      null,
      2,
    ),
  );
}

function requireCheck(name) {
  const check = checks.get(name);

  assert(Boolean(check), `Browser evidence must include ${name}.`);

  return check ?? {};
}

function collectProofArtifacts(value) {
  return ["screenshots", "notes", "proofs"]
    .flatMap((key) => (Array.isArray(value?.[key]) ? value[key] : []))
    .filter((item) => item && typeof item === "object" && !Array.isArray(item));
}

function assertProofArtifacts(artifacts, requiredNames) {
  const proved = new Set();

  for (const artifact of artifacts) {
    if (!Array.isArray(artifact.proves)) {
      continue;
    }

    for (const name of artifact.proves) {
      if (typeof name === "string") {
        proved.add(name);
      }
    }
  }

  assert(artifacts.length > 0, "Browser evidence must include sanitized screenshots, notes, or proofs with proves lists.");

  for (const name of requiredNames) {
    assert(proved.has(name), `Browser evidence proof artifacts must cover ${name}.`);
  }
}

async function assertArtifactFiles(artifacts, options) {
  if (!options.artifactRoot) {
    assert(!options.requireArtifactFiles, "Browser evidence artifact file validation requires --artifact-root=<directory>.");
    return;
  }

  const root = resolve(options.artifactRoot);
  const allowedExtensions = new Set([".json", ".jpg", ".jpeg", ".md", ".png", ".txt", ".webp"]);

  for (const [index, artifact] of artifacts.entries()) {
    const artifactFile = typeof artifact.file === "string" ? artifact.file : typeof artifact.path === "string" ? artifact.path : "";

    assert(Boolean(artifactFile), `Browser evidence proof artifact ${index + 1} must include a file or path when --artifact-root is used.`);

    if (!artifactFile) {
      continue;
    }

    const target = resolve(root, artifactFile);
    const relativePath = relative(root, target);

    assert(
      Boolean(relativePath) && !relativePath.split(/[\\/]/).includes(".."),
      `${artifactFile} must stay inside the browser artifact root.`,
    );
    assert(allowedExtensions.has(extname(target).toLowerCase()), `${artifactFile} must be a png, jpg, webp, txt, md, or json artifact.`);

    try {
      const stats = await stat(target);

      assert(stats.isFile(), `${artifactFile} must be a file.`);
      assert(stats.size > 0, `${artifactFile} must not be empty.`);
    } catch (error) {
      errors.push(`${artifactFile} could not be read from artifact root: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function assertPreOAuthPanel(check) {
  assert(check.selectorTargetsPresent === true, "Pre-OAuth browser evidence must prove stable Gmail panel selector targets are present.");
  assert(check.gmailCardVisible === true, "Pre-OAuth browser evidence must show the Gmail card.");
  assert(check.gmailReadonlyVisible === true, "Pre-OAuth browser evidence must show gmail.readonly.");
  assert(check.restrictedPrivateCopyVisible === true, "Pre-OAuth browser evidence must show restricted/private Gmail copy.");
  assert(check.privacyCopyVisible === true, "Pre-OAuth browser evidence must show Gmail privacy copy.");
  assert(check.syncDisabledBeforeConnection === true, "Pre-OAuth browser evidence must show Sync disabled before connection.");
  assert(check.keywordSearchDisabledBeforeConnection === true, "Pre-OAuth browser evidence must show keyword search disabled before connection.");
  assert(check.semanticSearchDisabledBeforeConnection === true, "Pre-OAuth browser evidence must show semantic search disabled before connection.");
  assert(check.revokeDisabledBeforeConnection === true, "Pre-OAuth browser evidence must show Revoke disabled before connection.");
  assert(check.deleteDisabledBeforeConnection === true, "Pre-OAuth browser evidence must show Delete Gmail source disabled before connection.");
}

function assertKeywordFilters(check) {
  const required = ["from", "to", "subject", "label", "after", "before", "hasAttachment"];
  const fields = Array.isArray(check.fieldsVisible) ? new Set(check.fieldsVisible) : new Set();

  assert(check.selectorTargetsPresent === true, "Browser evidence must prove stable Gmail keyword filter selector targets are present.");
  assert(check.disclosureOpen === true, "Browser evidence must show the Gmail keyword filter disclosure open.");
  for (const field of required) {
    assert(fields.has(field), `Browser evidence must show the Gmail ${field} keyword filter.`);
  }
}

function assertCreateSurface(check) {
  assert(check.selectorTargetsPresent === true, "Browser evidence must prove stable Create surface selector targets are present.");
  assert(check.createSurfaceVisible === true, "Browser evidence must show the Create surface.");
  assert(check.contextLightStateVisible === true, "Browser evidence must show the context-light Create state before Gmail memory.");
  assert(check.detailsButtonsVisible === true, "Browser evidence must show Create details controls.");
  assert(check.exportPromptControlVisible === true, "Browser evidence must show the Create export prompt control.");
}

function assertConnectedKeywordResults(check) {
  assert(check.selectorTargetsPresent === true, "Post-OAuth browser evidence must prove stable connected Gmail selector targets are present.");
  assert(check.oauthCompleted === true, "Post-OAuth browser evidence must prove OAuth completed for the staged Gmail account.");
  assert(check.nangoAuthWebhookVerified === true, "Post-OAuth browser evidence must prove Nango delivered and Penny accepted the Gmail auth webhook.");
  assert(check.stagedAccountAliasPresent === true, "Post-OAuth browser evidence must record a staged Gmail account alias.");
  assert(check.nangoIntegrationKeyPresent === true, "Post-OAuth browser evidence must record the Nango Gmail integration key.");
  assert(check.nangoWebhookDeliveryStatusPresent === true, "Post-OAuth browser evidence must record Nango auth webhook delivery status.");
  assert(check.selectedAccountStateVisible === true, "Post-OAuth browser evidence must show the selected Gmail account state.");
  assert(check.connectedStateVisible === true, "Post-OAuth browser evidence must show Gmail connected state.");
  assert(check.gmailReadonlyVisible === true, "Post-OAuth browser evidence must show gmail.readonly.");
  assert(check.messageCountVisible === true, "Post-OAuth browser evidence must show message count.");
  assert(check.sourceCountVisible === true, "Post-OAuth browser evidence must show Gmail source count.");
  assert(check.syncEnabled === true, "Post-OAuth browser evidence must show Sync enabled.");
  assert(check.revokeEnabled === true, "Post-OAuth browser evidence must show Revoke enabled.");
  assert(check.deleteEnabled === true, "Post-OAuth browser evidence must show Delete Gmail source enabled.");
  assert(check.keywordResultSnippetVisible === true, "Post-OAuth browser evidence must show a safe keyword result snippet.");
  assert(check.keywordMessageRefVisible === true, "Post-OAuth browser evidence must show a keyword message ref.");
  assert(check.keywordThreadRefVisible === true, "Post-OAuth browser evidence must show a keyword thread ref.");
  assert(check.keywordSourceRefVisible === true, "Post-OAuth browser evidence must show a keyword source ref.");
}

function assertSemanticResults(check) {
  assert(check.selectorTargetsPresent === true, "Browser evidence must prove stable Gmail semantic result selector targets are present.");
  assert(check.resultVisible === true, "Browser evidence must show a Gmail semantic result row.");
  assert(check.groundingLabelVisible === true, "Browser evidence must show a semantic grounding label.");
  assert(check.scoreReasonVisible === true, "Browser evidence must show a semantic score reason.");
  assert(check.sourceRefVisible === true, "Browser evidence must show a semantic Gmail source ref.");
  assert(check.memoryRefVisible === true, "Browser evidence must show a semantic Brain memory ref.");
  assert(check.rawNumericScoreHidden === true, "Browser evidence must prove raw numeric semantic scores are hidden.");
}

function assertCreateEvidenceDrawer(check) {
  assert(check.selectorTargetsPresent === true, "Create evidence must prove stable evidence drawer selector targets are present.");
  assert(check.drawerVisible === true, "Browser evidence must show the Create evidence/details drawer.");
  assert(check.realGmailRefsOnlyWhenUsed === true, "Create evidence must show Gmail refs only when the option actually used them.");
  assert(
    check.gmailSourceRefVisible === true || check.gmailMemoryRefVisible === true,
    "Create evidence must show a Gmail source ref or Brain memory ref.",
  );
}

function assertCreateExport(check) {
  assert(check.selectorTargetsPresent === true, "Export evidence must prove stable export selector targets are present.");
  assert(check.exportVisible === true, "Browser evidence must show the exported prompt.");
  assert(check.gmailContextOnlyWhenUsed === true, "Export evidence must prove Gmail context appears only when used.");
  assert(check.unsafePrivacyClaimAbsent === true, "Export evidence must prove unsafe Gmail privacy claims are absent.");
  assert(check.rawEmailBodyAbsent === true, "Export evidence must prove raw Gmail body markers are absent.");
  assert(check.secretOrConnectTokenAbsent === true, "Export evidence must prove connect/session/token values are absent.");
  assert(check.unsupportedHumanReviewClaimAbsent === true, "Export evidence must prove unsupported human-review claims are absent.");
}

function assertPostRevokeDelete(check) {
  assert(check.selectorTargetsPresent === true, "Post-revoke/delete evidence must prove stable Gmail state selector targets are present.");
  assert(check.postRevokeStateVisible === true, "Browser evidence must show post-revoke state.");
  assert(check.syncBlockedAfterRevoke === true, "Browser evidence must prove sync stops after revoke.");
  assert(check.searchBlockedAfterRevoke === true, "Browser evidence must prove keyword search stops after revoke.");
  assert(check.semanticBlockedAfterRevoke === true, "Browser evidence must prove semantic search stops after revoke.");
  assert(check.deletedSourceAbsentFromBrainRetrieval === true, "Browser evidence must prove deleted Gmail source is absent from Brain retrieval.");
  assert(check.deletedSourceAbsentFromCreateEvidence === true, "Browser evidence must prove deleted Gmail source is absent from Create evidence.");
  assert(check.deletedSourceAbsentFromExport === true, "Browser evidence must prove deleted Gmail source is absent from exported prompt.");
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
    "rawScore",
    "refreshToken",
    "score",
    "sessionToken",
    "token",
  ]);
  const allowedKeys = new Set(["scoreReasonVisible", "rawNumericScoreHidden", "secretOrConnectTokenAbsent"]);
  const unsafeValuePattern =
    /(https:\/\/connect\.[^\s"]+|session-token|gmail-session-token|access_token|refresh_token|credentialRef|plainTextBody|rawBody|BEGIN PRIVATE KEY)/i;
  const unsafePrivacyClaimPattern =
    /global training|hidden memory|private inbox|background Gmail|before consent|unrestricted mailbox scan/i;

  walk(value, "$", (item, path) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      for (const key of Object.keys(item)) {
        if (unsafeKeys.has(key) && !allowedKeys.has(key)) {
          errors.push(`${path}.${key} must not be present in browser evidence.`);
        }
      }
    }

    if (typeof item === "string" && unsafeValuePattern.test(item)) {
      errors.push(`${path} looks like it contains raw Gmail, credential, connect, or token data.`);
    }

    if (typeof item === "string" && unsafePrivacyClaimPattern.test(item)) {
      errors.push(`${path} looks like it contains an unsafe Gmail privacy claim.`);
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
    errors.push("Browser evidence file must contain parseable JSON.");

    return null;
  }
}

async function readStdin() {
  let raw = "";

  for await (const chunk of process.stdin) {
    raw += chunk;
  }

  return raw;
}

function printErrors() {
  console.error(`Gmail browser evidence failed ${errors.length} check${errors.length === 1 ? "" : "s"}:`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
}

function printUsage() {
  console.error("Usage: node scripts/verify-gmail-browser-evidence.mjs <evidence.json|-> [--pre-oauth-only] [--artifact-root=<dir>] [--require-artifact-files]");
}

function optionValue(name) {
  return args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}
