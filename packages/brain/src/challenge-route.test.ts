import assert from "node:assert/strict";
import test from "node:test";
import {
  ChallengeConflictError,
  ChallengeGenerationError,
  ChallengeNotFoundError,
  ChallengeProviderError,
  ChallengeProviderSchema,
  ChallengeOutputSchema,
  createHeuristicChallengeProvider,
  createXaiChallengeProvider,
  defaultXaiBrainChallengeModel,
  generateChallengeOutput,
  handleChallengeRequest,
  handleChallengeRespondRequest,
  parseChallengeOutput,
  resolveXaiBrainChallengeModel,
  type ChallengeGenerateText,
  type ChallengeRequest,
  type ChallengeResponseRequest,
} from "./challenge-route.ts";
import { BrainRunGuardError } from "./brain-run-guard.ts";

test("POST /brain/challenge validates the target claim request before persistence", async () => {
  let issued = false;
  const response = await handleChallengeRequest(
    request("http://localhost/brain/challenge", { targetClaimId: "not-a-uuid" }),
    {
      async issueChallenge() {
        issued = true;
        throw new Error("issueChallenge should not run");
      },
    },
  );
  const payload = (await response.json()) as { error: { code: string; issues: string[] } };

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, "invalid_request");
  assert.match(payload.error.issues.join("\n"), /targetClaimId/);
  assert.equal(issued, false);
});

test("POST /brain/challenge returns a critique claim, challenge edge, BrainRun, and challenge_issued move", async () => {
  let issuedInput: ChallengeRequest | undefined;
  const targetClaimId = uuidAt(101);
  const response = await handleChallengeRequest(request("http://localhost/brain/challenge", { targetClaimId }), {
    async issueChallenge(input) {
      issuedInput = input;

      return {
        critique: "The claim collapses if the learner's bottleneck is motivation rather than cognitive load.",
        failureType: "shaky_assumption",
        strength: "moderate",
        provenanceTag: "penny:test.challenge",
        whyThisCritique: "It attacks the dependency that makes the target claim useful.",
        whatWouldResolveIt: "Evidence that cognitive load is the binding constraint would resolve it.",
        suggestedNextMove: "Defend, Revise, or Absorb.",
        targetClaim: claim(targetClaimId, uuidAt(201), "assumption", "Cognitive load is the bottleneck."),
        critiqueClaim: claim(uuidAt(301), uuidAt(302), "belief", "Motivation may be the bottleneck."),
        challengeEdge: {
          id: uuidAt(401),
          fromClaimId: uuidAt(301),
          toClaimId: targetClaimId,
          kind: "challenges",
          status: "active",
          label: "shaky_assumption",
        },
        move: {
          id: uuidAt(501),
          kind: "challenge_issued",
          summary: "Issued a first challenge against the target claim.",
          claimIds: [targetClaimId, uuidAt(301)],
          edgeIds: [uuidAt(401)],
          artifactIds: [],
        },
        brainRun: {
          id: uuidAt(601),
          status: "succeeded",
        },
      };
    },
  });
  const payload = (await response.json()) as {
    data: {
      critique: string;
      failureType: string;
      strength: string;
      provenanceTag: string;
      whyThisCritique: string;
      whatWouldResolveIt: string;
      suggestedNextMove: string;
      critiqueClaim: { id: string; text: string };
      challengeEdge: { kind: string; status: string; toClaimId: string };
      move: { kind: string };
      brainRun: { status: string };
    };
  };

  assert.equal(response.status, 201);
  assert.equal(issuedInput?.targetClaimId, targetClaimId);
  assert.equal(payload.data.failureType, "shaky_assumption");
  assert.equal(payload.data.strength, "moderate");
  assert.equal(payload.data.provenanceTag, "penny:test.challenge");
  assert.equal(payload.data.challengeEdge.kind, "challenges");
  assert.equal(payload.data.challengeEdge.status, "active");
  assert.equal(payload.data.challengeEdge.toClaimId, targetClaimId);
  assert.equal(payload.data.move.kind, "challenge_issued");
  assert.equal(payload.data.brainRun.status, "succeeded");
});

test("POST /brain/challenge/respond validates response-specific content", async () => {
  let persisted = false;
  const response = await handleChallengeRespondRequest(
    request("http://localhost/brain/challenge/respond", {
      challengeEdgeId: uuidAt(401),
      response: "revise",
      revisedText: "",
    }),
    {
      async persistResponse() {
        persisted = true;
        throw new Error("persistResponse should not run");
      },
    },
  );
  const payload = (await response.json()) as { error: { code: string; issues: string[] } };

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, "invalid_request");
  assert.match(payload.error.issues.join("\n"), /revisedText/);
  assert.equal(persisted, false);
});

test("POST /brain/challenge/respond supports Defend, Revise, and Absorb moves", async () => {
  const targetClaimId = uuidAt(101);
  const edgeId = uuidAt(401);
  const seenResponses: ChallengeResponseRequest["response"][] = [];

  for (const body of [
    { challengeEdgeId: edgeId, response: "defend", reasoning: "The dependency is backed by observed study behavior." },
    { challengeEdgeId: edgeId, response: "revise", revisedText: "Cognitive load may be the first bottleneck to test." },
    { challengeEdgeId: edgeId, response: "absorb", reasoning: "Treat this as a known risk until tested." },
  ] satisfies unknown[]) {
    const response = await handleChallengeRespondRequest(request("http://localhost/brain/challenge/respond", body), {
      async persistResponse(parsed) {
        seenResponses.push(parsed.response);

        return {
          response: parsed.response,
          targetClaim: claim(
            targetClaimId,
            parsed.response === "revise" ? uuidAt(203) : uuidAt(201),
            "assumption",
            parsed.response === "revise" ? "Cognitive load may be the first bottleneck to test." : "Cognitive load is the bottleneck.",
          ),
          critiqueClaimId: uuidAt(301),
          challengeEdge: {
            id: edgeId,
            fromClaimId: uuidAt(301),
            toClaimId: targetClaimId,
            kind: "challenges",
            status: parsed.response === "absorb" ? "acknowledged_vulnerability" : "active",
            label: "shaky_assumption",
          },
          move: {
            id: uuidAt(501),
            kind: moveKindFor(parsed.response),
            summary: `${parsed.response} response`,
            claimIds: [targetClaimId, uuidAt(301)],
            edgeIds: [edgeId],
            artifactIds: [],
          },
        };
      },
    });
    const payload = (await response.json()) as {
      data: {
        response: string;
        targetClaim: { versionId: string; text: string };
        challengeEdge: { status: string };
        move: { kind: string };
      };
    };

    assert.equal(response.status, 200);
    assert.equal(payload.data.move.kind, moveKindFor(payload.data.response));

    if (payload.data.response === "revise") {
      assert.equal(payload.data.targetClaim.text, "Cognitive load may be the first bottleneck to test.");
      assert.equal(payload.data.targetClaim.versionId, uuidAt(203));
    }

    if (payload.data.response === "absorb") {
      assert.equal(payload.data.challengeEdge.status, "acknowledged_vulnerability");
    }
  }

  assert.deepEqual(seenResponses, ["defend", "revise", "absorb"]);
});

test("challenge routes map not-found and conflict failures to stable error codes", async () => {
  const notFound = await handleChallengeRequest(request("http://localhost/brain/challenge", { targetClaimId: uuidAt(101) }), {
    async issueChallenge() {
      throw new ChallengeNotFoundError("Target claim was not found.");
    },
  });
  const conflict = await handleChallengeRespondRequest(
    request("http://localhost/brain/challenge/respond", {
      challengeEdgeId: uuidAt(401),
      response: "defend",
      reasoning: "This challenge targets the wrong edge.",
    }),
    {
      async persistResponse() {
        throw new ChallengeConflictError("Only challenge edges can receive challenge responses.");
      },
    },
  );
  const notFoundPayload = (await notFound.json()) as { error: { code: string } };
  const conflictPayload = (await conflict.json()) as { error: { code: string } };

  assert.equal(notFound.status, 404);
  assert.equal(notFoundPayload.error.code, "challenge_not_found");
  assert.equal(conflict.status, 409);
  assert.equal(conflictPayload.error.code, "challenge_conflict");
});

test("challenge provider schema stays loose while strict validation enforces local gates", () => {
  const looseProviderOutput = {
    critique: "",
    failureType: "shaky_assumption",
    strength: "moderate",
    provenanceTag: "penny:test.challenge",
    whyThisCritique: "A specific reason.",
    whatWouldResolveIt: "A specific resolution.",
    suggestedNextMove: "Defend, Revise, or Absorb.",
  };

  assert.equal(ChallengeProviderSchema.safeParse(looseProviderOutput).success, true);
  assert.equal(ChallengeOutputSchema.safeParse(looseProviderOutput).success, false);
});

test("generateChallengeOutput validates heuristic and xAI structured outputs", async () => {
  const input = {
    targetClaimId: uuidAt(101),
    targetKind: "assumption" as const,
    targetText: "Cognitive load is the bottleneck.",
    targetStatus: "exploratory" as const,
    targetConfidence: 64,
    lensSnapshot: lensSnapshot(),
  };
  const heuristic = await generateChallengeOutput(input, {
    provider: createHeuristicChallengeProvider(),
    brainRunId: uuidAt(701),
  });
  const calls: Parameters<ChallengeGenerateText>[0][] = [];
  const generateText: ChallengeGenerateText = async (request) => {
    calls.push(request);

    return {
      output: {
        critique: "The claim collapses if motivation is the bottleneck instead.",
        failureType: "shaky_assumption",
        strength: "strong",
        provenanceTag: "penny:challenge.test",
        whyThisCritique: "It attacks the load-bearing premise.",
        whatWouldResolveIt: "Evidence that cognitive load is first would resolve it.",
        suggestedNextMove: "Defend, Revise, or Absorb.",
      },
    };
  };
  const xai = await generateChallengeOutput(input, {
    provider: createXaiChallengeProvider({ XAI_API_KEY: "test-key" }, { generateText }),
    brainRunId: uuidAt(702),
  });

  assert.equal(heuristic.strength, "moderate");
  assert.equal(xai.strength, "strong");
  assert.equal(resolveXaiBrainChallengeModel({}), defaultXaiBrainChallengeModel);
  assert.equal(calls.length, 1);
  assert.match(calls[0]?.prompt ?? "", /Target claim id/);
  assert.match(calls[0]?.prompt ?? "", /Lens snapshot JSON/);
  assert.match(calls[0]?.prompt ?? "", /concept_grounding/);
});

test("generateChallengeOutput requires a recorded BrainRun id", async () => {
  await assert.rejects(
    () =>
      generateChallengeOutput(
        {
          targetClaimId: uuidAt(101),
          targetKind: "assumption",
          targetText: "Cognitive load is the bottleneck.",
          targetStatus: "exploratory",
          targetConfidence: 64,
        },
        { provider: createHeuristicChallengeProvider() },
      ),
    (error) => {
      assert.ok(error instanceof BrainRunGuardError);
      assert.match(error.message, /brain\.challenge/);
      return true;
    },
  );
});

test("challenge output parsing and xAI provider failures are explicit", async () => {
  assert.throws(
    () =>
      parseChallengeOutput({
        critique: "",
        failureType: "shaky_assumption",
        strength: "moderate",
        provenanceTag: "penny:test.challenge",
        whyThisCritique: "A reason.",
        whatWouldResolveIt: "A resolution.",
        suggestedNextMove: "A move.",
      }),
    (error) => {
      assert.ok(error instanceof ChallengeGenerationError);
      return true;
    },
  );

  await assert.rejects(
    () =>
      createXaiChallengeProvider({}).generate({
        targetClaimId: uuidAt(101),
        targetKind: "assumption",
        targetText: "Cognitive load is the bottleneck.",
        targetStatus: "exploratory",
        targetConfidence: 64,
      }),
    (error) => {
      assert.ok(error instanceof ChallengeProviderError);
      assert.match(error.message, /XAI_API_KEY/);
      return true;
    },
  );
});

function request(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function claim(
  id: string,
  versionId: string,
  kind: "belief" | "assumption" | "question" | "concept",
  text: string,
) {
  return {
    id,
    versionId,
    kind,
    status: "exploratory" as const,
    text,
    confidence: 64,
  };
}

function moveKindFor(response: string): "user_defended" | "claim_revised" | "critique_absorbed" {
  switch (response) {
    case "defend":
      return "user_defended";
    case "revise":
      return "claim_revised";
    default:
      return "critique_absorbed";
  }
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function lensSnapshot() {
  return {
    shapes: [
      {
        id: uuidAt(901),
        key: "concept_grounding",
        label: "Concept grounding",
        description: "Recent moves use Makes Cents to clarify a concept before continuing the map.",
        confidence: 70,
        status: "confirmed" as const,
        supportingMoveIds: [uuidAt(501)],
      },
    ],
    pendingEffects: [],
  };
}
