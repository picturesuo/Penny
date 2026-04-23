import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import * as schema from "@/db/schema";
import {
  ChallengeCritiqueValidationError,
} from "@/server/ai/challenge-critique-validation";
import {
  GenerateChallengeCritiqueOutputSchema,
} from "@/server/ai/schemas/challengeCritique";
import {
  challengeCritiqueWorkflowDeps,
  runGenerateChallengeCritiqueJob,
} from "@/server/challenge-critique-workflow";
import {
  challengeIds,
  critiqueOutputFixture,
  createClaimRecord,
  createCritiqueRecord,
  createMapRecord,
  createNeighborClaimRecord,
  createPriorRoundRecord,
  createRoundRecord,
} from "@/server/__tests__/fixtures/challenge";
import { FakeDrizzleDb } from "@/server/__tests__/helpers/fake-drizzle";

const { challengeCritiques, dialecticRounds, maps, claims, movesEvents } = schema;

const originalDeps = { ...challengeCritiqueWorkflowDeps };

function restoreWorkflowDeps() {
  Object.assign(challengeCritiqueWorkflowDeps, originalDeps);
}

function createWorkflowDb(overrides: Partial<Record<string, Record<string, unknown>[]>> = {}) {
  return new FakeDrizzleDb({
    maps: [createMapRecord()],
    claims: [createClaimRecord(), createNeighborClaimRecord()],
    challenge_rounds: [createRoundRecord(), createPriorRoundRecord()],
    challenge_critiques: [],
    moves_events: [],
    ...overrides,
  });
}

function buildPayload(overrides: Record<string, unknown> = {}) {
  return {
    userId: challengeIds.userId,
    roundId: challengeIds.roundId,
    claimVersion: "1713874500000",
    promptVersion: "challenge-critique-v1",
    qualityTier: "standard" as const,
    idempotencyKey: "challenge-critique:ready",
    requestId: "req-1",
    steelmanText: "Modularity keeps the codebase adaptable as the product expands.",
    critiqueMode: "direct" as const,
    userGoal: "Ship a backend plan that does not collapse under change.",
    triggerRunId: "run-1",
    ...overrides,
  };
}

function buildGeneratedResult() {
  return {
    output: critiqueOutputFixture,
    meta: {
      provider: "xai" as const,
      model: "grok-4-mini",
      promptVersion: "challenge-critique-v1",
      release: "test-release",
      environment: "test",
      latencyMs: 14,
      traceId: "trace-1",
      observationId: "obs-1",
      repairAttempted: false,
      usage: {
        inputTokens: 100,
        outputTokens: 55,
        totalTokens: 155,
      },
      cost: {
        totalUsd: 0.02,
        currency: "USD",
      },
      routeTier: "default" as const,
    },
  };
}

test("runGenerateChallengeCritiqueJob persists one ready critique on the happy path", async () => {
  const db = createWorkflowDb();
  const statusTransitions: string[] = [];
  const invalidations: unknown[] = [];

  challengeCritiqueWorkflowDeps.getDrizzleDb = () => db as never;
  challengeCritiqueWorkflowDeps.generateChallengeCritique = async () => buildGeneratedResult();
  challengeCritiqueWorkflowDeps.invalidateWorkspaceProjections = (input) => {
    invalidations.push(input);
    return null as never;
  };
  challengeCritiqueWorkflowDeps.markChallengeCritiqueJobRunning = async () => {
    statusTransitions.push("running");
  };
  challengeCritiqueWorkflowDeps.markChallengeCritiqueJobSucceeded = async () => {
    statusTransitions.push("succeeded");
  };
  challengeCritiqueWorkflowDeps.markChallengeCritiqueJobFailed = async () => {
    statusTransitions.push("failed");
  };

  try {
    const result = await runGenerateChallengeCritiqueJob(buildPayload());

    assert.equal(result.status, "generated");
    assert.equal(statusTransitions.join(">"), "running>succeeded");
    assert.equal(invalidations.length, 1);

    const critiqueRows = db.snapshot(challengeCritiques);
    assert.equal(critiqueRows.length, 1);
    assert.equal(critiqueRows[0]?.roundId, challengeIds.roundId);
    assert.equal(critiqueRows[0]?.provider, "xai");
    assert.equal(
      (critiqueRows[0]?.validatedOutput as Record<string, unknown>).strongestCounterargument,
      critiqueOutputFixture.strongestCounterargument,
    );

    const roundRows = db.snapshot(dialecticRounds);
    assert.equal(roundRows[0]?.critiqueGenerated, critiqueOutputFixture.strongestCounterargument);
    assert.equal((roundRows[0]?.uncertainty as Record<string, unknown>).critiqueStatus, "ready");

    const eventRows = db.snapshot(movesEvents);
    assert.equal(eventRows.length, 1);
    assert.equal(eventRows[0]?.type, "challenge.critique.generated");
  } finally {
    restoreWorkflowDeps();
  }
});

test("runGenerateChallengeCritiqueJob is idempotent when the critique already exists", async () => {
  const db = createWorkflowDb({
    challenge_critiques: [createCritiqueRecord()],
  });
  let invocationCount = 0;

  challengeCritiqueWorkflowDeps.getDrizzleDb = () => db as never;
  challengeCritiqueWorkflowDeps.generateChallengeCritique = async () => {
    invocationCount += 1;
    return buildGeneratedResult();
  };
  challengeCritiqueWorkflowDeps.markChallengeCritiqueJobRunning = async () => undefined;
  challengeCritiqueWorkflowDeps.markChallengeCritiqueJobSucceeded = async () => undefined;
  challengeCritiqueWorkflowDeps.markChallengeCritiqueJobFailed = async () => undefined;
  challengeCritiqueWorkflowDeps.invalidateWorkspaceProjections = () => null as never;

  try {
    const result = await runGenerateChallengeCritiqueJob(buildPayload());

    assert.equal(result.status, "already_ready");
    assert.equal(result.critiqueId, challengeIds.critiqueId);
    assert.equal(invocationCount, 0);
    assert.equal(db.snapshot(challengeCritiques).length, 1);
  } finally {
    restoreWorkflowDeps();
  }
});

test("runGenerateChallengeCritiqueJob marks schema validation failure without persisting a critique", async () => {
  const db = createWorkflowDb();
  const invalidOutput = GenerateChallengeCritiqueOutputSchema.safeParse({
    conciseCritiqueSummary: "",
  });

  assert.equal(invalidOutput.success, false);

  challengeCritiqueWorkflowDeps.getDrizzleDb = () => db as never;
  challengeCritiqueWorkflowDeps.generateChallengeCritique = async () => {
    throw new ChallengeCritiqueValidationError(
      "Challenge critique output failed schema validation after one repair pass.",
      (invalidOutput as { success: false; error: z.ZodError }).error,
      2,
    );
  };
  challengeCritiqueWorkflowDeps.markChallengeCritiqueJobRunning = async () => undefined;
  challengeCritiqueWorkflowDeps.markChallengeCritiqueJobSucceeded = async () => undefined;
  challengeCritiqueWorkflowDeps.markChallengeCritiqueJobFailed = async () => undefined;
  challengeCritiqueWorkflowDeps.invalidateWorkspaceProjections = () => null as never;

  try {
    await assert.rejects(
      () => runGenerateChallengeCritiqueJob(buildPayload()),
      (error: unknown) => error instanceof ChallengeCritiqueValidationError,
    );

    const roundRows = db.snapshot(dialecticRounds);
    assert.equal((roundRows[0]?.uncertainty as Record<string, unknown>).critiqueStatus, "validation_failed");
    assert.equal((roundRows[0]?.uncertainty as Record<string, unknown>).critiqueRepairAttempted, true);
    assert.equal(db.snapshot(challengeCritiques).length, 0);
  } finally {
    restoreWorkflowDeps();
  }
});

test("runGenerateChallengeCritiqueJob rejects unauthorized access without writing", async () => {
  const db = createWorkflowDb();

  challengeCritiqueWorkflowDeps.getDrizzleDb = () => db as never;
  challengeCritiqueWorkflowDeps.generateChallengeCritique = async () => buildGeneratedResult();
  challengeCritiqueWorkflowDeps.markChallengeCritiqueJobRunning = async () => undefined;
  challengeCritiqueWorkflowDeps.markChallengeCritiqueJobSucceeded = async () => undefined;
  challengeCritiqueWorkflowDeps.markChallengeCritiqueJobFailed = async () => undefined;
  challengeCritiqueWorkflowDeps.invalidateWorkspaceProjections = () => null as never;

  try {
    await assert.rejects(
      () =>
        runGenerateChallengeCritiqueJob(
          buildPayload({
            userId: challengeIds.otherUserId,
          }),
        ),
      /Challenge round not found\./,
    );

    assert.equal(db.snapshot(challengeCritiques).length, 0);
    assert.equal(db.snapshot(movesEvents).length, 0);
    assert.equal(db.snapshot(maps).length, 1);
    assert.equal(db.snapshot(claims).length, 2);
  } finally {
    restoreWorkflowDeps();
  }
});
