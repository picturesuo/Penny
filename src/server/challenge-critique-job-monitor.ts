import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDrizzleDb } from "@/db/drizzle";
import { challengeCritiqueJobAttempts } from "@/db/schema";
import { normalizeError } from "@/lib/error-reporting";
import { logger } from "@/lib/logger";
import { isChallengeCritiqueValidationError } from "@/server/ai/challenge-critique-validation";

export const ChallengeCritiqueJobStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "validation_failed",
]);

export type ChallengeCritiqueJobStatus = z.infer<typeof ChallengeCritiqueJobStatusSchema>;

export const CHALLENGE_CRITIQUE_JOB_STATUS_MAP: Record<ChallengeCritiqueJobStatus, string> = {
  queued: "Request accepted and waiting to run.",
  running: "Provider execution is in flight.",
  succeeded: "Critique generation completed and persisted.",
  failed: "Execution failed before a valid critique was persisted.",
  validation_failed: "The AI output failed schema validation.",
};

const UuidSchema = z.string().uuid("Invalid UUID.");

const MonitorIdentitySchema = z.object({
  userId: UuidSchema,
  mapId: UuidSchema,
  claimId: UuidSchema,
  roundId: UuidSchema,
  idempotencyKey: z.string().trim().min(1).max(160),
});

const ListChallengeCritiqueJobsInputSchema = z.object({
  userId: UuidSchema,
  mapId: UuidSchema.nullable().optional().default(null),
  claimId: UuidSchema.nullable().optional().default(null),
  roundId: UuidSchema.nullable().optional().default(null),
  status: ChallengeCritiqueJobStatusSchema.nullable().optional().default(null),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
});

type MonitorIdentity = z.infer<typeof MonitorIdentitySchema>;
type ChallengeCritiqueJobAttemptRecord = typeof challengeCritiqueJobAttempts.$inferSelect;

export type ChallengeCritiqueJobAttemptSummary = {
  id: string;
  userId: string;
  mapId: string;
  claimId: string;
  roundId: string;
  idempotencyKey: string;
  status: ChallengeCritiqueJobStatus;
  provider: string | null;
  model: string | null;
  promptVersion: string | null;
  errorMessage: string | null;
  validationIssues: Record<string, unknown>;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChallengeCritiqueJobSummary = {
  userId: string;
  mapId: string;
  claimId: string;
  roundId: string;
  status: ChallengeCritiqueJobStatus;
  retryCount: number;
  latestAttempt: ChallengeCritiqueJobAttemptSummary;
  attempts: ChallengeCritiqueJobAttemptSummary[];
};

function toIsoString(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function mapChallengeCritiqueJobAttempt(
  record: ChallengeCritiqueJobAttemptRecord,
): ChallengeCritiqueJobAttemptSummary {
  return {
    id: record.id,
    userId: record.userId,
    mapId: record.mapId,
    claimId: record.claimId,
    roundId: record.roundId,
    idempotencyKey: record.idempotencyKey,
    status: ChallengeCritiqueJobStatusSchema.parse(record.status),
    provider: record.provider ?? null,
    model: record.model ?? null,
    promptVersion: record.promptVersion ?? null,
    errorMessage: record.errorMessage ?? null,
    validationIssues: record.validationIssues ?? {},
    queuedAt: record.queuedAt.toISOString(),
    startedAt: toIsoString(record.startedAt),
    finishedAt: toIsoString(record.finishedAt),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function buildAttemptWhereClause(input: z.infer<typeof ListChallengeCritiqueJobsInputSchema>) {
  const conditions = [eq(challengeCritiqueJobAttempts.userId, input.userId)];

  if (input.mapId) {
    conditions.push(eq(challengeCritiqueJobAttempts.mapId, input.mapId));
  }

  if (input.claimId) {
    conditions.push(eq(challengeCritiqueJobAttempts.claimId, input.claimId));
  }

  if (input.roundId) {
    conditions.push(eq(challengeCritiqueJobAttempts.roundId, input.roundId));
  }

  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

async function selectOne<T>(promise: Promise<T[]>) {
  const rows = await promise;
  return rows[0] ?? null;
}

async function upsertChallengeCritiqueJobAttempt(
  identityInput: MonitorIdentity,
  update: {
    status: ChallengeCritiqueJobStatus;
    provider?: string | null;
    model?: string | null;
    promptVersion?: string | null;
    errorMessage?: string | null;
    validationIssues?: Record<string, unknown>;
    queuedAt?: Date | null;
    startedAt?: Date | null;
    finishedAt?: Date | null;
  },
) {
  const identity = MonitorIdentitySchema.parse(identityInput);
  const db = getDrizzleDb();
  const existing = await selectOne(
    db
      .select()
      .from(challengeCritiqueJobAttempts)
      .where(
        and(
          eq(challengeCritiqueJobAttempts.roundId, identity.roundId),
          eq(challengeCritiqueJobAttempts.idempotencyKey, identity.idempotencyKey),
        ),
      )
      .limit(1),
  );

  if (existing) {
    await db
      .update(challengeCritiqueJobAttempts)
      .set({
        status: update.status,
        provider: update.provider ?? existing.provider,
        model: update.model ?? existing.model,
        promptVersion: update.promptVersion ?? existing.promptVersion,
        errorMessage: update.errorMessage ?? null,
        validationIssues: update.validationIssues ?? {},
        queuedAt: update.queuedAt ?? existing.queuedAt,
        startedAt: update.startedAt ?? existing.startedAt,
        finishedAt: update.finishedAt ?? null,
      })
      .where(eq(challengeCritiqueJobAttempts.id, existing.id));
    return;
  }

  await db.insert(challengeCritiqueJobAttempts).values({
    userId: identity.userId,
    mapId: identity.mapId,
    claimId: identity.claimId,
    roundId: identity.roundId,
    idempotencyKey: identity.idempotencyKey,
    status: update.status,
    provider: update.provider ?? null,
    model: update.model ?? null,
    promptVersion: update.promptVersion ?? null,
    errorMessage: update.errorMessage ?? null,
    validationIssues: update.validationIssues ?? {},
    queuedAt: update.queuedAt ?? new Date(),
    startedAt: update.startedAt ?? null,
    finishedAt: update.finishedAt ?? null,
  });
}

async function writeChallengeCritiqueJobAttempt(
  identity: MonitorIdentity,
  update: Parameters<typeof upsertChallengeCritiqueJobAttempt>[1],
) {
  try {
    await upsertChallengeCritiqueJobAttempt(identity, update);
  } catch (error) {
    const normalized = normalizeError(error);
    logger.warn("challenge_critique_job_monitor_write_failed", {
      userId: identity.userId,
      featureId: "challenge-critique-job-monitor",
      error: normalized.message,
      data: {
        roundId: identity.roundId,
        idempotencyKey: identity.idempotencyKey,
        status: update.status,
      },
    });
  }
}

export async function markChallengeCritiqueJobQueued(identity: MonitorIdentity) {
  await writeChallengeCritiqueJobAttempt(identity, {
    status: "queued",
    queuedAt: new Date(),
    startedAt: null,
    finishedAt: null,
    errorMessage: null,
    validationIssues: {},
  });
}

export async function markChallengeCritiqueJobRunning(identity: MonitorIdentity) {
  await writeChallengeCritiqueJobAttempt(identity, {
    status: "running",
    startedAt: new Date(),
    finishedAt: null,
    errorMessage: null,
    validationIssues: {},
  });
}

export async function markChallengeCritiqueJobSucceeded(
  identity: MonitorIdentity,
  details: {
    provider: string;
    model: string;
    promptVersion: string;
  },
) {
  await writeChallengeCritiqueJobAttempt(identity, {
    status: "succeeded",
    provider: details.provider,
    model: details.model,
    promptVersion: details.promptVersion,
    finishedAt: new Date(),
    errorMessage: null,
    validationIssues: {},
  });
}

export function mapChallengeCritiqueFailureStatus(error: unknown): ChallengeCritiqueJobStatus {
  return error instanceof z.ZodError || isChallengeCritiqueValidationError(error) ? "validation_failed" : "failed";
}

export async function markChallengeCritiqueJobFailed(identity: MonitorIdentity, error: unknown) {
  const normalized = normalizeError(error);
  await writeChallengeCritiqueJobAttempt(identity, {
    status: mapChallengeCritiqueFailureStatus(error),
    finishedAt: new Date(),
    errorMessage: normalized.message,
    validationIssues:
      error instanceof z.ZodError ? error.flatten() : isChallengeCritiqueValidationError(error) ? error.issues : {},
  });
}

export async function listChallengeCritiqueJobAttempts(
  input: z.input<typeof ListChallengeCritiqueJobsInputSchema>,
) {
  const parsed = ListChallengeCritiqueJobsInputSchema.parse(input);
  const db = getDrizzleDb();
  const groupedRows = await db
    .select({
      roundId: challengeCritiqueJobAttempts.roundId,
      attemptCount: sql<number>`count(*)::int`,
      lastUpdatedAt: sql<Date>`max(${challengeCritiqueJobAttempts.updatedAt})`,
    })
    .from(challengeCritiqueJobAttempts)
    .where(buildAttemptWhereClause(parsed))
    .groupBy(challengeCritiqueJobAttempts.roundId)
    .orderBy(desc(sql`max(${challengeCritiqueJobAttempts.updatedAt})`))
    .limit(Math.max(parsed.limit * 6, 60));

  const roundIds = groupedRows.map((row) => row.roundId);
  if (roundIds.length === 0) {
    return {
      attemptCountsByRoundId: new Map<string, number>(),
      attemptsByRoundId: new Map<string, ChallengeCritiqueJobAttemptSummary[]>(),
    };
  }

  const attemptRows = await db
    .select()
    .from(challengeCritiqueJobAttempts)
    .where(
      and(
        eq(challengeCritiqueJobAttempts.userId, parsed.userId),
        inArray(challengeCritiqueJobAttempts.roundId, roundIds),
      ),
    )
    .orderBy(desc(challengeCritiqueJobAttempts.updatedAt), desc(challengeCritiqueJobAttempts.queuedAt));

  const attemptsByRoundId = new Map<string, ChallengeCritiqueJobAttemptSummary[]>();
  for (const row of attemptRows) {
    const attempts = attemptsByRoundId.get(row.roundId) ?? [];
    attempts.push(mapChallengeCritiqueJobAttempt(row));
    attemptsByRoundId.set(row.roundId, attempts);
  }

  return {
    attemptCountsByRoundId: new Map(groupedRows.map((row) => [row.roundId, Number(row.attemptCount)])),
    attemptsByRoundId,
  };
}

export function summarizeChallengeCritiqueJobStatusCounts(jobs: ChallengeCritiqueJobSummary[]) {
  return jobs.reduce<Record<ChallengeCritiqueJobStatus, number>>(
    (counts, job) => {
      counts[job.status] += 1;
      return counts;
    },
    {
      queued: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      validation_failed: 0,
    },
  );
}

export async function listChallengeCritiqueJobs(
  input: z.input<typeof ListChallengeCritiqueJobsInputSchema>,
) {
  const parsed = ListChallengeCritiqueJobsInputSchema.parse(input);
  const { attemptCountsByRoundId, attemptsByRoundId } = await listChallengeCritiqueJobAttempts(parsed);

  const jobs = Array.from(attemptsByRoundId.entries())
    .map(([roundId, attempts]) => {
      const latestAttempt = attempts[0];
      if (!latestAttempt) {
        return null;
      }

      return {
        userId: latestAttempt.userId,
        mapId: latestAttempt.mapId,
        claimId: latestAttempt.claimId,
        roundId,
        status: latestAttempt.status,
        retryCount: Math.max(0, (attemptCountsByRoundId.get(roundId) ?? attempts.length) - 1),
        latestAttempt,
        attempts,
      } satisfies ChallengeCritiqueJobSummary;
    })
    .filter((job): job is ChallengeCritiqueJobSummary => job != null);

  const filteredJobs =
    parsed.status == null ? jobs : jobs.filter((job) => job.status === parsed.status);

  const limitedJobs = filteredJobs.slice(0, parsed.limit);

  return {
    jobs: limitedJobs,
    counts: summarizeChallengeCritiqueJobStatusCounts(limitedJobs),
    statusMap: CHALLENGE_CRITIQUE_JOB_STATUS_MAP,
  };
}
