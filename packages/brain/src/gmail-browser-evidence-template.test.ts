import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const fullCheckNames = [
  "brain.gmailPanel.preOAuth",
  "brain.gmailKeywordFilters",
  "create.contextLightSurface",
  "brain.gmailConnectedResults",
  "brain.gmailSemanticResults",
  "create.gmailEvidenceDrawer",
  "create.gmailExport",
  "brain.gmailPostRevokeDelete",
];
const preOAuthCheckNames = ["brain.gmailPanel.preOAuth", "brain.gmailKeywordFilters", "create.contextLightSurface"];
const scopeArgs = [
  "--base-url=https://penny-staging.example.test",
  "--user-id=gmail-smoke-user",
  "--workspace-id=gmail-smoke-workspace",
  "--project-id=gmail-smoke-project",
  "--sphere-id=gmail-smoke-sphere",
];

test("Gmail browser evidence template generates full proof scaffold that matches the verifier", () => {
  const evidence = runTemplate("--staging-run-id=gmail-staging-template-test", ...scopeArgs);

  assert.equal(evidence.stagingRunId, "gmail-staging-template-test");
  assert.deepEqual(
    evidence.checks.map((check) => check.name),
    fullCheckNames,
  );
  assert.deepEqual(
    evidence.screenshots.map((screenshot) => screenshot.proves),
    fullCheckNames.map((name) => [name]),
  );
  assert.deepEqual(evidence.notes[0]?.proves, fullCheckNames);
  assert.equal(allBooleanCheckFieldsAre(evidence, false), true);

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /Pre-OAuth browser evidence must prove stable Gmail panel selector targets are present/);

  setAllBooleanCheckFields(evidence, true);

  const output = execFileSync(process.execPath, ["scripts/verify-gmail-browser-evidence.mjs", "-"], {
    cwd: repoRoot,
    encoding: "utf8",
    input: JSON.stringify(evidence),
  });
  const payload = JSON.parse(output) as { ok: boolean; browserEvidenceVerified: boolean; checkCount: number; proofArtifactCount: number };

  assert.equal(payload.ok, true);
  assert.equal(payload.browserEvidenceVerified, true);
  assert.equal(payload.checkCount, 8);
  assert.equal(payload.proofArtifactCount, 9);
});

test("Gmail browser evidence template generates pre-OAuth scaffold without requiring a run id", () => {
  const evidence = runTemplate("--pre-oauth-only", ...scopeArgs);

  assert.equal(Object.hasOwn(evidence, "stagingRunId"), false);
  assert.deepEqual(
    evidence.checks.map((check) => check.name),
    preOAuthCheckNames,
  );
  assert.deepEqual(evidence.notes[0]?.proves, preOAuthCheckNames);
  assert.equal(allBooleanCheckFieldsAre(evidence, false), true);

  setAllBooleanCheckFields(evidence, true);

  const output = execFileSync(process.execPath, ["scripts/verify-gmail-browser-evidence.mjs", "-", "--pre-oauth-only"], {
    cwd: repoRoot,
    encoding: "utf8",
    input: JSON.stringify(evidence),
  });
  const payload = JSON.parse(output) as { ok: boolean; preOAuthOnly: boolean; checkCount: number; proofArtifactCount: number };

  assert.equal(payload.ok, true);
  assert.equal(payload.preOAuthOnly, true);
  assert.equal(payload.checkCount, 3);
  assert.equal(payload.proofArtifactCount, 4);
});

test("Gmail browser evidence template requires safe run ids for full proof", () => {
  const missing = runTemplateExpectingFailure();
  const unsafe = runTemplateExpectingFailure("--staging-run-id=staged-account@example.com");

  assert.match(missing, /Full browser evidence templates require --staging-run-id/);
  assert.match(unsafe, /stagingRunId must be a safe opaque slug/);
  assert.doesNotMatch(unsafe, /staged-account@example\.com/);
});

function runTemplate(...args: string[]) {
  const output = execFileSync(process.execPath, ["scripts/create-gmail-browser-evidence-template.mjs", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  return JSON.parse(output) as BrowserEvidenceTemplate;
}

function runTemplateExpectingFailure(...args: string[]) {
  try {
    execFileSync(process.execPath, ["scripts/create-gmail-browser-evidence-template.mjs", ...args], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (caught) {
    const error = caught as { status?: number; stderr?: Buffer | string };

    assert.equal(error.status, 1);

    return String(error.stderr);
  }

  assert.fail("Expected Gmail browser evidence template generation to fail.");
}

function runVerifierExpectingFailure(evidence: BrowserEvidenceTemplate) {
  try {
    execFileSync(process.execPath, ["scripts/verify-gmail-browser-evidence.mjs", "-"], {
      cwd: repoRoot,
      encoding: "utf8",
      input: JSON.stringify(evidence),
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (caught) {
    const error = caught as { status?: number; stderr?: Buffer | string };

    assert.equal(error.status, 1);

    return String(error.stderr);
  }

  assert.fail("Expected Gmail browser evidence verifier to reject the blank template.");
}

function allBooleanCheckFieldsAre(evidence: BrowserEvidenceTemplate, expected: boolean) {
  return evidence.checks.every((check) =>
    Object.entries(check).every(([, value]) => typeof value !== "boolean" || value === expected),
  );
}

function setAllBooleanCheckFields(evidence: BrowserEvidenceTemplate, value: boolean) {
  for (const check of evidence.checks) {
    for (const [key, current] of Object.entries(check)) {
      if (typeof current === "boolean") {
        check[key] = value;
      }
    }
  }
}

type BrowserEvidenceTemplate = {
  stagingRunId?: string;
  checks: Array<Record<string, unknown> & { name: string }>;
  notes: Array<{ proves: string[] }>;
  screenshots: Array<{ proves: string[] }>;
};
