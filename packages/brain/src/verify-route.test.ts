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
  verifyConfidenceCascadePolicy,
  verifyWebSearchDecision,
  type VerifyGenerateText,
  type VerifyRequest,
} from "./verify-route.ts";
import { BrainRunGuardError } from "./brain-run-guard.ts";
import { createMemoryCommandIdempotencyStore } from "./command-idempotency.ts";
import { buildBrainRetrievalDocument, retrieveBrainContext } from "./brain-retrieval.ts";

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
          citations: [
            {
              title: "Worked examples lower load",
              sourceName: "Example Journal",
              sourceUrl: "https://example.test/source",
              citation: "Worked examples can reduce unnecessary cognitive load.",
            },
          ],
          unsupportedParts: [
            {
              part: "First bottleneck",
              reason: "The cited mechanism does not prove this is the first product bottleneck.",
              neededEvidence: "Direct user evidence comparing cognitive load against other bottlenecks.",
            },
          ],
          confidenceDeltaSuggestion: -5,
          whatWouldChangeThis: "Direct user evidence that cognitive load is or is not the first bottleneck.",
          nextQuestion: "Which user behavior would show cognitive load is actually the bottleneck?",
          recipe: verifyRecipe("mixed", -5),
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
          searchTrace: null,
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
      citations: Array<{ sourceUrl: string; citation: string }>;
      unsupportedParts: Array<{ part: string; neededEvidence: string }>;
      confidenceDeltaSuggestion: number;
      whatWouldChangeThis: string;
      nextQuestion: string;
      recipe: { steps: Array<{ step: string; status: string }> };
      targetClaim: { confidence: number };
      brainRun: { status: string };
      move: { kind: string; claimIds: string[] };
      citationSources: unknown[];
      searchTrace: unknown;
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
  assert.equal(payload.data.citations[0]?.sourceUrl, "https://example.test/source");
  assert.match(payload.data.citations[0]?.citation ?? "", /Worked examples/);
  assert.equal(payload.data.unsupportedParts[0]?.part, "First bottleneck");
  assert.equal(payload.data.recipe.steps.map((step) => step.step).join(","), "decompose_claim,search_gather,evaluate_evidence,synthesize_verdict,suggest_confidence_change");
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
      edge(uuidAt(606), uuidAt(106), secondOrderDependentClaimId, "depends_on", "active", 6),
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

test("confidence cascade limits blast radius by depth and claim count", () => {
  const rootClaimId = uuidAt(101);
  const plan = buildConfidenceCascadePlan({
    changedClaimId: rootClaimId,
    delta: 24,
    policy: {
      maxDepth: verifyConfidenceCascadePolicy.maxDepth,
      maxClaims: 2,
    },
    edges: [
      edge(uuidAt(601), uuidAt(102), rootClaimId, "depends_on", "active", 1),
      edge(uuidAt(602), uuidAt(103), rootClaimId, "depends_on", "active", 2),
      edge(uuidAt(603), uuidAt(104), rootClaimId, "depends_on", "active", 3),
      edge(uuidAt(604), uuidAt(105), uuidAt(102), "depends_on", "active", 4),
    ],
  });

  assert.deepEqual(plan, [
    {
      claimId: uuidAt(102),
      viaEdgeId: uuidAt(601),
      depth: 1,
      appliedDelta: 12,
    },
    {
      claimId: uuidAt(103),
      viaEdgeId: uuidAt(602),
      depth: 1,
      appliedDelta: 12,
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
  const retrievalContext = await retrieveBrainContext(
    [
      buildBrainRetrievalDocument({
        id: uuidAt(801),
        kind: "claim",
        title: "assumption: cognitive load bottleneck",
        text: "Cognitive load is the first bottleneck to test for novice users.",
        sessionId: uuidAt(100),
        claimId: uuidAt(101),
        sourceId: uuidAt(901),
        updatedAt: "2026-05-01T12:00:00.000Z",
        tags: ["assumption", "verify"],
      }),
    ],
    { mode: "verify", query: "cognitive load bottleneck", sessionId: uuidAt(100), currentClaimId: uuidAt(101) },
  );
  const input = {
    claimId: uuidAt(101),
    sessionId: uuidAt(100),
    currentClaimText: "Cognitive load is the first bottleneck to test.",
    currentClaimKind: "assumption" as const,
    currentClaimStatus: "exploratory" as const,
    currentClaimConfidence: 64,
    lensSnapshot: lensSnapshot(),
    retrievalContext,
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
        citations: [
          {
            title: "Worked examples",
            sourceName: "Example Journal",
            sourceUrl: "https://example.test/worked-examples",
            citation: "Worked examples can reduce unnecessary cognitive load.",
          },
        ],
        unsupportedParts: [],
        confidenceDeltaSuggestion: 6,
        whatWouldChangeThis: "A trial showing no improvement from worked examples would weaken the claim.",
        nextQuestion: "Does the target student group benefit from worked examples?",
        recipe: verifyRecipe("supported", 6),
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
  assert.equal(heuristic.unsupportedParts.length, 1);
  assert.equal(heuristic.recipe.steps[1]?.step, "search_gather");
  assert.equal(heuristic.confidenceDeltaSuggestion, 0);
  assert.equal(xai.verdict, "supported");
  assert.equal(xai.evidenceCards[0]?.sourceUrl, "https://example.test/worked-examples");
  assert.equal(xai.citations[0]?.sourceUrl, "https://example.test/worked-examples");
  assert.equal(xai.unsupportedParts.length, 0);
  assert.equal(xai.recipe.steps.map((step) => step.step).join(","), "decompose_claim,search_gather,evaluate_evidence,synthesize_verdict,suggest_confidence_change");
  assert.equal(resolveXaiVerifyModel({}), defaultXaiVerifyModel);
  assert.equal(calls.length, 1);
  assert.ok(calls[0]?.tools?.web_search);
  assert.match(calls[0]?.prompt ?? "", /Current claim text/);
  assert.match(calls[0]?.prompt ?? "", /Lens snapshot JSON/);
  assert.match(calls[0]?.prompt ?? "", /Brain retrieval context/);
  assert.match(calls[0]?.prompt ?? "", /cognitive load bottleneck/);
  assert.match(calls[0]?.prompt ?? "", /evidence_checking/);
  assert.match(calls[0]?.prompt ?? "", /Search decision/);
  assert.match(calls[0]?.prompt ?? "", /recipe\.steps/);
});

test("Verify web search routing enables search by default when possible", async () => {
  const factualInput = {
    claimId: uuidAt(101),
    sessionId: uuidAt(100),
    currentClaimText: "40% of founders will pay $200/month for this workflow.",
    currentClaimKind: "assumption" as const,
    currentClaimStatus: "exploratory" as const,
    currentClaimConfidence: 64,
  };
  const localInput = {
    ...factualInput,
    currentClaimText: "I want this idea to feel calmer than a generic dashboard.",
  };
  const calls: Parameters<VerifyGenerateText>[0][] = [];
  const generateText: VerifyGenerateText = async (request) => {
    calls.push(request);

    return {
      output: {
        verdict: "not_enough_evidence",
        summary: "The available context is not enough to ground the claim.",
        evidenceCards: [
          {
            title: "Local context",
            summary: "The claim is local to the user's stated preference.",
            stance: "unclear",
            sourceName: "Penny Brain",
            sourceUrl: null,
            citation: null,
          },
        ],
        confidenceDeltaSuggestion: 0,
        whatWouldChangeThis: "A directly relevant source or user observation would change this.",
        nextQuestion: "What evidence would directly test this claim?",
      },
      sources: [],
    };
  };

  assert.equal(verifyWebSearchDecision(factualInput).useWebSearch, true);
  assert.equal(verifyWebSearchDecision(localInput).useWebSearch, true);

  await generateVerifyOutput(factualInput, {
    provider: createXaiVerifyProvider({ XAI_API_KEY: "test-key" }, { generateText }),
    brainRunId: uuidAt(703),
  });
  await generateVerifyOutput(localInput, {
    provider: createXaiVerifyProvider({ XAI_API_KEY: "test-key" }, { generateText }),
    brainRunId: uuidAt(704),
  });

  assert.ok(calls[0]?.tools?.web_search);
  assert.ok(calls[1]?.tools?.web_search);
});

test("xAI Verify provider records search trace without promoting unused provider sources", async () => {
  const input = {
    claimId: uuidAt(101),
    sessionId: uuidAt(100),
    currentClaimText: "Worked examples reduce cognitive load.",
    currentClaimKind: "assumption" as const,
    currentClaimStatus: "exploratory" as const,
    currentClaimConfidence: 64,
  };
  const generateText: VerifyGenerateText = async () => ({
    output: {
      verdict: "supported",
      summary: "The used citation supports the target mechanism.",
      evidenceCards: [
        {
          title: "Used source",
          summary: "Worked examples reduce avoidable cognitive load.",
          stance: "supports",
          sourceName: "Example Journal",
          sourceUrl: "https://example.test/used",
          citation: "Worked examples reduce avoidable cognitive load.",
        },
      ],
      citations: [],
      unsupportedParts: [],
      confidenceDeltaSuggestion: 4,
      whatWouldChangeThis: "A stronger contrary result would weaken this.",
      nextQuestion: "Does the target learner group show the same effect?",
      recipe: verifyRecipe("supported", 4),
    },
    sources: [
      {
        sourceType: "url",
        title: "Used source",
        url: "https://example.test/used",
        snippet: "Worked examples reduce avoidable cognitive load.",
      },
      {
        sourceType: "url",
        title: "Unused provider source",
        url: "https://unused.example/source",
        snippet: "This provider result was not cited in the saved output.",
      },
    ],
  });

  const provider = createXaiVerifyProvider({ XAI_API_KEY: "test-key" }, { generateText });
  const generated = await provider.generate(input);
  const output = parseVerifyOutput(generated.output, generated.sources ?? [], input);

  assert.equal(generated.searchTrace?.providerName, "xai");
  assert.equal(generated.searchTrace?.providerToolAttached, true);
  assert.equal(generated.searchTrace?.results.length, 2);
  assert.equal(generated.searchTrace?.results[1]?.url, "https://unused.example/source");
  assert.equal(output.citations.some((citation) => citation.sourceUrl === "https://example.test/used"), true);
  assert.equal(output.citations.some((citation) => citation.sourceUrl === "https://unused.example/source"), false);
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
  assert.equal(output.citations[0]?.sourceUrl, "https://example.test/worked-examples");
  assert.equal(output.unsupportedParts.length, 0);
  assert.equal(output.recipe.steps[0]?.step, "decompose_claim");
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
    citations: [
      {
        title: "Worked examples lower load",
        sourceName: "Example Journal",
        sourceUrl: "https://example.test/source",
        citation: "Worked examples can reduce unnecessary cognitive load.",
      },
    ],
    unsupportedParts: [
      {
        part: "First bottleneck",
        reason: "The citation supports the mechanism but not the product bottleneck ranking.",
        neededEvidence: "Direct user evidence that cognitive load is the first bottleneck.",
      },
    ],
    confidenceDeltaSuggestion: -5,
    whatWouldChangeThis: "Direct user evidence that cognitive load is or is not the first bottleneck.",
    nextQuestion: "Which user behavior would show cognitive load is actually the bottleneck?",
    recipe: verifyRecipe("mixed", -5),
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
    searchTrace: null,
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

function verifyRecipe(verdict: "supported" | "weakened" | "mixed" | "not_enough_evidence", delta: number) {
  return {
    steps: [
      {
        step: "decompose_claim" as const,
        title: "Decompose claim",
        status: "completed" as const,
        summary: "Separated the target claim into testable parts.",
        inputs: ["Cognitive load is the first bottleneck to test."],
        outputs: ["mechanism", "first bottleneck ranking"],
      },
      {
        step: "search_gather" as const,
        title: "Search and gather",
        status: "completed" as const,
        summary: "Gathered citation-backed evidence cards.",
        inputs: ["domain_factual_claim"],
        outputs: ["1 citation-backed evidence card"],
      },
      {
        step: "evaluate_evidence" as const,
        title: "Evaluate evidence",
        status: "completed" as const,
        summary: "Compared the evidence card against the exact claim.",
        inputs: ["Worked examples lower load"],
        outputs: ["supports mechanism", "does not prove first bottleneck"],
      },
      {
        step: "synthesize_verdict" as const,
        title: "Synthesize verdict",
        status: "completed" as const,
        summary: `Synthesized the evidence into a ${verdict} verdict.`,
        inputs: ["supports", "unsupported part"],
        outputs: [verdict],
      },
      {
        step: "suggest_confidence_change" as const,
        title: "Suggest confidence change",
        status: "completed" as const,
        summary: `Suggested a ${delta} point confidence delta for user review.`,
        inputs: [verdict],
        outputs: [`delta ${delta}`],
      },
    ],
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
    userId: "dev-user",
    workspaceId: null,
    projectId: "dev-project",
    sphereId: null,
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
