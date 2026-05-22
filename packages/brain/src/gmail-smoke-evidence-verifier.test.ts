import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const verifier = ["scripts/verify-gmail-smoke-evidence.mjs", "-", "--connect-preflight"];

test("Gmail smoke evidence verifier accepts sanitized non-destructive evidence", () => {
  const output = execFileSync(process.execPath, verifier, {
    cwd: repoRoot,
    encoding: "utf8",
    input: JSON.stringify(validEvidence()),
  });
  const payload = JSON.parse(output) as { ok: boolean; connectPreflightVerified: boolean; stepCount: number };

  assert.equal(payload.ok, true);
  assert.equal(payload.connectPreflightVerified, true);
  assert.equal(payload.stepCount, 12);
});

test("Gmail smoke evidence verifier accepts expected sanitized partial failure evidence", () => {
  const output = execFileSync(process.execPath, verifier, {
    cwd: repoRoot,
    encoding: "utf8",
    input: JSON.stringify(expectedPartialFailureEvidence()),
  });
  const payload = JSON.parse(output) as { ok: boolean; connectPreflightVerified: boolean; stepCount: number };

  assert.equal(payload.ok, true);
  assert.equal(payload.connectPreflightVerified, true);
  assert.equal(payload.stepCount, 12);
});

test("Gmail smoke evidence verifier can require full keyword filter coverage", () => {
  const output = execFileSync(process.execPath, [...verifier, "--require-keyword-filters"], {
    cwd: repoRoot,
    encoding: "utf8",
    input: JSON.stringify(keywordFilterEvidence()),
  });
  const payload = JSON.parse(output) as { ok: boolean; keywordFilterCoverageRequired: boolean };

  assert.equal(payload.ok, true);
  assert.equal(payload.keywordFilterCoverageRequired, true);
});

test("Gmail smoke evidence verifier rejects missing keyword filter coverage when required", () => {
  const failure = runVerifierExpectingFailure(validEvidence(), [...verifier, "--require-keyword-filters"]);

  assert.match(failure, /Keyword search must prove from filter coverage/);
  assert.match(failure, /Keyword search with sync=true must prove from filter coverage/);
});

test("Gmail smoke evidence verifier rejects weak keyword result shape evidence", () => {
  const evidence = validEvidence();

  for (const step of evidence.steps.filter((item) => item.step === "keywordSearch" || item.step === "keywordSearch.syncExplicit")) {
    delete step.resultShapeVerified;
    delete step.messageRefPresent;
    delete step.threadRefPresent;
    delete step.sourceRefPresent;
    delete step.snippetPresent;
    delete step.rawBodyAbsent;
  }

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /Keyword search evidence must prove the safe result shape/);
  assert.match(failure, /Keyword search with sync=true evidence must prove the safe result shape/);
  assert.match(failure, /Keyword search evidence must include Gmail message refs/);
  assert.match(failure, /Keyword search evidence must include Gmail thread refs/);
  assert.match(failure, /Keyword search evidence must include Gmail source refs/);
  assert.match(failure, /Keyword search evidence must include safe snippets/);
  assert.match(failure, /Keyword search evidence must not include raw Gmail body fields/);
});

test("Gmail smoke evidence verifier rejects unexpected partial failures", () => {
  const evidence = validEvidence();
  const sync = evidence.steps.find((step) => step.step === "sync") as Record<string, unknown>;

  sync.partialFailureCount = 1;

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /Sync must have zero unexpected partial failures/);
});

test("Gmail smoke evidence verifier rejects repeated sync without cursor evidence", () => {
  const evidence = validEvidence();
  const repeat = evidence.steps.find((step) => step.step === "sync.repeat") as Record<string, unknown>;

  delete repeat.cursorPresent;
  delete repeat.historyIdPresent;

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /Repeated sync must include cursor or historyId evidence/);
});

test("Gmail smoke evidence verifier rejects missing synced source privacy evidence", () => {
  const evidence = validEvidence();
  const afterSync = evidence.steps.find((step) => step.step === "status.afterSync") as Record<string, unknown>;

  afterSync.syncedSourceCount = 0;
  afterSync.syncedSourceTrainingUseFalse = false;
  afterSync.syncedSourceRawContentStoredFalse = false;
  afterSync.syncedSourcePrivateUserMemory = false;
  afterSync.syncedSourceRetrievalEnabled = false;
  afterSync.brainProfileGmailSourceCount = 0;
  afterSync.brainProfileTrainingUseFalse = false;
  afterSync.brainProfileRawRetentionFalse = false;
  afterSync.brainProfilePrivateVisibility = false;

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /Status after sync must prove at least 1 synced Gmail source privacy record/);
  assert.match(failure, /Synced Gmail source privacy must prove trainingUse=false/);
  assert.match(failure, /Synced Gmail source privacy must prove rawContentStored=false/);
  assert.match(failure, /Synced Gmail source privacy must prove private user memory visibility/);
  assert.match(failure, /Synced Gmail source privacy must prove retrieval access is enabled/);
  assert.match(failure, /Brain profile must prove at least 1 Gmail source privacy record/);
  assert.match(failure, /Brain profile Gmail source privacy must prove trainingUse=false/);
  assert.match(failure, /Brain profile Gmail source privacy must prove rawRetention=false/);
  assert.match(failure, /Brain profile Gmail source privacy must prove private visibility/);
});

test("Gmail smoke evidence verifier rejects missing selected source proof", () => {
  const evidence = validEvidence();
  const afterSync = evidence.steps.find((step) => step.step === "status.afterSync") as Record<string, unknown>;

  delete afterSync.selectedSourceRefCount;
  delete afterSync.brainProfileMatchedSelectedSourceRefs;

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /Status after sync must prove at least 1 selected Gmail source ref/);
  assert.match(failure, /Brain profile Gmail source privacy must match selected Gmail source refs/);
});

test("Gmail smoke evidence verifier rejects missing search source proof", () => {
  const evidence = validEvidence();
  const keyword = evidence.steps.find((step) => step.step === "keywordSearch") as Record<string, unknown>;
  const keywordSync = evidence.steps.find((step) => step.step === "keywordSearch.syncExplicit") as Record<string, unknown>;
  const semantic = evidence.steps.find((step) => step.step === "semanticSearch") as Record<string, unknown>;

  delete keyword.selectedSourceRefsMatched;
  delete keywordSync.selectedSourceRefsMatched;
  delete semantic.selectedSourceRefsMatched;

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /Keyword search result refs must match selected Gmail source refs/);
  assert.match(failure, /Keyword search with sync=true result refs must match selected Gmail source refs/);
  assert.match(failure, /Semantic search result refs must match selected Gmail source refs/);
});

test("Gmail smoke evidence verifier rejects missing Create selected-ref proof", () => {
  const evidence = validEvidence();
  const semantic = evidence.steps.find((step) => step.step === "semanticSearch") as Record<string, unknown>;
  const create = evidence.steps.find((step) => step.step === "create.first") as Record<string, unknown>;
  const refined = evidence.steps.find((step) => step.step === "create.refined") as Record<string, unknown>;

  delete semantic.selectedMemoryRefCount;
  delete create.selectedSemanticMemoryRefsMatched;
  delete create.selectedSemanticSourceRefsMatched;
  delete create.rankedCandidateSelectedSemanticMemoryRefsMatched;
  delete create.rankedCandidateSelectedSemanticSourceRefsMatched;
  delete refined.selectedSemanticMemoryRefsMatched;
  delete refined.selectedSemanticSourceRefsMatched;

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /Semantic search must record selected Gmail memory refs for Create proof/);
  assert.match(failure, /Create memory refs must match selected semantic Gmail memory refs/);
  assert.match(failure, /Create source refs must match selected Gmail source refs/);
  assert.match(failure, /Create Brain Ranker candidates must match selected semantic Gmail memory refs/);
  assert.match(failure, /Create Brain Ranker candidates must match selected Gmail source refs/);
  assert.match(failure, /Create refinement memory refs must match selected semantic Gmail memory refs/);
  assert.match(failure, /Create refinement source refs must match selected Gmail source refs/);
});

test("Gmail smoke evidence verifier rejects missing staged account identity proof", () => {
  const evidence = validEvidence();
  const initial = evidence.steps.find((step) => step.step === "status.initial") as Record<string, unknown>;

  delete initial.selectedAccountStateVisible;
  delete initial.targetConnectionIdPresent;
  delete initial.targetExternalConnectionIdPresent;
  delete initial.targetProviderConfigKeyPresent;
  delete initial.targetAccountAliasPresent;

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /Initial status must prove the selected Gmail account state is visible/);
  assert.match(failure, /Initial status must prove the target Penny Gmail connection id is present/);
  assert.match(failure, /Initial status must prove the target Nango connection id is present/);
  assert.match(failure, /Initial status must prove the target Nango provider config key is present/);
  assert.match(failure, /Initial status must prove staged account alias metadata is present/);
});

test("Gmail smoke evidence verifier rejects raw connect links or session tokens", () => {
  const evidence = validEvidence();
  const connectStep = evidence.steps.find((step) => step.step === "connect.preflight") as Record<string, unknown>;

  connectStep.connectLink = "https://connect.nango.dev/session-token";
  connectStep.token = "gmail-session-token";

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /connectLink must not be present/);
  assert.match(failure, /token must not be present/);
  assert.match(failure, /raw connect\/session\/token value/);
});

test("Gmail smoke evidence verifier rejects unsafe key variants without raw values", () => {
  const evidence = validEvidence();
  const connectStep = evidence.steps.find((step) => step.step === "connect.preflight") as Record<string, unknown>;
  const semantic = evidence.steps.find((step) => step.step === "semanticSearch") as Record<string, unknown>;
  const exported = evidence.steps.find((step) => step.step === "create.export") as Record<string, unknown>;

  connectStep.access_token = "present";
  connectStep.CREDENTIAL_REF = "present";
  semantic["plain-text-body"] = "absent";
  exported.raw_body = "absent";

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /access_token must not be present/);
  assert.match(failure, /CREDENTIAL_REF must not be present/);
  assert.match(failure, /plain-text-body must not be present/);
  assert.match(failure, /raw_body must not be present/);
});

test("Gmail smoke evidence verifier rejects raw body markers in harmless-looking values", () => {
  const evidence = validEvidence();
  const exported = evidence.steps.find((step) => step.step === "create.export") as Record<string, unknown>;

  exported.operatorNote = "Copied row showed raw email body marker.";

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /raw connect\/session\/token value/);
});

test("Gmail smoke evidence verifier rejects unsafe run ids without echoing them", () => {
  const evidence = validEvidence();

  evidence.stagingRunId = "staged-account@example.com";

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /Smoke evidence stagingRunId must be a safe opaque slug/);
  assert.doesNotMatch(failure, /staged-account@example\.com/);
});

test("Gmail smoke evidence verifier rejects unsafe scope ids without echoing them", () => {
  const evidence = validEvidence();

  evidence.userId = "staged-account@example.com";

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /Smoke evidence userId must be a safe opaque scope id/);
  assert.doesNotMatch(failure, /staged-account@example\.com/);
});

test("Gmail smoke evidence verifier rejects unknown smoke step rows", () => {
  const evidence = validEvidence();

  evidence.steps.push({
    step: "legacy.gmail.browserProof",
    ok: true,
  });

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /Smoke evidence step 13 name must match an allowed smoke step/);
});

test("Gmail smoke evidence verifier rejects duplicate smoke step rows", () => {
  const evidence = validEvidence();

  evidence.steps.push({ ...evidence.steps[1] });

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /Smoke evidence must include status\.initial only once/);
});

test("Gmail smoke evidence verifier rejects weak semantic result shape evidence", () => {
  const evidence = validEvidence();
  const semantic = evidence.steps.find((step) => step.step === "semanticSearch") as Record<string, unknown>;

  delete semantic.resultShapeVerified;
  delete semantic.subjectPresent;
  delete semantic.senderPresent;
  delete semantic.dateFieldPresent;
  delete semantic.messageRefPresent;
  delete semantic.threadRefPresent;
  delete semantic.snippetPresent;
  delete semantic.sourceRefPresent;
  delete semantic.memoryRefPresent;
  delete semantic.scoreReasonPresent;
  delete semantic.rawBodyAbsent;
  delete semantic.groundingLabels;

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /Semantic search evidence must prove the safe result shape/);
  assert.match(failure, /Semantic search evidence must include subjects/);
  assert.match(failure, /Semantic search evidence must include senders/);
  assert.match(failure, /Semantic search evidence must include date fields/);
  assert.match(failure, /Semantic search evidence must include Gmail message refs/);
  assert.match(failure, /Semantic search evidence must include Gmail thread refs/);
  assert.match(failure, /Semantic search evidence must include safe snippets/);
  assert.match(failure, /Semantic search evidence must include Gmail source refs/);
  assert.match(failure, /Semantic search evidence must include Brain memory refs/);
  assert.match(failure, /Semantic search evidence must include score reasons/);
  assert.match(failure, /Semantic search evidence must not include raw Gmail body fields/);
  assert.match(failure, /Semantic search evidence must include groundingLabels/);
});

test("Gmail smoke evidence verifier rejects weak Create Gmail evidence", () => {
  const evidence = validEvidence();
  const create = evidence.steps.find((step) => step.step === "create.first") as Record<string, unknown>;

  create.selectedOptionCount = 1;
  create.selectedLenses = ["Personal"];
  create.criticalOptionPresent = false;
  create.gmailMemoryEvidencePresent = false;
  create.gmailSourceEvidencePresent = false;
  create.personalOptionExpectedEvidencePresent = false;
  create.criticalOptionExpectedEvidencePresent = false;

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /Create must select both Personal and Critical options/);
  assert.match(failure, /Create selectedLenses must include Critical/);
  assert.match(failure, /Create must include a Critical option/);
  assert.match(failure, /Create must include Gmail evidence in memory refs/);
  assert.match(failure, /Create must include Gmail evidence in source refs/);
  assert.match(failure, /Create Personal option must include the expected Gmail evidence text/);
  assert.match(failure, /Create Critical option must include the expected Gmail evidence text/);
});

test("Gmail smoke evidence verifier rejects weak Brain Ranker evidence", () => {
  const evidence = validEvidence();
  const create = evidence.steps.find((step) => step.step === "create.first") as Record<string, unknown>;

  create.rankedCandidateCount = 4;
  create.nextBestMoveGrounded = false;
  create.rankedCandidateGmailMemoryEvidencePresent = false;
  create.rankedCandidateGmailSourceEvidencePresent = false;

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /Create must expose five Brain Ranker candidates/);
  assert.match(failure, /Create Brain Ranker next-best move must be grounded by Gmail memory/);
  assert.match(failure, /Create Brain Ranker candidates must include Gmail memory evidence/);
  assert.match(failure, /Create Brain Ranker candidates must include Gmail source evidence/);
});

test("Gmail smoke evidence verifier rejects weak Create refinement evidence", () => {
  const evidence = validEvidence();
  const refined = evidence.steps.find((step) => step.step === "create.refined") as Record<string, unknown>;

  refined.artifactPresent = false;
  refined.verificationPresent = false;
  refined.judgmentEventPresent = false;
  refined.selectedOptionCount = 1;
  refined.selectedLenses = ["Personal"];
  refined.selectedOptionsMatched = false;
  refined.gmailMemoryEvidencePresent = false;
  refined.gmailSourceEvidencePresent = false;
  refined.artifactExpectedEvidencePresent = false;
  refined.rawEmailBodyAbsent = false;
  refined.secretOrConnectTokenAbsent = false;
  refined.unsupportedHumanReviewClaimAbsent = false;

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /Create refinement must include an artifact/);
  assert.match(failure, /Create refinement must include verification/);
  assert.match(failure, /Create refinement must include a judgment event/);
  assert.match(failure, /Create refinement must select both Personal and Critical options/);
  assert.match(failure, /Create selectedLenses must include Critical/);
  assert.match(failure, /Create refinement must preserve the selected Gmail option ids/);
  assert.match(failure, /Create refinement must include Gmail evidence in memory refs/);
  assert.match(failure, /Create refinement must include Gmail evidence in source refs/);
  assert.match(failure, /Create refinement artifact must include the expected Gmail evidence text/);
  assert.match(failure, /Create refinement must not include raw Gmail body markers/);
  assert.match(failure, /Create refinement must not include connect\/session\/token values/);
  assert.match(failure, /Create refinement must not include unsupported human-review claims/);
});

test("Gmail smoke evidence verifier rejects weak Create export privacy evidence", () => {
  const evidence = validEvidence();
  const exported = evidence.steps.find((step) => step.step === "create.export") as Record<string, unknown>;

  exported.rawEmailBodyAbsent = false;
  exported.secretOrConnectTokenAbsent = false;
  exported.unsupportedHumanReviewClaimAbsent = false;

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /Export prompt must not include raw Gmail body markers/);
  assert.match(failure, /Export prompt must not include connect\/session\/token values/);
  assert.match(failure, /Export prompt must not include unsupported human-review claims/);
});

test("Gmail smoke evidence verifier rejects missing export context proof", () => {
  const evidence = validEvidence();
  const exported = evidence.steps.find((step) => step.step === "create.export") as Record<string, unknown>;

  delete exported.selectedOptionHistoryPresent;
  delete exported.personalContextSectionPresent;
  delete exported.sourceMemoryEvidenceSectionPresent;
  delete exported.personalContextExpectedEvidencePresent;
  delete exported.sourceMemoryEvidenceExpectedEvidencePresent;

  const failure = runVerifierExpectingFailure(evidence);

  assert.match(failure, /Export prompt must include selected option history/);
  assert.match(failure, /Export prompt must include a personal context section/);
  assert.match(failure, /Export prompt must include a source\/memory evidence section/);
  assert.match(failure, /Export prompt personal context must include the expected Gmail-derived context/);
  assert.match(failure, /Export prompt source\/memory evidence must include the expected Gmail-derived context/);
});

test("Gmail smoke evidence verifier accepts connect preflight-only evidence", () => {
  const output = execFileSync(process.execPath, ["scripts/verify-gmail-smoke-evidence.mjs", "-", "--connect-preflight-only"], {
    cwd: repoRoot,
    encoding: "utf8",
    input: JSON.stringify(connectPreflightOnlyEvidence()),
  });
  const payload = JSON.parse(output) as { ok: boolean; connectPreflightOnly: boolean; connectPreflightVerified: boolean; stepCount: number };

  assert.equal(payload.ok, true);
  assert.equal(payload.connectPreflightOnly, true);
  assert.equal(payload.connectPreflightVerified, true);
  assert.equal(payload.stepCount, 2);
});

test("Gmail smoke evidence verifier accepts destructive revoke and delete evidence", () => {
  const output = execFileSync(process.execPath, [...verifier, "--destructive"], {
    cwd: repoRoot,
    encoding: "utf8",
    input: JSON.stringify(destructiveEvidence()),
  });
  const payload = JSON.parse(output) as { ok: boolean; destructive: boolean };

  assert.equal(payload.ok, true);
  assert.equal(payload.destructive, true);
});

test("Gmail smoke evidence verifier rejects destructive delete evidence without semantic target proof", () => {
  const evidence = destructiveEvidence();
  const semantic = evidence.steps.find((step) => step.step === "semanticSearch") as Record<string, unknown>;
  const deleted = evidence.steps.find((step) => step.step === "deleteSource") as Record<string, unknown>;

  semantic.deleteTargetMatchedSemanticResult = false;
  semantic.deleteTargetMemoryIdCount = 0;
  deleted.sourceIdPresent = false;
  deleted.brainSourceIdPresent = false;
  deleted.trackedDeletedMemoryIdCount = 0;

  const failure = runVerifierExpectingFailure(evidence, [...verifier, "--destructive"]);

  assert.match(failure, /Destructive evidence must prove the delete target matched a semantic Gmail result/);
  assert.match(failure, /Destructive evidence must track at least one semantic Gmail memory id/);
  assert.match(failure, /Delete evidence must include a staged Gmail source id/);
  assert.match(failure, /Delete evidence must include the linked Brain source id/);
  assert.match(failure, /Delete evidence must include tracked Gmail memory ids/);
});

test("Gmail smoke evidence verifier rejects destructive delete evidence without Create ranker absence proof", () => {
  const evidence = destructiveEvidence();
  const deleted = evidence.steps.find((step) => step.step === "deleteSource") as Record<string, unknown>;

  deleted.createAfterDeleteRankedCandidateCount = 4;
  deleted.createRankedCandidateDeletedSourceAbsent = false;
  deleted.createRankedCandidateDeletedMemoryAbsent = false;

  const failure = runVerifierExpectingFailure(evidence, [...verifier, "--destructive"]);

  assert.match(failure, /Create after delete must expose Brain Ranker candidates/);
  assert.match(failure, /Deleted Gmail source must be absent from Create ranked candidates/);
  assert.match(failure, /Deleted Gmail memory must be absent from Create ranked candidates/);
});

function runVerifierExpectingFailure(evidence: Record<string, unknown>, args = verifier): string {
  try {
    execFileSync(process.execPath, args, {
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

  assert.fail("Expected verifier to reject unsafe evidence.");
}

function validEvidence(): Record<string, unknown> & { steps: Array<Record<string, unknown>> } {
  return {
    baseUrl: "http://localhost:3000",
    userId: "gmail-smoke-user",
    workspaceId: "gmail-smoke-workspace",
    projectId: "gmail-smoke-project",
    sphereId: "gmail-smoke-sphere",
    startedAt: "2026-05-22T12:00:00.000Z",
    completedAt: "2026-05-22T12:01:00.000Z",
    steps: [
      {
        step: "connect.preflight",
        providerConfigKey: "google-gmail",
        connectLinkPresent: true,
        connectLinkHost: "connect.nango.dev",
        tokenPresent: true,
        expiresAtPresent: true,
        requestedSurfaceIds: ["google_gmail"],
        requestableSurfaceIds: ["google_gmail"],
        requestableScopeUrls: ["https://www.googleapis.com/auth/gmail.readonly"],
        restrictedScope: true,
        gated: true,
        private: true,
        scopeAuditReason: "read email for private Brain memory and email search.",
        warningsCount: 0,
      },
      {
        step: "status.initial",
        restrictedScope: true,
        gated: true,
        private: true,
        rawRetentionDefault: false,
        noHumanReview: true,
        statusStatePrivacySafe: true,
        providerStatePrivacySafe: true,
        connectionCount: 1,
        selectedAccountStateVisible: true,
        targetConnectionIdPresent: true,
        targetExternalConnectionIdPresent: true,
        targetProviderConfigKeyPresent: true,
        targetAccountAliasPresent: true,
      },
      {
        step: "sync",
        messageCount: 1,
        partialFailureCount: 0,
        cursorPresent: true,
        historyIdPresent: false,
      },
      {
        step: "status.afterSync",
        messageCount: 1,
        statusStatePrivacySafe: true,
        providerStatePrivacySafe: true,
        selectedSourceRefCount: 1,
        syncedSourceCount: 1,
        syncedSourceTrainingUseFalse: true,
        syncedSourceRawContentStoredFalse: true,
        syncedSourcePrivateUserMemory: true,
        syncedSourceRetrievalEnabled: true,
        brainProfileGmailSourceCount: 1,
        brainProfileMatchedSelectedSourceRefs: true,
        brainProfileTrainingUseFalse: true,
        brainProfileRawRetentionFalse: true,
        brainProfilePrivateVisibility: true,
      },
      {
        step: "sync.repeat",
        partialFailureCount: 0,
        cursorPresent: true,
        historyIdPresent: false,
        statusMessageCountUnchanged: true,
        selectedSourceCountUnchanged: true,
        duplicateSourceRefsAbsent: true,
      },
      {
        step: "keywordSearch",
        query: '"launch partner evidence" from:alice@example.com subject:"Launch plan"',
        stored: false,
        resultCount: 1,
        resultShapeVerified: true,
        messageRefPresent: true,
        threadRefPresent: true,
        sourceRefPresent: true,
        selectedSourceRefsMatched: true,
        snippetPresent: true,
        rawBodyAbsent: true,
        memoryCountUnchanged: true,
      },
      {
        step: "keywordSearch.syncExplicit",
        query: '"launch partner evidence" from:alice@example.com subject:"Launch plan"',
        stored: true,
        resultCount: 1,
        resultShapeVerified: true,
        messageRefPresent: true,
        threadRefPresent: true,
        sourceRefPresent: true,
        selectedSourceRefsMatched: true,
        snippetPresent: true,
        rawBodyAbsent: true,
        partialFailureCount: 0,
        duplicateSourceRefsAbsent: true,
      },
      {
        step: "semanticSearch",
        resultCount: 1,
        contextLight: false,
        resultShapeVerified: true,
        subjectPresent: true,
        senderPresent: true,
        dateFieldPresent: true,
        messageRefPresent: true,
        threadRefPresent: true,
        snippetPresent: true,
        sourceRefPresent: true,
        selectedSourceRefsMatched: true,
        memoryRefPresent: true,
        scoreReasonPresent: true,
        groundingLabels: ["grounded"],
        rawScoreHidden: true,
        rawBodyAbsent: true,
        selectedMemoryRefCount: 1,
      },
      {
        step: "create.first",
        memoryCountUsed: 1,
        sourceCountUsed: 1,
        selectedOptionCount: 2,
        selectedLenses: ["Critical", "Personal"],
        personalOptionPresent: true,
        criticalOptionPresent: true,
        gmailMemoryEvidencePresent: true,
        gmailSourceEvidencePresent: true,
        selectedSemanticMemoryRefsMatched: true,
        selectedSemanticSourceRefsMatched: true,
        rankedCandidateCount: 5,
        nextBestMoveGrounded: true,
        rankedCandidateGmailMemoryEvidencePresent: true,
        rankedCandidateGmailSourceEvidencePresent: true,
        rankedCandidateSelectedSemanticMemoryRefsMatched: true,
        rankedCandidateSelectedSemanticSourceRefsMatched: true,
        personalOptionExpectedEvidencePresent: true,
        criticalOptionExpectedEvidencePresent: true,
        expectedEvidencePresent: true,
      },
      {
        step: "create.refined",
        artifactPresent: true,
        verificationPresent: true,
        judgmentEventPresent: true,
        selectedOptionCount: 2,
        selectedLenses: ["Critical", "Personal"],
        selectedOptionsMatched: true,
        gmailMemoryEvidencePresent: true,
        gmailSourceEvidencePresent: true,
        selectedSemanticMemoryRefsMatched: true,
        selectedSemanticSourceRefsMatched: true,
        expectedEvidencePresent: true,
        artifactExpectedEvidencePresent: true,
        rawEmailBodyAbsent: true,
        secretOrConnectTokenAbsent: true,
        unsupportedHumanReviewClaimAbsent: true,
      },
      {
        step: "create.export",
        expectedEvidencePresent: true,
        selectedOptionHistoryPresent: true,
        personalContextSectionPresent: true,
        sourceMemoryEvidenceSectionPresent: true,
        personalContextExpectedEvidencePresent: true,
        sourceMemoryEvidenceExpectedEvidencePresent: true,
        unsafePrivacyClaimAbsent: true,
        rawEmailBodyAbsent: true,
        secretOrConnectTokenAbsent: true,
        unsupportedHumanReviewClaimAbsent: true,
      },
      {
        step: "revoke.delete.skipped",
        reason: "non destructive",
      },
    ],
  };
}

function connectPreflightOnlyEvidence(): Record<string, unknown> & { steps: Array<Record<string, unknown>> } {
  return {
    baseUrl: "http://localhost:3000",
    userId: "gmail-smoke-user",
    workspaceId: "gmail-smoke-workspace",
    projectId: "gmail-smoke-project",
    sphereId: "gmail-smoke-sphere",
    startedAt: "2026-05-22T12:00:00.000Z",
    completedAt: "2026-05-22T12:00:10.000Z",
    steps: [
      {
        step: "connect.preflight",
        providerConfigKey: "google-gmail",
        connectLinkPresent: true,
        connectLinkHost: "connect.nango.dev",
        tokenPresent: true,
        expiresAtPresent: true,
        requestedSurfaceIds: ["google_gmail"],
        requestableSurfaceIds: ["google_gmail"],
        requestableScopeUrls: ["https://www.googleapis.com/auth/gmail.readonly"],
        restrictedScope: true,
        gated: true,
        private: true,
        scopeAuditReason: "read email for private Brain memory and email search.",
        warningsCount: 0,
      },
      {
        step: "connect.preflightOnly.completed",
        reason: "Connect-session preflight completed without running post-OAuth Gmail smoke checks.",
      },
    ],
  };
}

function expectedPartialFailureEvidence(): Record<string, unknown> & { steps: Array<Record<string, unknown>> } {
  const evidence = validEvidence();

  for (const step of evidence.steps.filter((item) => item.step === "sync" || item.step === "sync.repeat")) {
    step.partialFailureCount = 1;
    step.expectedPartialFailureStage = "message_oversized";
    step.partialFailureStageMatched = true;
    step.partialFailuresSanitized = true;
  }

  return evidence;
}

function keywordFilterEvidence(): Record<string, unknown> & { steps: Array<Record<string, unknown>> } {
  const evidence = validEvidence();
  const filtersUsed = {
    from: "alice@example.com",
    to: "bob@example.com",
    subject: "Launch plan",
    label: "inbox",
    after: "2026-05-01",
    before: "2026-05-22",
    hasAttachment: true,
  };

  for (const step of evidence.steps.filter((item) => item.step === "keywordSearch" || item.step === "keywordSearch.syncExplicit")) {
    step.filtersUsed = filtersUsed;
    step.maxResultsUsed = 5;
  }

  return evidence;
}

function destructiveEvidence(): Record<string, unknown> & { steps: Array<Record<string, unknown>> } {
  const evidence = validEvidence();
  const semantic = evidence.steps.find((step) => step.step === "semanticSearch") as Record<string, unknown>;

  semantic.deleteTargetMatchedSemanticResult = true;
  semantic.deleteTargetMemoryIdCount = 1;

  evidence.steps = evidence.steps.filter((step) => step.step !== "revoke.delete.skipped");
  evidence.steps.push(
    {
      step: "revoke",
      revoked: true,
      syncAfterRevokeStatus: 409,
      searchAfterRevokeStatus: 409,
      semanticAfterRevokeStatus: 409,
    },
    {
      step: "deleteSource",
      sourceIdPresent: true,
      brainSourceIdPresent: true,
      brainSourceDeleted: true,
      brainProfileSourceAbsent: true,
      brainRetrieveDeletedSourceAbsent: true,
      semanticDeletedSourceAbsent: true,
      createDeletedSourceAbsent: true,
      createDeletedMemoryAbsent: true,
      createAfterDeleteRankedCandidateCount: 5,
      createRankedCandidateDeletedSourceAbsent: true,
      createRankedCandidateDeletedMemoryAbsent: true,
      trackedDeletedMemoryIdCount: 1,
    },
  );

  return evidence;
}
