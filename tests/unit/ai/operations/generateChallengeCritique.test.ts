import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  canGenerateChallengeCritiqueNow,
  generateChallengeCritique,
  generateChallengeCritiqueDeps,
} from "../../../../server/ai/operations/generateChallengeCritique.ts";
import { PROMPT_VERSION } from "../../../../server/ai/prompts/generateChallengeCritique/v1.ts";

const validInput = {
  mapTitle: "Retention Thesis",
  claimId: "11111111-1111-4111-8111-111111111111",
  claimText: "Weekly active usage will keep climbing after manual onboarding is removed.",
  claimConfidence: 62,
  critiqueMode: "direct" as const,
  steelmanText: "Power users adopted quickly during the pilot.",
  userGoal: "Find the fastest falsification path before rollout.",
  neighboringClaims: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      text: "Pilot users received unusually high-touch onboarding.",
      confidence: 78,
      relationship: "tension",
    },
  ],
  previousRounds: [
    {
      roundId: "33333333-3333-4333-8333-333333333333",
      roundNumber: 1,
      critiqueSummary: "The evidence may be confounded by manual onboarding.",
      userResponse: "I need to compare self-serve users.",
      responsePath: "revise" as const,
      confidenceDelta: -9,
    },
  ],
};

const canonicalProviderOutput = {
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
};

const legacyProviderOutput = {
  conciseCritiqueSummary: "The claim may overfit to a founder-supported pilot cohort.",
  strongestCounterargument:
    "The observed retention lift may come from unusually motivated early users rather than a durable product effect.",
  assumptions: [
    "Pilot users resemble the broader target segment.",
    "Manual onboarding is not doing most of the retention work.",
  ],
  likelyFailureModes: [
    "Retention falls once founder-led onboarding is removed.",
    "Only the most motivated users sustain the behavior change.",
  ],
  followUpQuestions: [
    "What happens to retention when onboarding becomes fully self-serve?",
    "Which user segment falsifies this claim fastest?",
  ],
  suggestedConfidenceDelta: -15,
  uncertaintyNote: "The current evidence is directionally useful but still narrow.",
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

test("generateChallengeCritique sends the canonical prompt/schema contract and returns the legacy operation shape", async () => {
  const originalDeps = snapshotDeps();
  let capturedRequest: Record<string, unknown> | null = null;
  let capturedQualityTier: unknown = null;

  applyCommonTestDeps();
  generateChallengeCritiqueDeps.resolveModelPolicy = (_operationName, options) => {
    capturedQualityTier = options?.qualityTier ?? null;

    return [
      {
        provider: "anthropic",
        model: "claude-test",
        promptVersion: PROMPT_VERSION,
        tier: "default",
      },
    ];
  };
  generateChallengeCritiqueDeps.invokeAnthropicStructured = async (request) => {
    capturedRequest = request as Record<string, unknown>;

    return {
      output: canonicalProviderOutput,
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
  generateChallengeCritiqueDeps.invokeXaiStructured = async () => {
    throw new Error("xai should not be called");
  };

  try {
    const result = await generateChallengeCritique(
      {
        claimText: validInput.claimText,
        mapTitle: validInput.mapTitle,
        neighboringClaims: validInput.neighboringClaims,
        priorRoundContext: validInput.previousRounds,
        qualityTier: "cheap",
      },
      {
      userId: "44444444-4444-4444-8444-444444444444",
      mapId: "55555555-5555-4555-8555-555555555555",
      claimId: validInput.claimId,
      roundId: "66666666-6666-4666-8666-666666666666",
      promptVersion: PROMPT_VERSION,
      },
    );

    assert.deepEqual(result.critique, canonicalProviderOutput);
    assert.equal(result.provider, "anthropic");
    assert.equal(result.model, "claude-test");
    assert.equal(result.promptVersion, PROMPT_VERSION);
    assert.equal(result.repaired, false);
    assert.equal(result.fallbackUsed, false);
    assert.equal(result.traceId, "trace-123");
    assert.deepEqual(result.output, {
      ...legacyProviderOutput,
      suggestedConfidenceDelta: 0,
    });
    assert.equal(result.meta.provider, "anthropic");
    assert.equal(result.meta.promptVersion, PROMPT_VERSION);
    assert.equal(result.meta.validationResult, "valid");
    assert.equal(result.meta.repairAttempted, false);
    assert.equal(capturedQualityTier, "cheap");

    const requestForAssertions = capturedRequest as Record<string, unknown> | null;

    assert.ok(requestForAssertions);
    assert.equal(requestForAssertions.schemaName, "generateChallengeCritique");
    assert.match(String(requestForAssertions.userPrompt), /"summary": "string"/);
    assert.match(String(requestForAssertions.userPrompt), /"suggestedConfidenceBps": "integer\|null"/);
    assert.doesNotMatch(String(requestForAssertions.userPrompt), /conciseCritiqueSummary/);
    assert.deepEqual(
      (requestForAssertions.jsonSchema as { required?: unknown[] }).required,
      [
        "summary",
        "strongestCounterargument",
        "assumptions",
        "failureModes",
        "followUpQuestions",
        "suggestedConfidenceBps",
        "uncertaintyNote",
      ],
    );
  } finally {
    restoreDeps(originalDeps);
  }
});

test("generateChallengeCritique still accepts legacy mocked provider output", async () => {
  const originalDeps = snapshotDeps();

  applyCommonTestDeps();
  generateChallengeCritiqueDeps.resolveModelPolicy = () => [
    {
      provider: "anthropic",
      model: "claude-test",
      promptVersion: PROMPT_VERSION,
      tier: "default",
    },
  ];
  generateChallengeCritiqueDeps.invokeAnthropicStructured = async () => ({
    output: legacyProviderOutput,
    usage: {
      inputTokens: 80,
      outputTokens: 40,
      totalTokens: 120,
    },
    cost: {
      totalUsd: 0.006,
      currency: "USD",
    },
  });
  generateChallengeCritiqueDeps.invokeXaiStructured = async () => {
    throw new Error("xai should not be called");
  };

  try {
    const result = await generateChallengeCritique(validInput);

    assert.deepEqual(result.critique, canonicalProviderOutput);
    assert.equal(result.provider, "anthropic");
    assert.equal(result.repaired, false);
    assert.equal(result.fallbackUsed, false);
    assert.deepEqual(result.output, legacyProviderOutput);
    assert.equal(result.meta.validationResult, "valid");
    assert.equal(result.meta.repairAttempted, false);
  } finally {
    restoreDeps(originalDeps);
  }
});

test("generateChallengeCritique repairs one malformed response and accepts the canonical contract on retry", async () => {
  const originalDeps = snapshotDeps();
  let anthropicCalls = 0;

  applyCommonTestDeps();
  generateChallengeCritiqueDeps.resolveModelPolicy = () => [
    {
      provider: "anthropic",
      model: "claude-test",
      promptVersion: PROMPT_VERSION,
      tier: "default",
    },
  ];
  generateChallengeCritiqueDeps.invokeAnthropicStructured = async () => {
    anthropicCalls += 1;

    if (anthropicCalls === 1) {
      return {
        output: {
          strongestCounterargument: "Missing required fields should force repair.",
        },
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
        },
        cost: {
          totalUsd: 0.008,
          currency: "USD",
        },
      };
    }

    return {
      output: canonicalProviderOutput,
      usage: {
        inputTokens: 20,
        outputTokens: 10,
        totalTokens: 30,
      },
      cost: {
        totalUsd: 0.002,
        currency: "USD",
      },
    };
  };
  generateChallengeCritiqueDeps.invokeXaiStructured = async () => {
    throw new Error("xai should not be called");
  };

  try {
    const result = await generateChallengeCritique(validInput);

    assert.equal(anthropicCalls, 2);
    assert.deepEqual(result.critique, canonicalProviderOutput);
    assert.equal(result.provider, "anthropic");
    assert.equal(result.repaired, true);
    assert.equal(result.fallbackUsed, false);
    assert.deepEqual(result.output, legacyProviderOutput);
    assert.equal(result.meta.repairAttempted, true);
    assert.equal(result.meta.validationResult, "repaired_valid");
    assert.deepEqual(result.meta.usage, {
      inputTokens: 120,
      outputTokens: 60,
      totalTokens: 180,
    });
    assert.deepEqual(result.meta.cost, {
      totalUsd: 0.01,
      currency: "USD",
    });
  } finally {
    restoreDeps(originalDeps);
  }
});

test("generateChallengeCritique returns a structured failure when repair output is still invalid", async () => {
  const originalDeps = snapshotDeps();
  let anthropicCalls = 0;

  applyCommonTestDeps();
  generateChallengeCritiqueDeps.resolveModelPolicy = () => [
    {
      provider: "anthropic",
      model: "claude-test",
      promptVersion: PROMPT_VERSION,
      tier: "default",
    },
  ];
  generateChallengeCritiqueDeps.invokeAnthropicStructured = async () => {
    anthropicCalls += 1;

    return {
      output: {
        strongestCounterargument: anthropicCalls === 1 ? "First invalid response." : "Repair still invalid.",
      },
      usage: {
        inputTokens: anthropicCalls === 1 ? 100 : 20,
        outputTokens: anthropicCalls === 1 ? 50 : 10,
        totalTokens: anthropicCalls === 1 ? 150 : 30,
      },
      cost: {
        totalUsd: anthropicCalls === 1 ? 0.008 : 0.002,
        currency: "USD",
      },
    };
  };
  generateChallengeCritiqueDeps.invokeXaiStructured = async () => {
    throw new Error("xai should not be called");
  };

  try {
    await assert.rejects(
      () => generateChallengeCritique(validInput),
      (error: unknown) => {
        assert.equal(anthropicCalls, 2);
        assert.equal(error instanceof Error, true);
        assert.equal((error as Error).name, "GenerateChallengeCritiqueError");

        const structuredError = error as Error & {
          attempts?: number;
          code?: string;
          failures?: Array<{ message?: string; provider?: string; tier?: string }>;
          operationName?: string;
        };

        assert.equal(structuredError.code, "AI_OPERATION_FAILED");
        assert.equal(structuredError.operationName, "generateChallengeCritique");
        assert.equal(structuredError.attempts, 1);
        assert.equal(structuredError.failures?.length, 1);
        assert.equal(structuredError.failures?.[0]?.provider, "anthropic");
        assert.match(String(structuredError.failures?.[0]?.message), /failed validation after one repair pass/i);

        return true;
      },
    );
  } finally {
    restoreDeps(originalDeps);
  }
});

test("generateChallengeCritique returns a structured failure when all providers fail", async () => {
  const originalDeps = snapshotDeps();

  applyCommonTestDeps();
  generateChallengeCritiqueDeps.resolveModelPolicy = () => [
    {
      provider: "anthropic",
      model: "claude-test",
      promptVersion: PROMPT_VERSION,
      tier: "default",
    },
    {
      provider: "xai",
      model: "grok-test",
      promptVersion: PROMPT_VERSION,
      tier: "fallback",
    },
  ];
  generateChallengeCritiqueDeps.invokeAnthropicStructured = async () => {
    throw new Error("Anthropic unavailable");
  };
  generateChallengeCritiqueDeps.invokeXaiStructured = async () => {
    throw new Error("xAI unavailable");
  };

  try {
    await assert.rejects(
      () => generateChallengeCritique(validInput),
      (error: unknown) => {
        assert.equal(error instanceof Error, true);

        const structuredError = error as Error & {
          attempts?: number;
          code?: string;
          failures?: Array<{ message?: string; provider?: string }>;
          operationName?: string;
        };

        assert.equal(structuredError.name, "GenerateChallengeCritiqueError");
        assert.equal(structuredError.code, "AI_OPERATION_FAILED");
        assert.equal(structuredError.operationName, "generateChallengeCritique");
        assert.equal(structuredError.attempts, 2);
        assert.deepEqual(
          structuredError.failures?.map((failure) => ({
            provider: failure.provider,
            message: failure.message,
          })),
          [
            { provider: "anthropic", message: "Anthropic unavailable" },
            { provider: "xai", message: "xAI unavailable" },
          ],
        );

        return true;
      },
    );
  } finally {
    restoreDeps(originalDeps);
  }
});

test("generateChallengeCritique uses deterministic mock output by default when OPENAI_API_KEY is absent", async () => {
  const originalDeps = snapshotDeps();
  const previousOpenAIKey = process.env.OPENAI_API_KEY;

  delete process.env.OPENAI_API_KEY;
  applyCommonTestDeps();

  try {
    const result = await generateChallengeCritique(validInput);

    assert.equal(canGenerateChallengeCritiqueNow(), true);
    assert.equal(result.provider, "mock");
    assert.equal(result.model, "mock-demo");
    assert.equal(result.meta.provider, "mock");
    assert.equal(result.meta.validationResult, "valid");
    assert.match(result.critique.summary, /Weekly active usage will keep climbing/);
    assert.equal(result.fallbackUsed, false);
  } finally {
    restoreEnv("OPENAI_API_KEY", previousOpenAIKey);
    restoreDeps(originalDeps);
  }
});

test("generateChallengeCritique does not import or require DB write paths", () => {
  const operationSource = readFileSync(
    resolve(process.cwd(), "server/ai/operations/generateChallengeCritique.ts"),
    "utf8",
  );

  assert.doesNotMatch(operationSource, /server\/db|from "\.\.\/\.\.\/db|from "\.\.\/db|insertMoveEvent|updateChallengeCritique|getDb/);
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
