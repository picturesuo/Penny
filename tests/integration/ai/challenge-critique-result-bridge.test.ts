import assert from "node:assert/strict";
import test from "node:test";

import type { ChallengeCritiqueResult } from "../../../server/ai/contracts/challengeCritiqueResult.ts";
import type {
  GenerateChallengeCritiqueBackendInput,
  GenerateChallengeCritiqueOutput,
  GenerateChallengeCritiqueResult,
} from "../../../server/ai/contracts/generateChallengeCritique.ts";
import {
  generateChallengeCritique,
  generateChallengeCritiqueDeps,
} from "../../../server/ai/operations/generateChallengeCritique.ts";

const claimRoundContext = {
  userId: "44444444-4444-4444-8444-444444444444",
  mapId: "55555555-5555-4555-8555-555555555555",
  claimId: "11111111-1111-4111-8111-111111111111",
  roundId: "33333333-3333-4333-8333-333333333333",
  critiqueId: "66666666-6666-4666-8666-666666666666",
  requestId: "bridge-contract-request",
  mapTitle: "Backend Bridge",
  claimText: "Penny can safely persist AI critiques once the result envelope is typed.",
  claimConfidence: 64,
  critiqueMode: "direct",
  previousRounds: [
    {
      roundId: "77777777-7777-4777-8777-777777777777",
      roundNumber: 1,
      critiqueSummary: "The prior challenge asked whether typed shape is enough.",
      userResponse: "The backend also needs explicit failure and metadata fields.",
      responsePath: "revise",
      confidenceDelta: -6,
    },
  ],
} satisfies GenerateChallengeCritiqueBackendInput;

const mockedCritiqueOutput = {
  conciseCritiqueSummary: "The claim treats a typed envelope as sufficient for persistence safety.",
  strongestCounterargument:
    "A typed envelope prevents shape drift, but storage safety also depends on explicit failure handling and metadata normalization.",
  assumptions: [
    "The backend will only pass ownership-checked context into AI.",
    "Consumers can tolerate nullable provider and error fields.",
  ],
  likelyFailureModes: [
    "A failed generation is stored without enough error detail to debug.",
    "Metadata contains non-serializable values that cannot be persisted safely.",
  ],
  followUpQuestions: [
    "Which metadata fields are required for incident review?",
    "Should round ownership live outside the AI result envelope?",
  ],
  suggestedConfidenceDelta: -9,
  uncertaintyNote: "The result shape is persistence-ready, but command-layer retry semantics remain separate.",
} satisfies GenerateChallengeCritiqueOutput;

function snapshotDeps() {
  return { ...generateChallengeCritiqueDeps };
}

function restoreDeps(originalDeps: ReturnType<typeof snapshotDeps>) {
  Object.assign(generateChallengeCritiqueDeps, originalDeps);
}

function toPersistenceReadyResult(
  result: GenerateChallengeCritiqueResult,
  context: { roundId?: string },
): ChallengeCritiqueResult {
  return {
    roundId: context.roundId,
    status: "succeeded",
    critiqueJson: result.output,
    provider: result.meta.provider,
    model: result.meta.model,
    promptVersion: result.meta.promptVersion,
    errorCode: null,
    errorMessage: null,
    metadata: {
      cost: result.meta.cost,
      environment: result.meta.environment,
      fallbackHopCount: result.meta.fallbackHopCount,
      latencyMs: result.meta.latencyMs,
      observationId: result.meta.observationId,
      release: result.meta.release,
      repairAttempted: result.meta.repairAttempted,
      routeTier: result.meta.routeTier,
      traceId: result.meta.traceId,
      usage: result.meta.usage,
      validationResult: result.meta.validationResult,
    },
  };
}

function assertPersistenceSafe(value: unknown) {
  assert.doesNotThrow(() => JSON.stringify(value));
  assert.equal(hasUnsafePersistenceValue(value), false);
}

function hasUnsafePersistenceValue(value: unknown): boolean {
  if (value === undefined || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    return true;
  }

  if (value === null || typeof value !== "object") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some(hasUnsafePersistenceValue);
  }

  return Object.values(value as Record<string, unknown>).some(hasUnsafePersistenceValue);
}

test("mocked generateChallengeCritique output converts to a persistence-ready result", async () => {
  const originalDeps = snapshotDeps();
  const providerRequests: unknown[] = [];

  generateChallengeCritiqueDeps.getActiveObservationId = () => "bridge-observation";
  generateChallengeCritiqueDeps.getDeployMetadata = () => ({
    environment: "test",
    release: "bridge-test",
  });
  generateChallengeCritiqueDeps.getTraceId = () => "bridge-trace";
  generateChallengeCritiqueDeps.resolveModelPolicy = () => [
    {
      provider: "anthropic",
      model: "claude-bridge",
      promptVersion: "challenge-critique-v1",
      tier: "default",
    },
  ];
  generateChallengeCritiqueDeps.startActiveObservation = async (_name, callback) =>
    callback({
      update() {
        return undefined;
      },
    });
  generateChallengeCritiqueDeps.invokeAnthropicStructured = async (request) => {
    providerRequests.push(request);

    return {
      output: mockedCritiqueOutput,
      usage: {
        inputTokens: 128,
        outputTokens: 72,
        totalTokens: 200,
      },
      cost: {
        totalUsd: 0.01,
        currency: "USD",
      },
    };
  };
  generateChallengeCritiqueDeps.invokeXaiStructured = async () => {
    throw new Error("xai should not be called in the single-provider bridge test");
  };

  try {
    const generated = await generateChallengeCritique(claimRoundContext, {
      userId: claimRoundContext.userId,
      mapId: claimRoundContext.mapId,
      claimId: claimRoundContext.claimId,
      roundId: claimRoundContext.roundId,
      requestId: claimRoundContext.requestId,
    });
    const persistenceReady = toPersistenceReadyResult(generated, {
      roundId: claimRoundContext.roundId,
    });

    assert.equal(providerRequests.length, 1);
    assert.deepEqual(persistenceReady, {
      roundId: claimRoundContext.roundId,
      status: "succeeded",
      critiqueJson: mockedCritiqueOutput,
      provider: "anthropic",
      model: "claude-bridge",
      promptVersion: "challenge-critique-v1",
      errorCode: null,
      errorMessage: null,
      metadata: {
        cost: {
          totalUsd: 0.01,
          currency: "USD",
        },
        environment: "test",
        fallbackHopCount: 0,
        latencyMs: generated.meta.latencyMs,
        observationId: "bridge-observation",
        release: "bridge-test",
        repairAttempted: false,
        routeTier: "default",
        traceId: "bridge-trace",
        usage: {
          inputTokens: 128,
          outputTokens: 72,
          totalTokens: 200,
        },
        validationResult: "valid",
      },
    } satisfies ChallengeCritiqueResult);
    assertPersistenceSafe(persistenceReady);
  } finally {
    restoreDeps(originalDeps);
  }
});
