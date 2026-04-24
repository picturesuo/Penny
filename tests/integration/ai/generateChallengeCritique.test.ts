import assert from "node:assert/strict";
import test from "node:test";

import { invokeAnthropicStructured } from "../../../server/ai/providers/anthropic.ts";
import { invokeXaiStructured } from "../../../server/ai/providers/xai.ts";
import {
  generateChallengeCritique,
  generateChallengeCritiqueDeps,
} from "../../../server/ai/operations/generateChallengeCritique.ts";

const validInput = {
  mapTitle: "Retention Thesis",
  claimId: "11111111-1111-4111-8111-111111111111",
  claimText: "Weekly active usage will keep climbing after manual onboarding is removed.",
  claimConfidence: 62,
};

function snapshotDeps() {
  return { ...generateChallengeCritiqueDeps };
}

function restoreDeps(originalDeps: ReturnType<typeof snapshotDeps>) {
  Object.assign(generateChallengeCritiqueDeps, originalDeps);
}

function applyCommonTestDeps() {
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
    });
}

test("generateChallengeCritique wires the real provider adapters by default", () => {
  assert.equal(generateChallengeCritiqueDeps.invokeAnthropicStructured, invokeAnthropicStructured);
  assert.equal(generateChallengeCritiqueDeps.invokeXaiStructured, invokeXaiStructured);
});

test("generateChallengeCritique falls back from the default Anthropic route to the xAI fallback route", async () => {
  const originalDeps = snapshotDeps();
  const providerCalls: string[] = [];

  applyCommonTestDeps();
  generateChallengeCritiqueDeps.invokeAnthropicStructured = async () => {
    providerCalls.push("anthropic");
    throw new Error("Anthropic unavailable");
  };
  generateChallengeCritiqueDeps.invokeXaiStructured = async () => {
    providerCalls.push("xai");
    return {
      output: {
        summary: "The claim may overfit to a founder-supported pilot cohort.",
        strongestCounterargument:
          "The observed retention lift may come from unusually motivated early users rather than a durable product effect.",
        assumptions: [
          "Pilot users resemble the broader target segment.",
          "Manual onboarding is not doing most of the retention work.",
        ],
        failureModes: [
          "Retention falls once founder-led onboarding is removed.",
          "Only the most motivated users sustain the behavior change.",
        ],
        followUpQuestions: [
          "What happens to retention when onboarding becomes fully self-serve?",
          "Which user segment falsifies this claim fastest?",
        ],
        suggestedConfidenceBps: 4700,
        uncertaintyNote: "The current evidence is directionally useful but still narrow.",
      },
      usage: {
        inputTokens: 90,
        outputTokens: 44,
        totalTokens: 134,
      },
      cost: {
        totalUsd: 0.006,
        currency: "USD",
      },
    };
  };

  try {
    const result = await generateChallengeCritique(validInput);

    assert.deepEqual(providerCalls, ["anthropic", "xai"]);
    assert.equal(result.meta.provider, "xai");
    assert.equal(result.meta.routeTier, "fallback");
    assert.equal(result.meta.fallbackHopCount, 1);
    assert.equal(result.output.conciseCritiqueSummary, "The claim may overfit to a founder-supported pilot cohort.");
    assert.equal(result.output.suggestedConfidenceDelta, -15);
  } finally {
    restoreDeps(originalDeps);
  }
});
