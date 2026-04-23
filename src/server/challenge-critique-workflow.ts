import { tasks } from "@trigger.dev/sdk";
import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { getDrizzleDb } from "@/db/drizzle";
import { challengeCritiques, claims, dialecticRounds, maps, movesEvents } from "@/db/schema";
import { generateChallengeCritique } from "@/server/ai/service";
import {
  markChallengeCritiqueJobFailed,
  markChallengeCritiqueJobQueued,
  markChallengeCritiqueJobRunning,
  markChallengeCritiqueJobSucceeded,
} from "@/server/challenge-critique-job-monitor";
import {
  ChallengeCritiqueModeSchema,
  type GenerateChallengeCritiqueOutput,
} from "@/server/ai/schemas/challengeCritique";
import { buildInvalidationInput, type CommandResult } from "@/server/workspace-commands-internals";
import { invalidateWorkspaceProjections } from "@/server/workspace-cache";

const UuidSchema = z.string().uuid("Invalid UUID.");

export const ChallengeCritiqueTaskStateSchema = z.object({
  critiqueStatus: z.enum(["pending", "ready", "failed"]).nullable().optional().default(null),
  critiqueRequestId: z.string().trim().min(1).max(160).nullable().optional().default(null),
  critiqueRunId: z.string().trim().min(1).max(160).nullable().optional().default(null),
  critiqueRequestedAt: z.string().datetime().nullable().optional().default(null),
  critiqueGeneratedAt: z.string().datetime().nullable().optional().default(null),
  critiqueFailedAt: z.string().datetime().nullable().optional().default(null),
  critiqueError: z.string().trim().min(1).max(1000).nullable().optional().default(null),
  userGoal: z.string().trim().min(1).max(800).nullable().optional().default(null),
  suggestedConfidenceDelta: z.number().int().min(-100).max(100).nullable().optional().default(null),
  uncertaintyNote: z.string().trim().min(1).max(400).nullable().optional().default(null),
});

export const QueueChallengeCritiqueInputSchema = z.object({
  userId: UuidSchema,
  roundId: UuidSchema,
  steelmanText: z.string().trim().min(1).max(6000).nullable().optional().default(null),
  critiqueMode: ChallengeCritiqueModeSchema.nullable().optional().default(null),
  userGoal: z.string().trim().min(1).max(800).nullable().optional().default(null),
  requestId: z.string().trim().min(1).max(160).nullable().optional().default(null),
});

export const GenerateChallengeCritiqueJobPayloadSchema = z.object({
  userId: UuidSchema,
  roundId: UuidSchema,
  requestId: z.string().trim().min(1).max(160),
  steelmanText: z.string().trim().min(1).max(6000).nullable().optional().default(null),
  critiqueMode: ChallengeCritiqueModeSchema.nullable().optional().default(null),
  userGoal: z.string().trim().min(1).max(800).nullable().optional().default(null),
  triggerRunId: z.string().trim().min(1).max(160).nullable().optional().default(null),
});

export const QueuedChallengeCritiqueRequestSchema = z.object({
  roundId: UuidSchema,
  requestId: z.string().trim().min(1).max(160),
  triggerRunId: z.string().trim().min(1).max(160).nullable(),
  status: z.literal("accepted"),
  critiqueMode: ChallengeCritiqueModeSchema,
  userGoal: z.string().trim().min(1).max(800).nullable(),
  requestedAt: z.string().datetime(),
});

type TransactionDb = Parameters<Parameters<ReturnType<typeof getDrizzleDb>["transaction"]>[0]>[0];
type ChallengeRoundRecord = typeof dialecticRounds.$inferSelect;
type MoveEventRecord = typeof movesEvents.$inferSelect;

export type QueueChallengeCritiqueInput = z.infer<typeof QueueChallengeCritiqueInputSchema>;
export type GenerateChallengeCritiqueJobPayload = z.infer<typeof GenerateChallengeCritiqueJobPayloadSchema>;
export type QueuedChallengeCritiqueRequest = z.infer<typeof QueuedChallengeCritiqueRequestSchema>;

async function selectOne<T>(promise: Promise<T[]>): Promise<T | null> {
  const rows = await promise;
  return rows[0] ?? null;
}

function assertFound<T>(value: T | null, message: string): T {
  if (!value) {
    throw new Error(message);
  }

  return value;
}

function truncateText(value: string | null | undefined, maxLength: number) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

function parseCritiqueTaskState(value: Record<string, unknown> | null | undefined) {
  const parsed = ChallengeCritiqueTaskStateSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : ChallengeCritiqueTaskStateSchema.parse({});
}

function mergeCritiqueTaskState(
  existing: Record<string, unknown> | null | undefined,
  updates: Partial<z.infer<typeof ChallengeCritiqueTaskStateSchema>>,
) {
  const state = parseCritiqueTaskState(existing);

  return {
    ...(existing ?? {}),
    ...state,
    ...updates,
  };
}

async function appendEvent(
  tx: TransactionDb,
  data: {
    userId: string;
    mapId: string;
    claimId?: string | null;
    type: typeof movesEvents.$inferInsert.type;
    requestId?: string | null;
    payload?: Record<string, unknown>;
  },
): Promise<MoveEventRecord> {
  const [event] = await tx
    .insert(movesEvents)
    .values({
      userId: data.userId,
      mapId: data.mapId,
      claimId: data.claimId ?? null,
      conceptId: null,
      requestId: data.requestId ?? null,
      type: data.type,
      payload: data.payload ?? {},
    })
    .returning();

  return event;
}

async function getOwnedRound(tx: TransactionDb, roundId: string, userId: string) {
  return assertFound(
    await selectOne(
      tx.select().from(dialecticRounds).where(and(eq(dialecticRounds.id, roundId), eq(dialecticRounds.userId, userId))).limit(1),
    ),
    "Challenge round not found.",
  );
}

function resolveCritiqueMode(round: ChallengeRoundRecord, critiqueMode: QueueChallengeCritiqueInput["critiqueMode"]) {
  return critiqueMode ?? (round.critiqueMode as z.infer<typeof ChallengeCritiqueModeSchema> | null) ?? "direct";
}

function buildNeighborRelationship(sourceClaim: typeof claims.$inferSelect, neighbor: typeof claims.$inferSelect) {
  if (neighbor.parentClaimId === sourceClaim.id) {
    return "child";
  }

  if (sourceClaim.parentClaimId === neighbor.id) {
    return "parent";
  }

  if (sourceClaim.parentClaimId && neighbor.parentClaimId && sourceClaim.parentClaimId === neighbor.parentClaimId) {
    return "sibling";
  }

  return "nearby";
}

export async function queueChallengeCritiqueGeneration(
  input: z.input<typeof QueueChallengeCritiqueInputSchema>,
): Promise<CommandResult<QueuedChallengeCritiqueRequest>> {
  const parsed = QueueChallengeCritiqueInputSchema.parse(input);
  const db = getDrizzleDb();
  const requestId = parsed.requestId ?? crypto.randomUUID();
  const requestedAt = new Date().toISOString();

  const { round, events } = await db.transaction(async (tx) => {
    const round = await getOwnedRound(tx, parsed.roundId, parsed.userId);
    const existingCritique = await selectOne(
      tx.select().from(challengeCritiques).where(eq(challengeCritiques.roundId, round.id)).limit(1),
    );

    if (existingCritique) {
      throw new Error("Challenge critique already generated.");
    }

    const critiqueMode = resolveCritiqueMode(round, parsed.critiqueMode);

    const [updatedRound] = await tx
      .update(dialecticRounds)
      .set({
        critiqueGenerated: "Critique queued.",
        critiqueLens: critiqueMode,
        critiqueMode,
        uncertainty: mergeCritiqueTaskState(round.uncertainty, {
          critiqueStatus: "pending",
          critiqueRequestId: requestId,
          critiqueRequestedAt: requestedAt,
          critiqueGeneratedAt: null,
          critiqueFailedAt: null,
          critiqueError: null,
          userGoal: parsed.userGoal,
        }),
      })
      .where(eq(dialecticRounds.id, round.id))
      .returning();

    const requestedEvent = await appendEvent(tx, {
      userId: parsed.userId,
      mapId: updatedRound.mapId,
      claimId: updatedRound.claimId,
      requestId,
      type: "challenge.critique.requested",
      payload: {
        roundId: updatedRound.id,
        critiqueMode,
        userGoal: parsed.userGoal,
      },
    });

    return { round: updatedRound, events: [requestedEvent] };
  });

  const invalidation = invalidateWorkspaceProjections(
    buildInvalidationInput(parsed.userId, {
      mapId: round.mapId,
      claimId: round.claimId,
      workspaceContextId: round.workspaceContextId,
    }),
  );

  let triggerRunId: string | null = null;

  try {
    await markChallengeCritiqueJobQueued({
      userId: parsed.userId,
      mapId: round.mapId,
      claimId: round.claimId,
      roundId: round.id,
      idempotencyKey: requestId,
    });

    const handle = await tasks.trigger("generate-challenge-critique", {
      userId: parsed.userId,
      roundId: parsed.roundId,
      requestId,
      steelmanText: parsed.steelmanText,
      critiqueMode: parsed.critiqueMode,
      userGoal: parsed.userGoal,
      triggerRunId: null,
    } satisfies GenerateChallengeCritiqueJobPayload, {
      idempotencyKey: requestId,
      tags: ["penny", "challenge", "critique"],
    });

    triggerRunId = handle.id;

    await db
      .update(dialecticRounds)
      .set({
        uncertainty: mergeCritiqueTaskState(round.uncertainty, {
          critiqueStatus: "pending",
          critiqueRequestId: requestId,
          critiqueRequestedAt: requestedAt,
          critiqueRunId: triggerRunId,
          userGoal: parsed.userGoal,
        }),
      })
      .where(eq(dialecticRounds.id, round.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await markChallengeCritiqueJobFailed(
      {
        userId: parsed.userId,
        mapId: round.mapId,
        claimId: round.claimId,
        roundId: round.id,
        idempotencyKey: requestId,
      },
      error,
    );

    await db
      .update(dialecticRounds)
      .set({
        uncertainty: mergeCritiqueTaskState(round.uncertainty, {
          critiqueStatus: "failed",
          critiqueRequestId: requestId,
          critiqueRequestedAt: requestedAt,
          critiqueFailedAt: new Date().toISOString(),
          critiqueError: truncateText(message, 1000),
          userGoal: parsed.userGoal,
        }),
      })
      .where(eq(dialecticRounds.id, round.id));

    invalidateWorkspaceProjections(
      buildInvalidationInput(parsed.userId, {
        mapId: round.mapId,
        claimId: round.claimId,
        workspaceContextId: round.workspaceContextId,
      }),
    );

    throw error;
  }

  const record = QueuedChallengeCritiqueRequestSchema.parse({
    roundId: round.id,
    requestId,
    triggerRunId,
    status: "accepted",
    critiqueMode: resolveCritiqueMode(round, parsed.critiqueMode),
    userGoal: parsed.userGoal,
    requestedAt,
  });

  return { invalidation, events, record };
}

async function loadChallengeCritiqueJobState(parsed: GenerateChallengeCritiqueJobPayload) {
  const db = getDrizzleDb();
  const round = assertFound(
    await selectOne(
      db.select().from(dialecticRounds).where(and(eq(dialecticRounds.id, parsed.roundId), eq(dialecticRounds.userId, parsed.userId))).limit(1),
    ),
    "Challenge round not found.",
  );

  const critiqueRecord = await selectOne(db.select().from(challengeCritiques).where(eq(challengeCritiques.roundId, round.id)).limit(1));

  if (critiqueRecord) {
    return {
      round,
      critiqueRecord,
      claim: null,
      map: null,
      neighboringClaims: [],
      previousRounds: [],
    };
  }

  const claim = assertFound(
    await selectOne(db.select().from(claims).where(and(eq(claims.id, round.claimId), eq(claims.userId, parsed.userId))).limit(1)),
    "Claim not found.",
  );
  const map = assertFound(
    await selectOne(db.select().from(maps).where(and(eq(maps.id, round.mapId), eq(maps.userId, parsed.userId))).limit(1)),
    "Map not found.",
  );

  const neighboringClaims = await db
    .select()
    .from(claims)
    .where(and(eq(claims.userId, parsed.userId), eq(claims.mapId, map.id), ne(claims.id, claim.id)))
    .orderBy(desc(claims.updatedAt))
    .limit(6);

  const previousRounds = await db
    .select()
    .from(dialecticRounds)
    .where(and(eq(dialecticRounds.userId, parsed.userId), eq(dialecticRounds.claimId, claim.id), ne(dialecticRounds.id, round.id)))
    .orderBy(desc(dialecticRounds.roundNumber))
    .limit(4);

  return {
    round,
    critiqueRecord: null,
    claim,
    map,
    neighboringClaims,
    previousRounds,
  };
}

function buildPersistedCritiqueColumns(
  output: GenerateChallengeCritiqueOutput,
  round: ChallengeRoundRecord,
  payload: GenerateChallengeCritiqueJobPayload,
) {
  return {
    headline: output.conciseCritiqueSummary,
    critiqueText: output.strongestCounterargument,
    critiqueLens: resolveCritiqueMode(round, payload.critiqueMode),
    failureTypes: output.likelyFailureModes,
    dependencyRisks: output.assumptions,
    whyNow: output.uncertaintyNote,
  };
}

export async function runGenerateChallengeCritiqueJob(
  input: z.input<typeof GenerateChallengeCritiqueJobPayloadSchema>,
): Promise<
  | {
      status: "generated";
      roundId: string;
      critiqueId: string;
    }
  | {
      status: "already_ready";
      roundId: string;
      critiqueId: string;
    }
> {
  const parsed = GenerateChallengeCritiqueJobPayloadSchema.parse(input);
  const state = await loadChallengeCritiqueJobState(parsed);

  if (state.critiqueRecord) {
    return {
      status: "already_ready",
      roundId: state.round.id,
      critiqueId: state.critiqueRecord.id,
    };
  }

  if (!state.claim || !state.map) {
    throw new Error("Challenge critique generation state is incomplete.");
  }

  try {
    await markChallengeCritiqueJobRunning({
      userId: parsed.userId,
      mapId: state.round.mapId,
      claimId: state.round.claimId,
      roundId: state.round.id,
      idempotencyKey: parsed.requestId,
    });

    const result = await generateChallengeCritique(
      {
        mapTitle: state.map.title,
        claimId: state.claim.id,
        claimText: state.claim.text,
        claimConfidence: state.round.confidenceAtRoundStart,
        steelmanText: parsed.steelmanText,
        neighboringClaims: state.neighboringClaims.map((claim) => ({
          id: claim.id,
          text: claim.text,
          confidence: claim.confidence,
          kind: claim.kind,
          relationship: buildNeighborRelationship(state.claim!, claim),
        })),
        previousRounds: state.previousRounds.map((round) => ({
          roundId: round.id,
          roundNumber: round.roundNumber,
          critiqueSummary: truncateText(round.critiqueGenerated, 800) ?? "No critique summary recorded.",
          userResponse: truncateText(round.userResponse, 1200),
          responsePath: (round.responsePath as "defend" | "revise" | "absorb" | null) ?? null,
          confidenceDelta: round.confidenceDelta,
        })),
        userGoal: parsed.userGoal,
        critiqueMode: resolveCritiqueMode(state.round, parsed.critiqueMode),
      },
      {
        userId: parsed.userId,
        mapId: state.round.mapId,
        claimId: state.round.claimId,
        workspaceContextId: state.round.workspaceContextId,
      },
    );

    const db = getDrizzleDb();
    const generatedAt = new Date().toISOString();

    const { critique } = await db.transaction(async (tx) => {
      const round = await getOwnedRound(tx, parsed.roundId, parsed.userId);
      const existingCritique = await selectOne(tx.select().from(challengeCritiques).where(eq(challengeCritiques.roundId, round.id)).limit(1));
      const persistedColumns = buildPersistedCritiqueColumns(result.output, round, parsed);
      const nextTaskState = mergeCritiqueTaskState(round.uncertainty, {
        critiqueStatus: "ready",
        critiqueRequestId: parsed.requestId,
        critiqueRunId: parsed.triggerRunId,
        critiqueGeneratedAt: generatedAt,
        critiqueFailedAt: null,
        critiqueError: null,
        userGoal: parsed.userGoal,
        suggestedConfidenceDelta: result.output.suggestedConfidenceDelta,
        uncertaintyNote: result.output.uncertaintyNote,
      });

      await tx
        .update(dialecticRounds)
        .set({
          critiqueGenerated: result.output.strongestCounterargument,
          critiqueFailureTypes: result.output.likelyFailureModes,
          critiqueLens: persistedColumns.critiqueLens,
          critiqueMode: resolveCritiqueMode(round, parsed.critiqueMode),
          uncertainty: nextTaskState,
        })
        .where(eq(dialecticRounds.id, round.id));

      const validatedOutput = {
        ...result.output,
        _aiRun: {
          provider: result.meta.provider,
          model: result.meta.model,
          promptVersion: result.meta.promptVersion,
          release: result.meta.release,
          environment: result.meta.environment,
          traceId: result.meta.traceId,
          observationId: result.meta.observationId,
        },
      };

      const [critique] = existingCritique
        ? await tx
            .update(challengeCritiques)
            .set({
              provider: result.meta.provider,
              model: result.meta.model,
              promptVersion: result.meta.promptVersion,
              headline: persistedColumns.headline,
              critiqueText: persistedColumns.critiqueText,
              critiqueLens: persistedColumns.critiqueLens,
              failureTypes: persistedColumns.failureTypes,
              dependencyRisks: persistedColumns.dependencyRisks,
              whyNow: persistedColumns.whyNow,
              validatedOutput,
            })
            .where(eq(challengeCritiques.id, existingCritique.id))
            .returning()
        : await tx
            .insert(challengeCritiques)
            .values({
              userId: parsed.userId,
              mapId: round.mapId,
              claimId: round.claimId,
              roundId: round.id,
              workspaceContextId: round.workspaceContextId,
              provider: result.meta.provider,
              model: result.meta.model,
              promptVersion: result.meta.promptVersion,
              headline: persistedColumns.headline,
              critiqueText: persistedColumns.critiqueText,
              critiqueLens: persistedColumns.critiqueLens,
              failureTypes: persistedColumns.failureTypes,
              dependencyRisks: persistedColumns.dependencyRisks,
              whyNow: persistedColumns.whyNow,
              validatedOutput,
            })
            .returning();

      await appendEvent(tx, {
        userId: parsed.userId,
        mapId: round.mapId,
        claimId: round.claimId,
        requestId: parsed.requestId,
        type: "challenge.critique.generated",
        payload: {
          roundId: round.id,
          critiqueId: critique.id,
          provider: critique.provider,
          model: critique.model,
          promptVersion: critique.promptVersion,
        },
      });

      return { critique, round };
    });

    invalidateWorkspaceProjections(
      buildInvalidationInput(parsed.userId, {
        mapId: state.round.mapId,
        claimId: state.round.claimId,
        workspaceContextId: state.round.workspaceContextId,
      }),
    );

    await markChallengeCritiqueJobSucceeded(
      {
        userId: parsed.userId,
        mapId: state.round.mapId,
        claimId: state.round.claimId,
        roundId: state.round.id,
        idempotencyKey: parsed.requestId,
      },
      {
        provider: result.meta.provider,
        model: result.meta.model,
        promptVersion: result.meta.promptVersion,
      },
    );

    return {
      status: "generated",
      roundId: state.round.id,
      critiqueId: critique.id,
    };
  } catch (error) {
    const db = getDrizzleDb();
    const message = truncateText(error instanceof Error ? error.message : String(error), 1000);

    await markChallengeCritiqueJobFailed(
      {
        userId: parsed.userId,
        mapId: state.round.mapId,
        claimId: state.round.claimId,
        roundId: state.round.id,
        idempotencyKey: parsed.requestId,
      },
      error,
    );

    await db
      .update(dialecticRounds)
      .set({
        uncertainty: mergeCritiqueTaskState(state.round.uncertainty, {
          critiqueStatus: "failed",
          critiqueRequestId: parsed.requestId,
          critiqueRunId: parsed.triggerRunId,
          critiqueFailedAt: new Date().toISOString(),
          critiqueError: message,
          userGoal: parsed.userGoal,
        }),
      })
      .where(eq(dialecticRounds.id, state.round.id));

    invalidateWorkspaceProjections(
      buildInvalidationInput(parsed.userId, {
        mapId: state.round.mapId,
        claimId: state.round.claimId,
        workspaceContextId: state.round.workspaceContextId,
      }),
    );

    throw error;
  }
}
