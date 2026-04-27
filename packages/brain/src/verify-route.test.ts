import assert from "node:assert/strict";
import test from "node:test";
import {
  VerifyConflictError,
  VerifyGenerationError,
  VerifyNotFoundError,
  VerifyOutputSchema,
  VerifyProviderError,
  VerifyProviderSchema,
  createHeuristicVerifyProvider,
  createXaiVerifyProvider,
  defaultXaiVerifyModel,
  generateVerifyOutput,
  handleVerifyRequest,
  parseVerifyOutput,
  resolveXaiVerifyModel,
  type VerifyGenerateText,
  type VerifyRequest,
} from "./verify-route.ts";

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
  };
  const heuristic = await generateVerifyOutput(input, {
    provider: createHeuristicVerifyProvider(),
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

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
