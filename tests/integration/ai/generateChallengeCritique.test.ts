import assert from "node:assert/strict";
import test from "node:test";

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

test("generateChallengeCritique uses injected mocked provider functions in tests", async () => {
  const originalDeps = snapshotDeps();
  const providerCalls: string[] = [];

  applyCommonTestDeps();
  generateChallengeCritiqueDeps.resolveModelPolicy = () => [
    {
      provider: "anthropic",
      model: "claude-test",
      promptVersion: "generateChallengeCritique.v1",
      tier: "default",
    },
  ];
  generateChallengeCritiqueDeps.invokeAnthropicStructured = async () => {
    providerCalls.push("anthropic");
    return {
      output: {
        summary: "Mocked provider output.",
        strongestCounterargument: "The test should not hit a live provider.",
        assumptions: ["The injected provider function controls the response."],
        failureModes: ["A live API call would violate the test contract."],
        followUpQuestions: ["Did the test stay fully mocked?"],
        suggestedConfidenceBps: 5000,
        uncertaintyNote: "This is a synthetic response from a mocked provider.",
      },
      usage: {
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
      },
      cost: {
        totalUsd: 0,
        currency: "USD",
      },
    };
  };
  generateChallengeCritiqueDeps.invokeXaiStructured = async () => {
    providerCalls.push("xai");
    throw new Error("xai should not be called");
  };

  try {
    const result = await generateChallengeCritique({ claimText: validInput.claimText });

    assert.deepEqual(providerCalls, ["anthropic"]);
    assert.equal(result.provider, "anthropic");
    assert.equal(result.critique.summary, "Mocked provider output.");
  } finally {
    restoreDeps(originalDeps);
  }
});

test("generateChallengeCritique can fall back from an injected Anthropic route to an injected xAI route", async () => {
  const originalDeps = snapshotDeps();
  const providerCalls: string[] = [];

  applyCommonTestDeps();
  generateChallengeCritiqueDeps.resolveModelPolicy = () => [
    {
      provider: "anthropic",
      model: "claude-test",
      promptVersion: "generateChallengeCritique.v1",
      tier: "default",
    },
    {
      provider: "xai",
      model: "grok-test",
      promptVersion: "generateChallengeCritique.v1",
      tier: "fallback",
    },
  ];
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
    assert.equal(result.provider, "xai");
    assert.equal(result.model, "grok-test");
    assert.equal(result.repaired, false);
    assert.equal(result.fallbackUsed, true);
    assert.equal(result.traceId, "trace-123");
    assert.equal(result.critique.summary, "The claim may overfit to a founder-supported pilot cohort.");
    assert.equal(result.meta.provider, "xai");
    assert.equal(result.meta.routeTier, "fallback");
    assert.equal(result.meta.fallbackHopCount, 1);
    assert.equal(result.output.conciseCritiqueSummary, "The claim may overfit to a founder-supported pilot cohort.");
    assert.equal(result.output.suggestedConfidenceDelta, -15);
  } finally {
    restoreDeps(originalDeps);
  }
});

test("generateChallengeCritique succeeds without database configuration on the default mock path", async () => {
  const originalDeps = snapshotDeps();
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousDatabaseDirectUrl = process.env.DATABASE_DIRECT_URL;
  const previousOpenAIKey = process.env.OPENAI_API_KEY;

  applyCommonTestDeps();
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_DIRECT_URL;
  delete process.env.OPENAI_API_KEY;

  try {
    const result = await generateChallengeCritique({
      claimText: validInput.claimText,
    });

    assert.equal(result.provider, "mock");
    assert.equal(result.fallbackUsed, false);
    assert.match(result.critique.summary, /Weekly active usage will keep climbing/);
  } finally {
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }

    if (previousDatabaseDirectUrl === undefined) {
      delete process.env.DATABASE_DIRECT_URL;
    } else {
      process.env.DATABASE_DIRECT_URL = previousDatabaseDirectUrl;
    }

    if (previousOpenAIKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousOpenAIKey;
    }

    restoreDeps(originalDeps);
  }
});
