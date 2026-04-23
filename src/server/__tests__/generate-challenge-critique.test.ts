import assert from "node:assert/strict";
import test from "node:test";
import {
  generateChallengeCritique,
  generateChallengeCritiqueDeps,
} from "@/server/ai/operations/generateChallengeCritique";
import {
  challengeIds,
  critiqueOutputFixture,
} from "@/server/__tests__/fixtures/challenge";

const originalDeps = { ...generateChallengeCritiqueDeps };

function restoreGenerateDeps() {
  Object.assign(generateChallengeCritiqueDeps, originalDeps);
}

function buildOperationInput() {
  return {
    mapTitle: "Penny OS Architecture",
    claimId: challengeIds.claimId,
    claimText: "A modular backend architecture is the right choice for Penny now.",
    claimConfidence: 62,
    steelmanText: "Modularity keeps interfaces reusable.",
    neighboringClaims: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        text: "Event-driven updates should stay in-process while the product is still changing.",
        confidence: 55,
        kind: "claim",
        relationship: "nearby",
      },
    ],
    previousRounds: [
      {
        roundId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        roundNumber: 1,
        critiqueSummary: "Prior critique summary.",
        userResponse: "I need stronger evidence before committing to modularity.",
        responsePath: "revise" as const,
        confidenceDelta: -7,
      },
    ],
    userGoal: "Keep the architecture adaptable without oversplitting the product.",
    critiqueMode: "direct" as const,
  };
}

test("generateChallengeCritique falls back to the next provider after a provider failure", async () => {
  const calls: string[] = [];

  generateChallengeCritiqueDeps.resolveModelPolicy = () => [
    {
      operation: "generateChallengeCritique",
      provider: "anthropic",
      model: "claude-test",
      promptVersion: "challenge-critique-v1",
      tier: "default",
    },
    {
      operation: "generateChallengeCritique",
      provider: "xai",
      model: "grok-test",
      promptVersion: "challenge-critique-v1",
      tier: "fallback",
    },
  ];
  generateChallengeCritiqueDeps.getDeployMetadata = () => ({
    environment: "test",
    release: "test-release",
  });
  generateChallengeCritiqueDeps.getTraceId = () => "trace-123";
  generateChallengeCritiqueDeps.getActiveObservationId = () => "obs-123";
  generateChallengeCritiqueDeps.startActiveObservation = async (_name, callback) =>
    callback({
      update() {
        return undefined;
      },
    } as never);
  generateChallengeCritiqueDeps.invokeAnthropicStructured = async () => {
    calls.push("anthropic");
    throw new Error("Anthropic unavailable");
  };
  generateChallengeCritiqueDeps.invokeXaiStructured = async () => {
    calls.push("xai");
    return {
      output: critiqueOutputFixture,
      usage: {
        inputTokens: 120,
        outputTokens: 64,
        totalTokens: 184,
      },
      cost: {
        totalUsd: 0.01,
        currency: "USD",
      },
    };
  };

  try {
    const result = await generateChallengeCritique(buildOperationInput(), {
      userId: challengeIds.userId,
      mapId: challengeIds.mapId,
      claimId: challengeIds.claimId,
      promptVersion: "challenge-critique-v1",
      qualityTier: "standard",
    });

    assert.deepEqual(calls, ["anthropic", "xai"]);
    assert.equal(result.meta.provider, "xai");
    assert.equal(result.meta.routeTier, "fallback");
    assert.equal(result.output.strongestCounterargument, critiqueOutputFixture.strongestCounterargument);
  } finally {
    restoreGenerateDeps();
  }
});
