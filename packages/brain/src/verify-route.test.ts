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

test("POST /brain/verify returns verdict, evidence cards, BrainRun, verify_run move, and pending confidence update", async () => {
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
              sourceName: "Learning Science Notes",
              sourceUrl: "https://example.test/source",
              citation: "Worked examples can reduce unnecessary cognitive load.",
            },
          ],
          confidenceDeltaSuggestion: -5,
          whatWouldChangeThis: "Direct study-session evidence from target students.",
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
              evidenceCardIndex: 0,
              source: {
                id: uuidAt(501),
                kind: "verification_citation",
                rawText: "Citation: Worked examples can reduce unnecessary cognitive load.",
              },
              sourceSpan: {
                id: uuidAt(601),
                sourceId: uuidAt(501),
                claimId,
                claimVersionId: uuidAt(201),
                startOffset: 10,
                endOffset: 63,
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
      evidenceCards: unknown[];
      confidenceDeltaSuggestion: number;
      targetClaim: { confidence: number };
      brainRun: { status: string };
      move: { kind: string; claimIds: string[] };
      citationSources: unknown[];
      confidenceUpdate: { autoApplied: boolean; decision: string };
    };
  };

  assert.equal(response.status, 201);
  assert.equal(inputSeen?.claimId, claimId);
  assert.equal(inputSeen?.sessionId, sessionId);
  assert.equal(payload.data.verdict, "mixed");
  assert.equal(payload.data.evidenceCards.length, 1);
  assert.equal(payload.data.confidenceDeltaSuggestion, -5);
  assert.equal(payload.data.targetClaim.confidence, 64);
  assert.equal(payload.data.brainRun.status, "succeeded");
  assert.equal(payload.data.move.kind, "verify_run");
  assert.deepEqual(payload.data.move.claimIds, [claimId]);
  assert.equal(payload.data.citationSources.length, 1);
  assert.equal(payload.data.confidenceUpdate.autoApplied, false);
  assert.equal(payload.data.confidenceUpdate.decision, "pending_user_decision");
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
    evidenceCards: [
      {
        title: "A source",
        summary: "Evidence summary.",
        stance: "supports",
      },
    ],
    confidenceDeltaSuggestion: 80,
    whatWouldChangeThis: "More direct evidence.",
    nextQuestion: "What should be checked next?",
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
            sourceName: "Learning Science Notes",
            citation: "Worked examples can reduce unnecessary cognitive load.",
          },
        ],
        confidenceDeltaSuggestion: 8,
        whatWouldChangeThis: "Contrary evidence from the target user group.",
        nextQuestion: "Does the target student group benefit from worked examples?",
      },
    };
  };
  const xai = await generateVerifyOutput(input, {
    provider: createXaiVerifyProvider({ XAI_API_KEY: "test-key" }, { generateText }),
  });

  assert.equal(heuristic.verdict, "not_enough_evidence");
  assert.equal(heuristic.confidenceDeltaSuggestion, 0);
  assert.equal(xai.verdict, "supported");
  assert.equal(xai.confidenceDeltaSuggestion, 8);
  assert.equal(resolveXaiVerifyModel({}), defaultXaiVerifyModel);
  assert.equal(calls.length, 1);
  assert.match(calls[0]?.prompt ?? "", /Current claim text/);
});

test("verify output parsing and xAI provider failures are explicit", async () => {
  assert.throws(
    () =>
      parseVerifyOutput({
        verdict: "supported",
        summary: "",
        evidenceCards: [],
        confidenceDeltaSuggestion: 0,
        whatWouldChangeThis: "More evidence.",
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
