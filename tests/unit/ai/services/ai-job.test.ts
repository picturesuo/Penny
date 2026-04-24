import assert from "node:assert/strict";
import test from "node:test";

import {
  createPendingAIJob,
  markAIJobCompleted,
  markAIJobFailed,
  type AIJobInsert,
  type AIJobRecord,
  type AIJobRepository,
  type AIJobUpdate,
} from "../../../../server/ai/services/ai-job.ts";

function createRepository(): AIJobRepository & {
  inserts: AIJobInsert[];
  updates: AIJobUpdate[];
} {
  const inserts: AIJobInsert[] = [];
  const updates: AIJobUpdate[] = [];

  return {
    inserts,
    updates,
    async insertAIJob(record) {
      inserts.push(record);

      return {
        id: "job-1",
        ...record,
      } satisfies AIJobRecord;
    },
    async updateAIJob(record) {
      updates.push(record);

      return {
        id: record.id,
        userId: "user-1",
        operation: "capture_thought",
        promptVersionId: null,
        status: record.status,
        inputJson: { thought: "test" },
        outputJson: record.outputJson,
        errorMessage: record.errorMessage,
        createdAt: new Date("2026-04-24T00:00:00.000Z"),
        updatedAt: record.updatedAt,
        startedAt: null,
        completedAt: record.completedAt,
      } satisfies AIJobRecord;
    },
  };
}

test("createPendingAIJob inserts a queued job with structured input JSON", async () => {
  const repository = createRepository();
  const now = new Date("2026-04-24T12:00:00.000Z");

  const job = await createPendingAIJob(
    repository,
    {
      userId: "user-1",
      operation: "capture_thought",
      promptVersionId: "prompt-version-1",
      inputJson: { rawThought: "Distribution will be the moat." },
    },
    { now: () => now },
  );

  assert.equal(job.status, "queued");
  assert.equal(repository.inserts.length, 1);
  assert.deepEqual(repository.inserts[0], {
    userId: "user-1",
    operation: "capture_thought",
    promptVersionId: "prompt-version-1",
    status: "queued",
    inputJson: { rawThought: "Distribution will be the moat." },
    outputJson: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
  });
});

test("markAIJobCompleted stores structured output JSON and closes the job", async () => {
  const repository = createRepository();
  const now = new Date("2026-04-24T12:05:00.000Z");

  const job = await markAIJobCompleted(
    repository,
    {
      jobId: "job-1",
      outputJson: { result: { claimCount: 2 }, confidence: 0.82, notes: ["ok"] },
    },
    { now: () => now },
  );

  assert.equal(job.status, "succeeded");
  assert.deepEqual(repository.updates[0], {
    id: "job-1",
    status: "succeeded",
    outputJson: { result: { claimCount: 2 }, confidence: 0.82, notes: ["ok"] },
    errorMessage: null,
    updatedAt: now,
    completedAt: now,
  });
});

test("markAIJobFailed clears output JSON and stores the failure message", async () => {
  const repository = createRepository();
  const now = new Date("2026-04-24T12:10:00.000Z");

  const job = await markAIJobFailed(repository, { jobId: "job-1", errorMessage: "Provider unavailable." }, { now: () => now });

  assert.equal(job.status, "failed");
  assert.deepEqual(repository.updates[0], {
    id: "job-1",
    status: "failed",
    outputJson: null,
    errorMessage: "Provider unavailable.",
    updatedAt: now,
    completedAt: now,
  });
});
