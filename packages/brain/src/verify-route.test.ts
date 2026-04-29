import assert from "node:assert/strict";
import test from "node:test";
import {
  VerifyConflictError,
  VerifyGenerationError,
  VerifyNotFoundError,
  VerifyOutputSchema,
  VerifyProviderError,
  VerifyProviderSchema,
  buildConfidenceCascadePlan,
  createHeuristicVerifyProvider,
  createXaiVerifyProvider,
  defaultXaiVerifyModel,
  generateVerifyOutput,
  handleVerifyConfidenceRequest,
  handleVerifyRequest,
  parseVerifyOutput,
  resolveXaiVerifyModel,
  type VerifyGenerateText,
  type VerifyRequest,
} from "./verify-route.ts";
import { BrainRunGuardError } from "./brain-run-guard.ts";
import { createMemoryCommandIdempotencyStore } from "./command-idempotency.ts";

test("POST /brain/verify validates requests before running Verify", async () => {
  let verified = false;
  const response = await handleVerifyRequest(
    request("http://localhost/brain/verify", {
      claimId: "not-a-uuid",
      currentClaimText: "",
      sessionId: uuidAt(100),
    }),
    {
      async verifyClaim() {
        verified = true;
        throw new Error("verifyClaim should not run");
      },
    },
  );
  const payload = (await response.json()) as { error: { code: string; issues: string[] } };

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, "invalid_request");
  assert.match(payload.error.issues.join("\n"), /claimId/);
  assert.match(payload.error.issues.join("\n"), /currentClaimText/);
  assert.equal(verified, false);
});

test("POST /brain/verify returns verdict, evidence cards, BrainRun, and verify_run move without confidence mutation", async () => {
  let inputSeen: VerifyRequest | undefined;
  const claimId = uuidAt(101);
  const sessionId = uuidAt(100);
  const response = await handleVerifyRequest(
    request("http://localhost/brain/verify", {
      claimId,
      currentClaimText: "Cognitive load is the first bottleneck to test.",
      sessionId,
    }),
    {
      async verifyClaim(input) {
        inputSeen = input;

        return {
          verdict: "mixed",
          summary: "One source supports the mechanism, but the session has no direct product evidence yet.",
          evidenceCards: [
            {
              title: "Worked examples lower load",
              summary: "A learning-science citation supports part of the mechanism.",
              stance: "supports",
              sourceName: "Example Journal",
              sourceUrl: "https://example.test/source",
              citation: "Worked examples can reduce unnecessary cognitive load.",
            },
          ],
          confidenceDeltaSuggestion: -5,
          whatWouldChangeThis: "Direct user evidence that cognitive load is or is not the first bottleneck.",
          nextQuestion: "Which user behavior would show cognitive load is actually the bottleneck?",
          targetClaim: {
            id: claimId,
            versionId: uuidAt(201),
            kind: "assumption",
            status: "exploratory",
            text: "Cognitive load is the first bottleneck to test.",
            confidence: 64,
          },
          brainRun: {
            id: uuidAt(301),
            status: "succeeded",
          },
          move: {
            id: uuidAt(401),
            kind: "verify_run",
            summary: "Verified claim: mixed.",
            claimIds: [claimId],
            edgeIds: [],
            artifactIds: [],
          },
          citationSources: [
            {
              evidenceTitle: "Worked examples lower load",
              source: {
                id: uuidAt(501),
                kind: "verification_citation",
                rawText: "Title: Worked examples lower load",
              },
              sourceSpan: {
                id: uuidAt(601),
                sourceId: uuidAt(501),
                claimId,
                claimVersionId: uuidAt(201),
                label: "verify_evidence",
              },
            },
          ],
          confidenceUpdate: {
            suggestedDelta: -5,
            autoApplied: false,
            decision: "pending_user_decision",
          },
        };
      },
    },
  );
  const payload = (await response.json()) as {
    data: {
      verdict: string;
      evidenceCards: Array<{ sourceUrl: string; stance: string }>;
      confidenceDeltaSuggestion: number;
      whatWouldChangeThis: string;
      nextQuestion: string;
      targetClaim: { confidence: number };
      brainRun: { status: string };
      move: { kind: string; claimIds: string[] };
      citationSources: unknown[];
      confidenceUpdate: { suggestedDelta: number; autoApplied: boolean; decision: string };
    };
  };

  assert.equal(response.status, 201);
  assert.equal(inputSeen?.claimId, claimId);
  assert.equal(inputSeen?.sessionId, sessionId);
  assert.equal(inputSeen?.currentClaimText, "Cognitive load is the first bottleneck to test.");
  assert.equal(payload.data.verdict, "mixed");
  assert.equal(payload.data.evidenceCards.length, 1);
  assert.equal(payload.data.evidenceCards[0]?.sourceUrl, "https://example.test/source");
  assert.equal(payload.data.evidenceCards[0]?.stance, "supports");
  assert.equal(payload.data.confidenceDeltaSuggestion, -5);
  assert.match(payload.data.whatWouldChangeThis, /Direct user evidence/);
  assert.match(payload.data.nextQuestion, /Which user behavior/);
  assert.equal(payload.data.targetClaim.confidence, 64);
  assert.equal(payload.data.brainRun.status, "succeeded");
  assert.equal(payload.data.move.kind, "verify_run");
  assert.deepEqual(payload.data.move.claimIds, [claimId]);
  assert.equal(payload.data.citationSources.length, 1);
  assert.deepEqual(payload.data.confidenceUpdate, {
    suggestedDelta: -5,
    autoApplied: false,
    decision: "pending_user_decision",
  });
});

test("POST /brain/verify replays an idempotent command without verifying twice", async () => {
  const idempotencyStore = createMemoryCommandIdempotencyStore();
  const claimId = uuidAt(101);
  const sessionId = uuidAt(100);
  let verified = 0;
  const first = await handleVerifyRequest(idempotentVerifyRequest(claimId, sessionId), {
    idempotencyStore,
    provider: createHeuristicVerifyProvider(),
    async verifyClaim(input) {
      verified += 1;

      return verifiedResult(input.claimId);
    },
  });
  const second = await handleVerifyRequest(idempotentVerifyRequest(claimId, sessionId), {
    idempotencyStore,
    provider: createHeuristicVerifyProvider(),
    async verifyClaim(input) {
      verified += 1;

      return verifiedResult(input.claimId);
    },
  });
  const firstPayload = (await first.json()) as { data: ReturnType<typeof verifiedResult> };
  const secondPayload = (await second.json()) as { data: ReturnType<typeof verifiedResult> };

  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(first.headers.get("x-penny-idempotency"), "created");
  assert.equal(second.headers.get("x-penny-idempotency"), "replayed");
  assert.equal(verified, 1);
  assert.equal(secondPayload.data.move.id, firstPayload.data.move.id);
  assert.deepEqual(secondPayload.data.confidenceUpdate, firstPayload.data.confidenceUpdate);
});

test("POST /brain/verify/confidence validates requests before deciding confidence", async () => {
  let decided = false;
  const response = await handleVerifyConfidenceRequest(
    request("http://localhost/brain/verify/confidence", {
      verifyMoveId: "not-a-uuid",
      decision: "accept",
    }),
    {
      async decideConfidence() {
        decided = true;
        throw new Error("decideConfidence should not run");
      },
    },
  );
  const payload = (await response.json()) as { error: { code: string; issues: string[] } };

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, "invalid_request");
  assert.match(payload.error.issues.join("\n"), /verifyMoveId/);
  assert.equal(decided, false);
});

test("POST /brain/verify/confidence replays an idempotent decision without applying twice", async () => {
  const idempotencyStore = createMemoryCommandIdempotencyStore();
  const verifyMoveId = uuidAt(401);
  let decided = 0;
  const first = await handleVerifyConfidenceRequest(idempotentConfidenceRequest(verifyMoveId), {
    idempotencyStore,
    async decideConfidence(input) {
      decided += 1;

      return confidenceDecisionResult(input.verifyMoveId);
    },
  });
  const second = await handleVerifyConfidenceRequest(idempotentConfidenceRequest(verifyMoveId), {
    idempotencyStore,
    async decideConfidence(input) {
      decided += 1;

      return confidenceDecisionResult(input.verifyMoveId);
    },
  });
  const firstPayload = (await first.json()) as { data: ReturnType<typeof confidenceDecisionResult> };
  const secondPayload = (await second.json()) as { data: ReturnType<typeof confidenceDecisionResult> };

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(first.headers.get("x-penny-idempotency"), "created");
  assert.equal(second.headers.get("x-penny-idempotency"), "replayed");
  assert.equal(decided, 1);
  assert.equal(secondPayload.data.move.id, firstPayload.data.move.id);
  assert.deepEqual(secondPayload.data.confidenceUpdate, firstPayload.data.confidenceUpdate);
});

test("POST /brain/verify/confidence returns accepted confidence cascade decisions", async () => {
  const verifyMoveId = uuidAt(401);
  const claimId = uuidAt(101);
  const dependentClaimId = uuidAt(102);
  const response = await handleVerifyConfidenceRequest(
    request("http://localhost/brain/verify/confidence", {
      verifyMoveId,
      decision: "accept",
      reason: "The citation directly tests the premise.",
    }),
    {
      async decideConfidence(input) {
        assert.equal(input.verifyMoveId, verifyMoveId);
        assert.equal(input.decision, "accept");
        assert.match(input.reason ?? "", /citation/);

        return {
          decision: "accept",
          targetClaim: {
            id: claimId,
            versionId: uuidAt(202),
            kind: "assumption",
            status: "exploratory",
            text: "Cognitive load is the first bottleneck to test.",
            confidence: 72,
          },
          move: {
            id: uuidAt(402),
            kind: "confidence_update_accepted",
            summary: "Accepted Verify confidence suggestion.",
            claimIds: [claimId, dependentClaimId],
            edgeIds: [uuidAt(601)],
            artifactIds: [],
          },
          confidenceUpdate: {
            verifyMoveId,
            suggestedDelta: 8,
            accepted: true,
            previousConfidence: 64,
            currentConfidence: 72,
            appliedDelta: 8,
            cascade: [
              {
                claimId: dependentClaimId,
                viaEdgeId: uuidAt(601),
                depth: 1,
                previousVersionId: uuidAt(211),
                currentVersionId: uuidAt(212),
                previousConfidence: 55,
                currentConfidence: 59,
                appliedDelta: 4,
              },
            ],
          },
        };
      },
    },
  );
  const payload = (await response.json()) as {
    data: {
      decision: string;
      move: { kind: string; claimIds: string[]; edgeIds: string[] };
      confidenceUpdate: { accepted: boolean; appliedDelta: number; cascade: Array<{ appliedDelta: number; depth: number }> };
      targetClaim: { confidence: number };
    };
  };

  assert.equal(response.status, 200);
  assert.equal(payload.data.decision, "accept");
  assert.equal(payload.data.move.kind, "confidence_update_accepted");
  assert.deepEqual(payload.data.move.claimIds, [claimId, dependentClaimId]);
  assert.deepEqual(payload.data.move.edgeIds, [uuidAt(601)]);
  assert.equal(payload.data.confidenceUpdate.accepted, true);
  assert.equal(payload.data.confidenceUpdate.appliedDelta, 8);
  assert.equal(payload.data.confidenceUpdate.cascade[0]?.depth, 1);
  assert.equal(payload.data.confidenceUpdate.cascade[0]?.appliedDelta, 4);
  assert.equal(payload.data.targetClaim.confidence, 72);
});

test("confidence cascade follows active depends_on edges with attenuation", () => {
  const rootClaimId = uuidAt(101);
  const directDependentClaimId = uuidAt(102);
  const secondOrderDependentClaimId = uuidAt(103);
  const inactiveDependentClaimId = uuidAt(104);
  const plan = buildConfidenceCascadePlan({
    changedClaimId: rootClaimId,
    delta: -20,
    edges: [
      edge(uuidAt(601), directDependentClaimId, rootClaimId, "depends_on", "active", 1),
      edge(uuidAt(602), secondOrderDependentClaimId, directDependentClaimId, "depends_on", "active", 2),
      edge(uuidAt(603), inactiveDependentClaimId, rootClaimId, "depends_on", "acknowledged_vulnerability", 3),
      edge(uuidAt(604), uuidAt(105), rootClaimId, "supports", "active", 4),
      edge(uuidAt(605), rootClaimId, secondOrderDependentClaimId, "depends_on", "active", 5),
    ],
  });

  assert.deepEqual(plan, [
    {
      claimId: directDependentClaimId,
      viaEdgeId: uuidAt(601),
      depth: 1,
      appliedDelta: -10,
    },
    {
      claimId: secondOrderDependentClaimId,
      viaEdgeId: uuidAt(602),
      depth: 2,
      appliedDelta: -5,
    },
  ]);
});

test("verify route maps not-found, conflict, provider, and generation failures to stable errors", async () => {
  const notFound = await handleVerifyRequest(validRequest(), {
    async verifyClaim() {
      throw new VerifyNotFoundError("Claim was not found in this session.");
    },
  });
  const conflict = await handleVerifyRequest(validRequest(), {
    async verifyClaim() {
      throw new VerifyConflictError("Verify requires the current ClaimVersion text.");
    },
  });
  const providerFailure = await handleVerifyRequest(validRequest(), {
    async verifyClaim() {
      throw new VerifyProviderError("xAI Verify request failed.");
    },
  });
  const generationFailure = await handleVerifyRequest(validRequest(), {
    async verifyClaim() {
      throw new VerifyGenerationError("Verify output failed strict validation.", ["summary too long"]);
    },
  });
  const notFoundPayload = (await notFound.json()) as { error: { code: string } };
  const conflictPayload = (await conflict.json()) as { error: { code: string } };
  const providerPayload = (await providerFailure.json()) as { error: { code: string } };
  const generationPayload = (await generationFailure.json()) as { error: { code: string; issues: string[] } };

  assert.equal(notFound.status, 404);
  assert.equal(notFoundPayload.error.code, "verify_not_found");
  assert.equal(conflict.status, 409);
  assert.equal(conflictPayload.error.code, "verify_conflict");
  assert.equal(providerFailure.status, 502);
  assert.equal(providerPayload.error.code, "verify_provider_failed");
  assert.equal(generationFailure.status, 502);
  assert.equal(generationPayload.error.code, "invalid_verify_output");
  assert.deepEqual(generationPayload.error.issues, ["summary too long"]);
});

test("verify provider schema stays loose while strict validation enforces local gates", () => {
  const looseProviderOutput = {
    verdict: "supported",
    summary: "",
    evidenceCards: [],
    confidenceDeltaSuggestion: 45,
    whatWouldChangeThis: "",
    nextQuestion: "",
  };

  assert.equal(VerifyProviderSchema.safeParse(looseProviderOutput).success, true);
  assert.equal(VerifyOutputSchema.safeParse(looseProviderOutput).success, false);
});

test("generateVerifyOutput validates heuristic and xAI structured outputs", async () => {
  const input = {
    claimId: uuidAt(101),
    sessionId: uuidAt(100),
    currentClaimText: "Cognitive load is the first bottleneck to test.",
    currentClaimKind: "assumption" as const,
    currentClaimStatus: "exploratory" as const,
    currentClaimConfidence: 64,
    lensSnapshot: lensSnapshot(),
  };
  const heuristic = await generateVerifyOutput(input, {
    provider: createHeuristicVerifyProvider(),
    brainRunId: uuidAt(701),
  });
  const calls: Parameters<VerifyGenerateText>[0][] = [];
  const generateText: VerifyGenerateText = async (request) => {
    calls.push(request);

    return {
      output: {
        verdict: "supported",
        summary: "A cited source supports the mechanism enough to raise confidence slightly.",
        evidenceCards: [
          {
            title: "Worked examples",
            summary: "The citation supports reducing unnecessary load.",
            stance: "supports",
            sourceName: "Example Journal",
            sourceUrl: "https://example.test/worked-examples",
            citation: "Worked examples can reduce unnecessary cognitive load.",
          },
        ],
        confidenceDeltaSuggestion: 6,
        whatWouldChangeThis: "A trial showing no improvement from worked examples would weaken the claim.",
        nextQuestion: "Does the target student group benefit from worked examples?",
      },
      sources: [
        {
          sourceType: "url",
          title: "Worked examples",
          url: "https://example.test/worked-examples",
        },
      ],
    };
  };
  const xai = await generateVerifyOutput(input, {
    provider: createXaiVerifyProvider({ XAI_API_KEY: "test-key" }, { generateText }),
    brainRunId: uuidAt(702),
  });

  assert.equal(heuristic.verdict, "not_enough_evidence");
  assert.equal(heuristic.evidenceCards.length, 1);
  assert.equal(heuristic.confidenceDeltaSuggestion, 0);
  assert.equal(xai.verdict, "supported");
  assert.equal(xai.evidenceCards[0]?.sourceUrl, "https://example.test/worked-examples");
  assert.equal(resolveXaiVerifyModel({}), defaultXaiVerifyModel);
  assert.equal(calls.length, 1);
  assert.ok(calls[0]?.tools?.web_search);
  assert.match(calls[0]?.prompt ?? "", /Current claim text/);
  assert.match(calls[0]?.prompt ?? "", /Lens snapshot JSON/);
  assert.match(calls[0]?.prompt ?? "", /evidence_checking/);
});

test("generateVerifyOutput requires a recorded BrainRun id", async () => {
  await assert.rejects(
    () =>
      generateVerifyOutput(
        {
          claimId: uuidAt(101),
          sessionId: uuidAt(100),
          currentClaimText: "Cognitive load is the first bottleneck to test.",
          currentClaimKind: "assumption",
          currentClaimStatus: "exploratory",
          currentClaimConfidence: 64,
        },
        { provider: createHeuristicVerifyProvider() },
      ),
    (error) => {
      assert.ok(error instanceof BrainRunGuardError);
      assert.match(error.message, /verify_run/);
      return true;
    },
  );
});

test("verify output parsing can fall back to provider source cards", () => {
  const output = parseVerifyOutput(
    {
      verdict: "supported",
      summary: "A retrieved source supports the claim.",
      evidenceCards: [],
      confidenceDeltaSuggestion: 4,
      whatWouldChangeThis: "A stronger opposing citation would weaken this.",
      nextQuestion: "Can the effect be replicated in the target context?",
    },
    [
      {
        title: "Worked examples",
        url: "https://example.test/worked-examples",
        snippet: "Worked examples reduce avoidable cognitive load.",
      },
    ],
  );

  assert.equal(output.evidenceCards.length, 1);
  assert.equal(output.evidenceCards[0]?.sourceUrl, "https://example.test/worked-examples");
  assert.equal(output.evidenceCards[0]?.stance, "unclear");
});

test("verify output parsing and xAI provider failures are explicit", async () => {
  assert.throws(
    () =>
      parseVerifyOutput({
        verdict: "supported",
        summary: "",
        evidenceCards: [],
        confidenceDeltaSuggestion: 0,
        whatWouldChangeThis: "",
        nextQuestion: "What next?",
      }),
    (error) => {
      assert.ok(error instanceof VerifyGenerationError);
      return true;
    },
  );

  await assert.rejects(
    () =>
      createXaiVerifyProvider({}).generate({
        claimId: uuidAt(101),
        sessionId: uuidAt(100),
        currentClaimText: "Cognitive load is the first bottleneck to test.",
        currentClaimKind: "assumption",
        currentClaimStatus: "exploratory",
        currentClaimConfidence: 64,
      }),
    (error) => {
      assert.ok(error instanceof VerifyProviderError);
      assert.match(error.message, /XAI_API_KEY/);
      return true;
    },
  );
});

function validRequest(): Request {
  return request("http://localhost/brain/verify", {
    claimId: uuidAt(101),
    currentClaimText: "Cognitive load is the first bottleneck to test.",
    sessionId: uuidAt(100),
  });
}

function request(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function idempotentVerifyRequest(claimId: string, sessionId: string): Request {
  return new Request("http://localhost/brain/verify", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "verify-command-1",
      "x-user-id": "dev-user-1",
      "x-project-id": "dev-project-1",
    },
    body: JSON.stringify({
      claimId,
      currentClaimText: "Cognitive load is the first bottleneck to test.",
      sessionId,
    }),
  });
}

function idempotentConfidenceRequest(verifyMoveId: string): Request {
  return new Request("http://localhost/brain/verify/confidence", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "verify-confidence-command-1",
      "x-user-id": "dev-user-1",
      "x-project-id": "dev-project-1",
    },
    body: JSON.stringify({
      verifyMoveId,
      decision: "accept",
      reason: "The citation directly tests the premise.",
    }),
  });
}

function verifiedResult(claimId: string) {
  return {
    verdict: "mixed" as const,
    summary: "One source supports the mechanism, but the session has no direct product evidence yet.",
    evidenceCards: [
      {
        title: "Worked examples lower load",
        summary: "A learning-science citation supports part of the mechanism.",
        stance: "supports" as const,
        sourceName: "Example Journal",
        sourceUrl: "https://example.test/source",
        citation: "Worked examples can reduce unnecessary cognitive load.",
      },
    ],
    confidenceDeltaSuggestion: -5,
    whatWouldChangeThis: "Direct user evidence that cognitive load is or is not the first bottleneck.",
    nextQuestion: "Which user behavior would show cognitive load is actually the bottleneck?",
    targetClaim: {
      id: claimId,
      versionId: uuidAt(201),
      kind: "assumption" as const,
      status: "exploratory" as const,
      text: "Cognitive load is the first bottleneck to test.",
      confidence: 64,
    },
    brainRun: {
      id: uuidAt(301),
      status: "succeeded",
    },
    move: {
      id: uuidAt(401),
      kind: "verify_run" as const,
      summary: "Verified claim: mixed.",
      claimIds: [claimId],
      edgeIds: [],
      artifactIds: [],
    },
    citationSources: [],
    confidenceUpdate: {
      suggestedDelta: -5,
      autoApplied: false as const,
      decision: "pending_user_decision" as const,
    },
  };
}

function confidenceDecisionResult(verifyMoveId: string) {
  return {
    decision: "accept" as const,
    targetClaim: {
      id: uuidAt(101),
      versionId: uuidAt(202),
      kind: "assumption" as const,
      status: "exploratory" as const,
      text: "Cognitive load is the first bottleneck to test.",
      confidence: 72,
    },
    move: {
      id: uuidAt(402),
      kind: "confidence_update_accepted" as const,
      summary: "Accepted Verify confidence suggestion.",
      claimIds: [uuidAt(101)],
      edgeIds: [],
      artifactIds: [],
    },
    confidenceUpdate: {
      verifyMoveId,
      suggestedDelta: 8,
      accepted: true,
      previousConfidence: 64,
      currentConfidence: 72,
      appliedDelta: 8,
      cascade: [],
    },
  };
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function edge(
  id: string,
  fromClaimId: string,
  toClaimId: string,
  kind: "depends_on" | "supports",
  status: "active" | "acknowledged_vulnerability",
  timestamp: number,
) {
  return {
    id,
    fromClaimId,
    toClaimId,
    kind,
    status,
    createdAt: new Date(timestamp),
  };
}

function lensSnapshot() {
  return {
    shapes: [
      {
        id: uuidAt(901),
        key: "evidence_checking",
        label: "Evidence checking",
        description: "Recent moves are checking claims against evidence without changing confidence automatically.",
        confidence: 79,
        status: "confirmed" as const,
        supportingMoveIds: [uuidAt(501)],
      },
    ],
    pendingEffects: [],
  };
}
