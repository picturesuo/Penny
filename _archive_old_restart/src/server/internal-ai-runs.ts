import "server-only";

import { and, desc, eq, gte, inArray, lte, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { challengeCritiques, movesEvents } from "@/db/schema";
import { getDrizzleDb } from "@/db/drizzle";
import type { InternalAiRunFilters, InternalAiRunRecord, InternalAiRunsResponse } from "@/types/ai-runs";

const requestedStatus = "requested" as const;
const generatedStatus = "generated" as const;
const requestedEventType = "challenge.critique.requested" as const;
const generatedEventType = "challenge.critique.generated" as const;

const nullableTextFilterSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .nullable()
  .optional()
  .default(null);

const nullableUuidFilterSchema = z
  .string()
  .uuid()
  .nullable()
  .optional()
  .default(null);

const nullableDateFilterSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value, ctx) => {
    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid date.",
      });
      return z.NEVER;
    }

    return parsed;
  })
  .nullable()
  .optional()
  .default(null);

export const InternalAiRunQuerySchema = z
  .object({
    provider: nullableTextFilterSchema,
    model: nullableTextFilterSchema,
    prompt_version: nullableTextFilterSchema,
    status: z.enum([requestedStatus, generatedStatus]).nullable().optional().default(null),
    date_from: nullableDateFilterSchema,
    date_to: nullableDateFilterSchema,
    user_id: nullableUuidFilterSchema,
    claim_id: nullableUuidFilterSchema,
    round_id: nullableUuidFilterSchema,
    limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  })
  .superRefine((value, ctx) => {
    if (value.date_from && value.date_to && value.date_from > value.date_to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "date_from must be earlier than or equal to date_to.",
        path: ["date_from"],
      });
    }
  });

type InternalAiRunQueryInput = z.infer<typeof InternalAiRunQuerySchema>;

type ChallengeEventRow = {
  id: string;
  type: typeof requestedEventType | typeof generatedEventType;
  requestId: string | null;
  createdAt: Date;
  roundId: string | null;
  critiqueId: string | null;
};

type RequestedRunRow = {
  id: string;
  userId: string;
  mapId: string;
  claimId: string | null;
  requestId: string | null;
  createdAt: Date;
  roundId: string | null;
};

type AiRunMetadata = {
  observationId: string | null;
  traceId: string | null;
};

export function parseInternalAiRunFilters(searchParams: URLSearchParams): InternalAiRunQueryInput {
  return InternalAiRunQuerySchema.parse({
    provider: searchParams.get("provider") ?? undefined,
    model: searchParams.get("model") ?? undefined,
    prompt_version: searchParams.get("prompt_version") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    date_from: searchParams.get("date_from") ?? undefined,
    date_to: searchParams.get("date_to") ?? undefined,
    user_id: searchParams.get("user_id") ?? undefined,
    claim_id: searchParams.get("claim_id") ?? undefined,
    round_id: searchParams.get("round_id") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });
}

export async function listInternalAiRuns(input: InternalAiRunQueryInput): Promise<InternalAiRunsResponse> {
  const filters = normalizeFilters(input);
  const generatedRuns = shouldIncludeGenerated(filters) ? await listGeneratedRuns(filters) : [];
  const requestedRuns = shouldIncludeRequested(filters) ? await listRequestedRuns(filters) : [];
  const runs = [...generatedRuns, ...requestedRuns]
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
    .slice(0, filters.limit);

  return {
    runs,
    filters,
    meta: {
      count: runs.length,
      limit: filters.limit,
    },
  };
}

function normalizeFilters(input: InternalAiRunQueryInput): InternalAiRunFilters {
  return {
    provider: input.provider,
    model: input.model,
    promptVersion: input.prompt_version,
    status: input.status,
    dateFrom: serializeDate(input.date_from),
    dateTo: serializeDate(input.date_to),
    userId: input.user_id,
    claimId: input.claim_id,
    roundId: input.round_id,
    limit: input.limit,
  };
}

function shouldIncludeGenerated(filters: InternalAiRunFilters) {
  return filters.status == null || filters.status === generatedStatus;
}

function shouldIncludeRequested(filters: InternalAiRunFilters) {
  if (filters.status != null && filters.status !== requestedStatus) {
    return false;
  }

  return !filters.provider && !filters.model && !filters.promptVersion;
}

async function listGeneratedRuns(filters: InternalAiRunFilters): Promise<InternalAiRunRecord[]> {
  const db = getDrizzleDb();
  const rows = await db
    .select({
      id: challengeCritiques.id,
      userId: challengeCritiques.userId,
      mapId: challengeCritiques.mapId,
      claimId: challengeCritiques.claimId,
      roundId: challengeCritiques.roundId,
      workspaceContextId: challengeCritiques.workspaceContextId,
      provider: challengeCritiques.provider,
      model: challengeCritiques.model,
      promptVersion: challengeCritiques.promptVersion,
      validatedOutput: challengeCritiques.validatedOutput,
      createdAt: challengeCritiques.createdAt,
    })
    .from(challengeCritiques)
    .where(
      and(
        filters.provider ? eq(challengeCritiques.provider, filters.provider) : undefined,
        filters.model ? eq(challengeCritiques.model, filters.model) : undefined,
        filters.promptVersion ? eq(challengeCritiques.promptVersion, filters.promptVersion) : undefined,
        filters.userId ? eq(challengeCritiques.userId, filters.userId) : undefined,
        filters.claimId ? eq(challengeCritiques.claimId, filters.claimId) : undefined,
        filters.roundId ? eq(challengeCritiques.roundId, filters.roundId) : undefined,
        filters.dateFrom ? gte(challengeCritiques.createdAt, new Date(filters.dateFrom)) : undefined,
        filters.dateTo ? lte(challengeCritiques.createdAt, new Date(filters.dateTo)) : undefined,
      ),
    )
    .orderBy(desc(challengeCritiques.createdAt))
    .limit(filters.limit);

  if (!rows.length) {
    return [];
  }

  const roundIds = Array.from(new Set(rows.map((row) => row.roundId)));
  const eventRows = await db
    .select({
      id: movesEvents.id,
      type: movesEvents.type,
      requestId: movesEvents.requestId,
      createdAt: movesEvents.createdAt,
      roundId: sql<string | null>`${movesEvents.payload}->>'roundId'`,
      critiqueId: sql<string | null>`${movesEvents.payload}->>'critiqueId'`,
    })
    .from(movesEvents)
    .where(
      and(
        inArray(movesEvents.type, [requestedEventType, generatedEventType]),
        inArray(sql<string>`${movesEvents.payload}->>'roundId'`, roundIds),
      ),
    )
    .orderBy(desc(movesEvents.createdAt));

  const eventMap = buildRoundEventMap(
    eventRows.filter((row): row is ChallengeEventRow => row.type === requestedEventType || row.type === generatedEventType),
  );

  return rows.map((row) => {
    const metadata = readAiRunMetadata(row.validatedOutput);
    const requestedEvent = eventMap.requestedByRound.get(row.roundId);
    const generatedEvent = eventMap.generatedByRound.get(row.roundId);
    const generatedAt = serializeDate(generatedEvent?.createdAt ?? row.createdAt) ?? new Date(row.createdAt).toISOString();
    const requestedAt = serializeDate(requestedEvent?.createdAt);

    return {
      id: row.id,
      source: "challenge_critiques",
      status: generatedStatus,
      userId: row.userId,
      mapId: row.mapId,
      claimId: row.claimId,
      roundId: row.roundId,
      workspaceContextId: row.workspaceContextId,
      provider: row.provider,
      model: row.model,
      promptVersion: row.promptVersion,
      requestId: generatedEvent?.requestId ?? requestedEvent?.requestId ?? null,
      critiqueId: generatedEvent?.critiqueId ?? row.id,
      traceId: metadata.traceId,
      observationId: metadata.observationId,
      requestedAt,
      generatedAt,
      occurredAt: generatedAt,
    };
  });
}

async function listRequestedRuns(filters: InternalAiRunFilters): Promise<InternalAiRunRecord[]> {
  const db = getDrizzleDb();
  const generatedEvents = alias(movesEvents, "generated_events");

  const rows = await db
    .select({
      id: movesEvents.id,
      userId: movesEvents.userId,
      mapId: movesEvents.mapId,
      claimId: movesEvents.claimId,
      requestId: movesEvents.requestId,
      createdAt: movesEvents.createdAt,
      roundId: sql<string | null>`${movesEvents.payload}->>'roundId'`,
    })
    .from(movesEvents)
    .where(
      and(
        eq(movesEvents.type, requestedEventType),
        filters.userId ? eq(movesEvents.userId, filters.userId) : undefined,
        filters.claimId ? eq(movesEvents.claimId, filters.claimId) : undefined,
        filters.roundId ? eq(sql<string>`${movesEvents.payload}->>'roundId'`, filters.roundId) : undefined,
        filters.dateFrom ? gte(movesEvents.createdAt, new Date(filters.dateFrom)) : undefined,
        filters.dateTo ? lte(movesEvents.createdAt, new Date(filters.dateTo)) : undefined,
        notExists(
          db
            .select({ id: generatedEvents.id })
            .from(generatedEvents)
            .where(and(eq(generatedEvents.type, generatedEventType), eq(generatedEvents.requestId, movesEvents.requestId))),
        ),
      ),
    )
    .orderBy(desc(movesEvents.createdAt))
    .limit(filters.limit);

  return rows.map((row: RequestedRunRow) => {
    const requestedAt = new Date(row.createdAt).toISOString();

    return {
      id: row.id,
      source: "moves_events",
      status: requestedStatus,
      userId: row.userId,
      mapId: row.mapId,
      claimId: row.claimId,
      roundId: row.roundId,
      workspaceContextId: null,
      provider: null,
      model: null,
      promptVersion: null,
      requestId: row.requestId,
      critiqueId: null,
      traceId: null,
      observationId: null,
      requestedAt,
      generatedAt: null,
      occurredAt: requestedAt,
    };
  });
}

function buildRoundEventMap(rows: ChallengeEventRow[]) {
  const requestedByRound = new Map<string, ChallengeEventRow>();
  const generatedByRound = new Map<string, ChallengeEventRow>();

  for (const row of rows) {
    if (!row.roundId) {
      continue;
    }

    if (row.type === requestedEventType && !requestedByRound.has(row.roundId)) {
      requestedByRound.set(row.roundId, row);
    }

    if (row.type === generatedEventType && !generatedByRound.has(row.roundId)) {
      generatedByRound.set(row.roundId, row);
    }
  }

  return {
    requestedByRound,
    generatedByRound,
  };
}

function readAiRunMetadata(validatedOutput: Record<string, unknown>): AiRunMetadata {
  const aiRun = validatedOutput._aiRun;

  if (!aiRun || typeof aiRun !== "object") {
    return {
      traceId: null,
      observationId: null,
    };
  }

  const data = aiRun as Record<string, unknown>;

  return {
    traceId: typeof data.traceId === "string" ? data.traceId : null,
    observationId: typeof data.observationId === "string" ? data.observationId : null,
  };
}

function serializeDate(value: Date | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}
