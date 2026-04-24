import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  GENERATE_CHALLENGE_CRITIQUE_CONTRACT,
  type GenerateChallengeCritiqueBackendInput,
  type GenerateChallengeCritiqueOutput,
} from "../../../server/ai/contracts/generateChallengeCritique.ts";
import {
  generateChallengeCritique,
  generateChallengeCritiqueDeps,
} from "../../../server/ai/operations/generateChallengeCritique.ts";

const validBackendInput = {
  userId: "44444444-4444-4444-8444-444444444444",
  mapId: "55555555-5555-4555-8555-555555555555",
  claimId: "11111111-1111-4111-8111-111111111111",
  roundId: "33333333-3333-4333-8333-333333333333",
  critiqueId: "66666666-6666-4666-8666-666666666666",
  requestId: "critique-contract-request",
  mapTitle: "Penny backend bridge",
  claimText: "AI critiques should be persisted only after typed validation.",
  claimConfidence: 68,
  critiqueMode: "direct",
  neighboringClaims: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      text: "The backend event log is the durable audit trail.",
      confidence: 74,
      kind: "claim",
      relationship: "supporting",
    },
  ],
  previousRounds: [
    {
      roundId: "77777777-7777-4777-8777-777777777777",
      roundNumber: 1,
      critiqueSummary: "The previous round challenged whether validation was strict enough.",
      userResponse: "We should keep validation explicit at the AI boundary.",
      responsePath: "revise",
      confidenceDelta: -5,
    },
  ],
  userGoal: "Prepare the backend handoff without changing command architecture.",
} satisfies GenerateChallengeCritiqueBackendInput;

const validOutput = {
  conciseCritiqueSummary: "The claim assumes typed validation alone is enough to make AI persistence safe.",
  strongestCounterargument:
    "Typed validation catches malformed shape, but it does not prove semantic quality, ownership, or retry safety.",
  assumptions: [
    "The backend already supplies only authorized persisted context.",
    "The generated critique shape is stable enough for projections to consume.",
  ],
  likelyFailureModes: [
    "A valid but low-quality critique is persisted as if it were reliable.",
    "Retry behavior creates duplicate durable events around the same critique.",
  ],
  followUpQuestions: [
    "Which fields are required for projections versus only useful for tracing?",
    "What should happen when all providers fail after the placeholder exists?",
  ],
  suggestedConfidenceDelta: -12,
  uncertaintyNote: "The boundary is clear, but the backend still needs explicit retry and event semantics.",
} satisfies GenerateChallengeCritiqueOutput;

function snapshotDeps() {
  return { ...generateChallengeCritiqueDeps };
}

function restoreDeps(originalDeps: typeof generateChallengeCritiqueDeps) {
  Object.assign(generateChallengeCritiqueDeps, originalDeps);
}

test("AI backend contract doc names the handoff fields owned by the contract module", () => {
  const doc = readFileSync(resolve(process.cwd(), "docs/AI_BACKEND_CONTRACT.md"), "utf8");

  assert.match(doc, /# AI Backend Contract/);
  assert.match(doc, /generateChallengeCritique/);

  for (const field of GENERATE_CHALLENGE_CRITIQUE_CONTRACT.requiredBackendInput) {
    assert.match(doc, new RegExp(`\\b${field}\\b`), `Missing required backend input in contract doc: ${field}`);
  }

  for (const field of GENERATE_CHALLENGE_CRITIQUE_CONTRACT.outputFields) {
    assert.match(doc, new RegExp(`\\b${field}\\b`), `Missing AI output field in contract doc: ${field}`);
  }

  for (const field of GENERATE_CHALLENGE_CRITIQUE_CONTRACT.persistenceFields) {
    assert.match(doc, new RegExp(`\\b${field}\\b`), `Missing persistence field in contract doc: ${field}`);
  }

  for (const state of GENERATE_CHALLENGE_CRITIQUE_CONTRACT.failureStates) {
    assert.match(doc, new RegExp(`\\b${state}\\b`), `Missing failure state in contract doc: ${state}`);
  }
});

test("generateChallengeCritique returns the output and metadata the backend contract expects", async () => {
  const originalDeps = snapshotDeps();
  const providerRequests: unknown[] = [];

  generateChallengeCritiqueDeps.getActiveObservationId = () => "observation-contract";
  generateChallengeCritiqueDeps.getDeployMetadata = () => ({
    environment: "test",
    release: "contract-test",
  });
  generateChallengeCritiqueDeps.getTraceId = () => "trace-contract";
  generateChallengeCritiqueDeps.resolveModelPolicy = () => [
    {
      provider: "anthropic",
      model: "claude-contract",
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
      output: validOutput,
      usage: {
        inputTokens: 140,
        outputTokens: 90,
        totalTokens: 230,
      },
      cost: {
        totalUsd: 0.012,
        currency: "USD",
      },
    };
  };
  generateChallengeCritiqueDeps.invokeXaiStructured = async () => {
    throw new Error("xai should not be called for the single-route contract test");
  };

  try {
    const result = await generateChallengeCritique(validBackendInput, {
      userId: validBackendInput.userId,
      mapId: validBackendInput.mapId,
      claimId: validBackendInput.claimId,
      roundId: validBackendInput.roundId,
      requestId: validBackendInput.requestId,
    });

    assert.equal(providerRequests.length, 1);
    assert.deepEqual(result.output, validOutput);

    assert.equal(result.meta.provider, "anthropic");
    assert.equal(result.meta.model, "claude-contract");
    assert.equal(result.meta.promptVersion, "challenge-critique-v1");
    assert.equal(result.meta.traceId, "trace-contract");
    assert.equal(result.meta.observationId, "observation-contract");
    assert.equal(result.meta.validationResult, "valid");
    assert.equal(result.meta.usage.totalTokens, 230);
    assert.equal(result.meta.cost.totalUsd, 0.012);
  } finally {
    restoreDeps(originalDeps);
  }
});
