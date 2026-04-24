import type { AiOperationName } from "./operation-names.ts";

export type JsonObject = Record<string, unknown>;

export type AIJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type AIJobRecord = {
  id: string;
  userId: string;
  operation: AiOperationName;
  promptVersionId: string | null;
  status: AIJobStatus;
  inputJson: JsonObject;
  outputJson: JsonObject | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
};

export type CreatePendingAIJobInput = {
  userId: string;
  operation: AiOperationName;
  promptVersionId?: string | null;
  inputJson: JsonObject;
};

export type AIJobInsert = {
  userId: string;
  operation: AiOperationName;
  promptVersionId: string | null;
  status: "queued";
  inputJson: JsonObject;
  outputJson: null;
  errorMessage: null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: null;
  completedAt: null;
};

export type AIJobUpdate = {
  id: string;
  status: "succeeded" | "failed";
  outputJson: JsonObject | null;
  errorMessage: string | null;
  updatedAt: Date;
  completedAt: Date;
};

export type AIJobRepository = {
  insertAIJob(record: AIJobInsert): Promise<AIJobRecord>;
  updateAIJob(record: AIJobUpdate): Promise<AIJobRecord>;
};

export type AIJobClock = {
  now(): Date;
};

const systemClock: AIJobClock = {
  now: () => new Date(),
};

export async function createPendingAIJob(
  repository: AIJobRepository,
  input: CreatePendingAIJobInput,
  clock: AIJobClock = systemClock,
): Promise<AIJobRecord> {
  const now = clock.now();

  return repository.insertAIJob({
    userId: input.userId,
    operation: input.operation,
    promptVersionId: input.promptVersionId ?? null,
    status: "queued",
    inputJson: input.inputJson,
    outputJson: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
  });
}

export async function markAIJobCompleted(
  repository: AIJobRepository,
  input: { jobId: string; outputJson: JsonObject },
  clock: AIJobClock = systemClock,
): Promise<AIJobRecord> {
  const now = clock.now();

  return repository.updateAIJob({
    id: input.jobId,
    status: "succeeded",
    outputJson: input.outputJson,
    errorMessage: null,
    updatedAt: now,
    completedAt: now,
  });
}

export async function markAIJobFailed(
  repository: AIJobRepository,
  input: { jobId: string; errorMessage: string },
  clock: AIJobClock = systemClock,
): Promise<AIJobRecord> {
  const now = clock.now();

  return repository.updateAIJob({
    id: input.jobId,
    status: "failed",
    outputJson: null,
    errorMessage: input.errorMessage,
    updatedAt: now,
    completedAt: now,
  });
}
