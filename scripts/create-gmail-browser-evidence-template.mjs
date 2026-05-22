#!/usr/bin/env node

import { writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const preOAuthOnly = args.includes("--pre-oauth-only");
const outFile = optionValue("--out");
const stagingRunId = optionValue("--staging-run-id");
const safeStagingRunIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/;
const safeEvidenceScopeIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const errors = [];

if (args.includes("--help") || args.includes("-h")) {
  printUsage();
  process.exit(0);
}

if (!preOAuthOnly) {
  assert(Boolean(stagingRunId), "Full browser evidence templates require --staging-run-id=<safe-opaque-slug>.");
}

if (stagingRunId) {
  assert(safeStagingRunIdPattern.test(stagingRunId), "stagingRunId must be a safe opaque slug.");
}

for (const option of ["--user-id", "--workspace-id", "--project-id", "--sphere-id"]) {
  assertSafeScopeOption(option);
}

if (errors.length) {
  printErrors();
  process.exit(1);
}

const evidence = buildEvidenceTemplate({
  preOAuthOnly,
  stagingRunId,
  baseUrl: optionValue("--base-url") || "https://penny-staging.example.test",
  userId: optionValue("--user-id") || "REPLACE_WITH_USER_ID",
  workspaceId: optionValue("--workspace-id") || "REPLACE_WITH_WORKSPACE_ID",
  projectId: optionValue("--project-id") || "REPLACE_WITH_PROJECT_ID",
  sphereId: optionValue("--sphere-id") || "REPLACE_WITH_SPHERE_ID",
});
const serialized = `${JSON.stringify(evidence, null, 2)}\n`;

if (outFile) {
  await writeFile(outFile, serialized, "utf8");
} else {
  process.stdout.write(serialized);
}

function buildEvidenceTemplate(options) {
  const requiredChecks = [
    "brain.gmailPanel.preOAuth",
    "brain.gmailKeywordFilters",
    "create.contextLightSurface",
    ...(options.preOAuthOnly
      ? []
      : [
          "brain.gmailConnectedResults",
          "brain.gmailSemanticResults",
          "create.gmailEvidenceDrawer",
          "create.gmailExport",
          "brain.gmailPostRevokeDelete",
        ]),
  ];

  return removeUndefined({
    ok: true,
    baseUrl: options.baseUrl,
    userId: options.userId,
    workspaceId: options.workspaceId,
    projectId: options.projectId,
    sphereId: options.sphereId,
    stagingRunId: options.stagingRunId || undefined,
    capturedAt: new Date().toISOString(),
    notes: [
      {
        label: "Sanitized browser evidence notes",
        file: "notes/gmail-browser-evidence.md",
        proves: requiredChecks,
      },
    ],
    screenshots: requiredChecks.map((name) => ({
      label: name,
      file: `screenshots/${name.replaceAll(".", "-")}.png`,
      proves: [name],
    })),
    checks: [
      preOAuthPanel(),
      keywordFilters(),
      createSurface(),
      ...(options.preOAuthOnly ? [] : [connectedResults(), semanticResults(), createEvidenceDrawer(), createExport(), postRevokeDelete()]),
    ],
  });
}

function assertSafeScopeOption(option) {
  const value = optionValue(option);

  if (!value) {
    return;
  }

  assert(isSafeEvidenceScopeId(value) && !/^REPLACE_WITH_/i.test(value), `${option} must be a safe opaque scope id.`);
}

function isSafeEvidenceScopeId(value) {
  return typeof value === "string" && safeEvidenceScopeIdPattern.test(value.trim());
}

function preOAuthPanel() {
  return {
    name: "brain.gmailPanel.preOAuth",
    selectorTargetsPresent: false,
    gmailCardVisible: false,
    gmailReadonlyVisible: false,
    restrictedPrivateCopyVisible: false,
    privacyCopyVisible: false,
    syncDisabledBeforeConnection: false,
    keywordSearchDisabledBeforeConnection: false,
    semanticSearchDisabledBeforeConnection: false,
    revokeDisabledBeforeConnection: false,
    deleteDisabledBeforeConnection: false,
  };
}

function keywordFilters() {
  return {
    name: "brain.gmailKeywordFilters",
    selectorTargetsPresent: false,
    disclosureOpen: false,
    fieldsVisible: ["from", "to", "subject", "label", "after", "before", "hasAttachment"],
  };
}

function createSurface() {
  return {
    name: "create.contextLightSurface",
    selectorTargetsPresent: false,
    createSurfaceVisible: false,
    contextLightStateVisible: false,
    detailsButtonsVisible: false,
    exportPromptControlVisible: false,
  };
}

function connectedResults() {
  return {
    name: "brain.gmailConnectedResults",
    selectorTargetsPresent: false,
    oauthCompleted: false,
    nangoAuthWebhookVerified: false,
    stagedAccountAliasPresent: false,
    nangoIntegrationKeyPresent: false,
    nangoWebhookDeliveryStatusPresent: false,
    selectedAccountStateVisible: false,
    syncCompleted: false,
    keywordSearchRan: false,
    connectedStateVisible: false,
    gmailReadonlyVisible: false,
    messageCountVisible: false,
    sourceCountVisible: false,
    syncEnabled: false,
    revokeEnabled: false,
    deleteEnabled: false,
    keywordResultSnippetVisible: false,
    keywordMessageRefVisible: false,
    keywordThreadRefVisible: false,
    keywordSourceRefVisible: false,
    keywordSelectedSourceRefsMatched: false,
  };
}

function semanticResults() {
  return {
    name: "brain.gmailSemanticResults",
    selectorTargetsPresent: false,
    semanticSearchRan: false,
    resultVisible: false,
    groundingLabelVisible: false,
    scoreReasonVisible: false,
    sourceRefVisible: false,
    memoryRefVisible: false,
    semanticSelectedSourceRefsMatched: false,
    rawNumericScoreHidden: false,
  };
}

function createEvidenceDrawer() {
  return {
    name: "create.gmailEvidenceDrawer",
    selectorTargetsPresent: false,
    createRunCompleted: false,
    evidenceDrawerOpened: false,
    drawerVisible: false,
    personalOptionVisible: false,
    criticalOptionVisible: false,
    selectedOptionGmailEvidenceVisible: false,
    selectedOptionGmailRefsVisible: false,
    realGmailRefsOnlyWhenUsed: false,
    gmailSourceRefVisible: false,
    gmailMemoryRefVisible: false,
  };
}

function createExport() {
  return {
    name: "create.gmailExport",
    selectorTargetsPresent: false,
    exportPromptGenerated: false,
    exportVisible: false,
    gmailContextOnlyWhenUsed: false,
    selectedOptionHistoryVisible: false,
    personalContextSectionVisible: false,
    sourceMemoryEvidenceSectionVisible: false,
    gmailEvidenceInPersonalContext: false,
    gmailEvidenceInSourceMemorySection: false,
    unsafePrivacyClaimAbsent: false,
    rawEmailBodyAbsent: false,
    secretOrConnectTokenAbsent: false,
    unsupportedHumanReviewClaimAbsent: false,
  };
}

function postRevokeDelete() {
  return {
    name: "brain.gmailPostRevokeDelete",
    selectorTargetsPresent: false,
    revokeCompleted: false,
    deleteCompleted: false,
    postRevokeStateVisible: false,
    revokedStateVisible: false,
    deletedSourceCountZero: false,
    syncBlockedAfterRevoke: false,
    searchBlockedAfterRevoke: false,
    semanticBlockedAfterRevoke: false,
    deletedSourceAbsentFromBrainRetrieval: false,
    deletedSourceAbsentFromCreateEvidence: false,
    deletedSourceAbsentFromExport: false,
  };
}

function removeUndefined(value) {
  if (Array.isArray(value)) {
    return value.map(removeUndefined);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, removeUndefined(item)]),
    );
  }

  return value;
}

function optionValue(name) {
  const prefix = `${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix));

  return value ? value.slice(prefix.length).trim() : "";
}

function assert(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function printErrors() {
  console.error(`Gmail browser evidence template failed ${errors.length} check${errors.length === 1 ? "" : "s"}:`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
}

function printUsage() {
  console.error(
    [
      "Usage: node scripts/create-gmail-browser-evidence-template.mjs [--pre-oauth-only] [--staging-run-id=<safe-slug>] [--out=<file>]",
      "Optional scope fields: --base-url=<url> --user-id=<id> --workspace-id=<id> --project-id=<id> --sphere-id=<id>",
      "Full browser evidence templates require --staging-run-id. Pre-OAuth UI preflight templates do not.",
    ].join("\n"),
  );
}
