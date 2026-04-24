import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

type GenerateChallengeCritiqueRoute = {
  model: string;
  promptVersion: string;
  provider: "anthropic" | "xai";
  tier: string;
};

type GenerateChallengeCritiqueModule = {
  generateChallengeCritique: (input: unknown, context?: unknown) => Promise<unknown>;
  generateChallengeCritiqueDeps: {
    getActiveObservationId: () => string | null;
    getDeployMetadata: () => { environment: string; release: string };
    getTraceId: () => string | null;
    invokeAnthropicStructured: (input: unknown) => Promise<unknown>;
    invokeXaiStructured: (input: unknown) => Promise<unknown>;
    resolveModelPolicy: (operationName: string, options?: unknown) => GenerateChallengeCritiqueRoute[];
    startActiveObservation: (
      name: string,
      callback: (generation: { update: (input: unknown) => void }) => Promise<unknown>,
      options?: unknown,
    ) => Promise<unknown>;
  };
};

const operationModulePath = resolve(process.cwd(), "server/ai/operations/generateChallengeCritique.ts");
const operationImplemented = existsSync(operationModulePath);
const contractTest = operationImplemented ? test : test.skip;

const validOperationInput = {
  mapTitle: "Penny OS Architecture",
  claimId: "11111111-1111-4111-8111-111111111111",
  claimText: "A modular backend architecture is the right choice for Penny now.",
  claimConfidence: 62,
  steelmanText: "Modularity keeps interfaces reusable.",
  neighboringClaims: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      text: "Event-driven updates should stay in-process while the product is still changing.",
      confidence: 55,
      kind: "claim",
      relationship: "nearby",
    },
  ],
  previousRounds: [
    {
      roundId: "33333333-3333-4333-8333-333333333333",
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

const validCritiqueOutput = {
  conciseCritiqueSummary: "The claim assumes modularity pays off before the team has stable interfaces.",
  strongestCounterargument:
    "The main risk is premature interface design: you can create coordination overhead before the product has repeated enough patterns to justify module boundaries.",
  assumptions: [
    "The product boundaries are stable enough to modularize now.",
    "The team can absorb extra interface and deployment complexity immediately.",
  ],
  likelyFailureModes: [
    "Cross-module churn slows the product while key flows are still moving.",
    "The architecture encodes boundaries that later turn out to be wrong.",
  ],
  followUpQuestions: [
    "Which interfaces are already stable across at least three recent changes?",
    "What concrete delivery bottleneck does modularity solve this month?",
  ],
  suggestedConfidenceDelta: -18,
  uncertaintyNote: "This critique is directionally strong, but it still depends on how volatile the current product surface is.",
};

async function loadOperationModule(): Promise<GenerateChallengeCritiqueModule> {
  const imported = await import(pathToFileURL(operationModulePath).href);

  assert.equal(typeof imported.generateChallengeCritique, "function");
  assert.equal(typeof imported.generateChallengeCritiqueDeps, "object");

  return imported as GenerateChallengeCritiqueModule;
}

function defaultRoutes(): GenerateChallengeCritiqueRoute[] {
  return [
    {
      provider: "anthropic",
      model: "claude-test",
      promptVersion: "challenge-critique-v1",
      tier: "default",
    },
  ];
}

function applyCommonTestDeps(module: GenerateChallengeCritiqueModule) {
  module.generateChallengeCritiqueDeps.getDeployMetadata = () => ({
    environment: "test",
    release: "test-release",
  });
  module.generateChallengeCritiqueDeps.getTraceId = () => "trace-123";
  module.generateChallengeCritiqueDeps.getActiveObservationId = () => "obs-123";
  module.generateChallengeCritiqueDeps.startActiveObservation = async (_name, callback) =>
    callback({
      update() {
        return undefined;
      },
    });
}

function snapshotDeps(module: GenerateChallengeCritiqueModule) {
  return { ...module.generateChallengeCritiqueDeps };
}

function restoreDeps(module: GenerateChallengeCritiqueModule, originalDeps: GenerateChallengeCritiqueModule["generateChallengeCritiqueDeps"]) {
  Object.assign(module.generateChallengeCritiqueDeps, originalDeps);
}

contractTest("generateChallengeCritique returns a critique on the normal happy path", async () => {
  const module = await loadOperationModule();
  const originalDeps = snapshotDeps(module);

  applyCommonTestDeps(module);
  module.generateChallengeCritiqueDeps.resolveModelPolicy = () => defaultRoutes();
  module.generateChallengeCritiqueDeps.invokeAnthropicStructured = async () => ({
    output: validCritiqueOutput,
    usage: {
      inputTokens: 120,
      outputTokens: 64,
      totalTokens: 184,
    },
    cost: {
      totalUsd: 0.01,
      currency: "USD",
    },
  });
  module.generateChallengeCritiqueDeps.invokeXaiStructured = async () => {
    throw new Error("xai should not be called on the happy path");
  };

  try {
    const result = (await module.generateChallengeCritique(validOperationInput, {
      userId: "44444444-4444-4444-8444-444444444444",
      mapId: "55555555-5555-4555-8555-555555555555",
      claimId: validOperationInput.claimId,
      promptVersion: "challenge-critique-v1",
    })) as {
      meta: { fallbackHopCount?: number; provider?: string; repairAttempted?: boolean; validationResult?: string };
      output: typeof validCritiqueOutput;
    };

    assert.deepEqual(result.output, validCritiqueOutput);
    assert.equal(result.meta.provider, "anthropic");
    assert.equal(result.meta.repairAttempted, false);
    assert.equal(result.meta.validationResult, "valid");
    assert.equal(result.meta.fallbackHopCount, 0);
  } finally {
    restoreDeps(module, originalDeps);
  }
});

contractTest("generateChallengeCritique repairs one invalid provider response and returns the repaired output", async () => {
  const module = await loadOperationModule();
  const originalDeps = snapshotDeps(module);
  const providerCalls: string[] = [];

  applyCommonTestDeps(module);
  module.generateChallengeCritiqueDeps.resolveModelPolicy = () => defaultRoutes();
  module.generateChallengeCritiqueDeps.invokeAnthropicStructured = async () => {
    providerCalls.push("anthropic");

    if (providerCalls.length === 1) {
      return {
        output: {
          strongestCounterargument: "Missing required fields should force repair.",
        },
        usage: {
          inputTokens: 110,
          outputTokens: 50,
          totalTokens: 160,
        },
        cost: {
          totalUsd: 0.008,
          currency: "USD",
        },
      };
    }

    return {
      output: validCritiqueOutput,
      usage: {
        inputTokens: 30,
        outputTokens: 20,
        totalTokens: 50,
      },
      cost: {
        totalUsd: 0.002,
        currency: "USD",
      },
    };
  };
  module.generateChallengeCritiqueDeps.invokeXaiStructured = async () => {
    throw new Error("xai should not be called during same-provider repair");
  };

  try {
    const result = (await module.generateChallengeCritique(validOperationInput, {
      claimId: validOperationInput.claimId,
      promptVersion: "challenge-critique-v1",
    })) as {
      meta: { provider?: string; repairAttempted?: boolean; validationResult?: string };
      output: typeof validCritiqueOutput;
    };

    assert.deepEqual(providerCalls, ["anthropic", "anthropic"]);
    assert.deepEqual(result.output, validCritiqueOutput);
    assert.equal(result.meta.provider, "anthropic");
    assert.equal(result.meta.repairAttempted, true);
    assert.equal(result.meta.validationResult, "repaired_valid");
  } finally {
    restoreDeps(module, originalDeps);
  }
});

contractTest("generateChallengeCritique falls back to the next provider after a provider failure", async () => {
  const module = await loadOperationModule();
  const originalDeps = snapshotDeps(module);
  const providerCalls: string[] = [];

  applyCommonTestDeps(module);
  module.generateChallengeCritiqueDeps.resolveModelPolicy = () => [
    {
      provider: "anthropic",
      model: "claude-test",
      promptVersion: "challenge-critique-v1",
      tier: "default",
    },
    {
      provider: "xai",
      model: "grok-test",
      promptVersion: "challenge-critique-v1",
      tier: "fallback",
    },
  ];
  module.generateChallengeCritiqueDeps.invokeAnthropicStructured = async () => {
    providerCalls.push("anthropic");
    throw new Error("Anthropic unavailable");
  };
  module.generateChallengeCritiqueDeps.invokeXaiStructured = async () => {
    providerCalls.push("xai");
    return {
      output: validCritiqueOutput,
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
    const result = (await module.generateChallengeCritique(validOperationInput, {
      claimId: validOperationInput.claimId,
      promptVersion: "challenge-critique-v1",
    })) as {
      meta: { fallbackHopCount?: number; provider?: string; routeTier?: string };
      output: typeof validCritiqueOutput;
    };

    assert.deepEqual(providerCalls, ["anthropic", "xai"]);
    assert.deepEqual(result.output, validCritiqueOutput);
    assert.equal(result.meta.provider, "xai");
    assert.equal(result.meta.routeTier, "fallback");
    assert.equal(result.meta.fallbackHopCount, 1);
  } finally {
    restoreDeps(module, originalDeps);
  }
});

contractTest("generateChallengeCritique returns a structured error after total provider failure", async () => {
  const module = await loadOperationModule();
  const originalDeps = snapshotDeps(module);

  applyCommonTestDeps(module);
  module.generateChallengeCritiqueDeps.resolveModelPolicy = () => [
    {
      provider: "anthropic",
      model: "claude-test",
      promptVersion: "challenge-critique-v1",
      tier: "default",
    },
    {
      provider: "xai",
      model: "grok-test",
      promptVersion: "challenge-critique-v1",
      tier: "fallback",
    },
  ];
  module.generateChallengeCritiqueDeps.invokeAnthropicStructured = async () => {
    throw new Error("Anthropic unavailable");
  };
  module.generateChallengeCritiqueDeps.invokeXaiStructured = async () => {
    throw new Error("xAI unavailable");
  };

  try {
    await assert.rejects(
      () => module.generateChallengeCritique(validOperationInput, { claimId: validOperationInput.claimId }),
      (error) => {
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
        assert.equal(Array.isArray(structuredError.failures), true);
        assert.equal(structuredError.failures?.length, 2);
        assert.deepEqual(
          structuredError.failures?.map((failure) => ({
            provider: failure.provider,
            message: failure.message,
          })),
          [
            {
              provider: "anthropic",
              message: "Anthropic unavailable",
            },
            {
              provider: "xai",
              message: "xAI unavailable",
            },
          ],
        );

        return true;
      },
    );
  } finally {
    restoreDeps(module, originalDeps);
  }
});
