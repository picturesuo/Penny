import { eq } from "drizzle-orm";

import { getDb } from "../../db/client.ts";
import { activityEvents, aiJobs, type AIJobRecord as DbAIJobRecord } from "../../db/schema.ts";
import {
  createPendingAIJob,
  markAIJobCompleted,
  markAIJobFailed,
  type AIJobRecord,
  type AIJobRepository,
  type JsonObject,
} from "./ai-job.ts";
import type { AiOperationName } from "./operation-names.ts";

type DbLike = ReturnType<typeof getDb>;
type DbAIJobWrite = Pick<DbLike, "insert" | "update">;

export type LoggedAIOperationInput<TOutput extends JsonObject> = {
  userId: string;
  operation: AiOperationName;
  inputJson: JsonObject;
  run(): TOutput | Promise<TOutput>;
  eventType: string;
  requestId?: string | null;
  promptVersionId?: string | null;
  sessionId?: string | null;
  thoughtId?: string | null;
  claimId?: string | null;
};

export type LoggedAIOperationResult<TOutput extends JsonObject> = {
  aiJob: AIJobRecord;
  output: TOutput;
};

function isUuid(value: string | null | undefined) {
  return Boolean(
    value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
  );
}

function asJsonObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as JsonObject;
}

function toAIJobRecord(row: DbAIJobRecord): AIJobRecord {
  return {
    id: row.id,
    userId: row.userId,
    operation: row.operation as AiOperationName,
    promptVersionId: row.promptVersionId,
    status: row.status,
    inputJson: asJsonObject(row.inputJson),
    outputJson: row.outputJson === null ? null : asJsonObject(row.outputJson),
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  };
}

export function createDbAIJobRepository(db: DbAIJobWrite = getDb()): AIJobRepository {
  return {
    async insertAIJob(record) {
      const [row] = await db.insert(aiJobs).values(record).returning();

      if (!row) {
        throw new Error("Failed to insert AI job.");
      }

      return toAIJobRecord(row);
    },
    async updateAIJob(record) {
      const [row] = await db
        .update(aiJobs)
        .set({
          status: record.status,
          outputJson: record.outputJson,
          errorMessage: record.errorMessage,
          updatedAt: record.updatedAt,
          completedAt: record.completedAt,
        })
        .where(eq(aiJobs.id, record.id))
        .returning();

      if (!row) {
        throw new Error(`AI job not found: ${record.id}`);
      }

      return toAIJobRecord(row);
    },
  };
}

export async function runLoggedAIOperation<TOutput extends JsonObject>(
  input: LoggedAIOperationInput<TOutput>,
  db: DbLike = getDb(),
): Promise<LoggedAIOperationResult<TOutput>> {
  return db.transaction(async (tx) => {
    const repository = createDbAIJobRepository(tx);
    const aiJob = await createPendingAIJob(repository, {
      userId: input.userId,
      operation: input.operation,
      promptVersionId: input.promptVersionId ?? null,
      inputJson: input.inputJson,
    });

    try {
      const output = await input.run();
      const completedJob = await markAIJobCompleted(repository, {
        jobId: aiJob.id,
        outputJson: output,
      });
      const now = completedJob.completedAt ?? completedJob.updatedAt;
      const claimId = isUuid(input.claimId) ? input.claimId : null;
      const thoughtId = isUuid(input.thoughtId) ? input.thoughtId : null;
      const sessionId = isUuid(input.sessionId) ? input.sessionId : null;

      await tx.insert(activityEvents).values({
        userId: input.userId,
        sessionId,
        thoughtId,
        claimId,
        aiJobId: completedJob.id,
        aggregateType: "ai_job",
        aggregateId: completedJob.id,
        type: input.eventType,
        payloadJson: {
          operation: input.operation,
          input: input.inputJson,
          output,
        },
        requestId: input.requestId ?? null,
        createdAt: now,
      });

      return {
        aiJob: completedJob,
        output,
      };
    } catch (error) {
      await markAIJobFailed(repository, {
        jobId: aiJob.id,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });
}

export const aiOperationLogDeps = {
  runLoggedAIOperation,
};
