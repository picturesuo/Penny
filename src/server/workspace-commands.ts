import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDrizzleDb } from "@/db/drizzle";
import {
  claimConceptEdges,
  challengeCritiques,
  claims,
  concepts,
  dialecticRounds,
  learningPrompts,
  maps,
  movesEvents,
  workspaceContexts,
} from "@/db/schema";
import { generateChallengeCritique } from "@/server/ai/service";
import {
  invalidateWorkspaceProjections,
  type WorkspaceProjectionInvalidationInput,
  type WorkspaceProjectionInvalidationResult,
} from "@/server/workspace-cache";

const UuidSchema = z.string().uuid("Invalid UUID.");
const JsonObjectSchema = z.record(z.string(), z.unknown()).default({});
const StringArraySchema = z.array(z.string()).default([]);
const WorkspaceModeSchema = z.enum(["brain", "challenge", "learn"]);
const ResponsePathSchema = z.enum(["defend", "revise", "absorb"]);

const createMapSchema = z.object({
  userId: UuidSchema,
  sphereId: UuidSchema.nullable().optional().default(null),
  title: z.string().trim().min(1).max(200),
  rawThought: z.string().trim().min(12).max(4000),
  status: z.string().trim().min(1).max(64).optional().default("draft"),
  metadata: JsonObjectSchema,
});

const createClaimSchema = z.object({
  userId: UuidSchema,
  mapId: UuidSchema,
  parentClaimId: UuidSchema.nullable().optional().default(null),
  text: z.string().trim().min(1).max(4000),
  note: z.string().trim().max(4000).nullable().optional().default(null),
  kind: z.string().trim().min(1).max(64).optional().default("claim"),
  structureKind: z.string().trim().min(1).max(64).nullable().optional().default(null),
  provenance: z.string().trim().min(1).max(64).optional().default("user"),
  status: z.string().trim().min(1).max(64).optional().default("open"),
  confidence: z.number().int().min(0).max(100).optional().default(50),
  metadata: JsonObjectSchema,
});

const updateClaimSchema = z.object({
  userId: UuidSchema,
  claimId: UuidSchema,
  text: z.string().trim().min(1).max(4000).optional(),
  note: z.string().trim().max(4000).nullable().optional(),
  kind: z.string().trim().min(1).max(64).optional(),
  structureKind: z.string().trim().min(1).max(64).nullable().optional(),
  provenance: z.string().trim().min(1).max(64).optional(),
  status: z.string().trim().min(1).max(64).optional(),
  confidence: z.number().int().min(0).max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const setWorkspaceSelectionSchema = z.object({
  userId: UuidSchema,
  workspaceContextId: UuidSchema.nullable().optional().default(null),
  mapId: UuidSchema,
  sphereId: UuidSchema.nullable().optional().default(null),
  selectedClaimId: UuidSchema.nullable().optional().default(null),
  selectedConceptId: UuidSchema.nullable().optional().default(null),
  mode: WorkspaceModeSchema.optional().default("brain"),
  breadcrumb: StringArraySchema,
  contextSnapshot: JsonObjectSchema,
  contextKey: z.string().trim().min(1).max(160).nullable().optional().default(null),
});

const startChallengeRoundSchema = z.object({
  userId: UuidSchema,
  mapId: UuidSchema,
  claimId: UuidSchema,
  workspaceContextId: UuidSchema.nullable().optional().default(null),
  critiqueGenerated: z.string().trim().min(1).max(12000).optional(),
  critiqueFailureTypes: StringArraySchema.optional().default([]),
  critiqueLens: z.string().trim().min(1).max(128).optional().default("pending"),
  critiqueStrength: z.string().trim().min(1).max(64).optional().default("moderate"),
  critiqueMode: z.string().trim().min(1).max(64).nullable().optional().default(null),
  voiceLabel: z.string().trim().min(1).max(120).nullable().optional().default(null),
  confidenceAtRoundStart: z.number().int().min(0).max(100).nullable().optional().default(null),
  uncertainty: JsonObjectSchema.optional().default({}),
});

const requestChallengeCritiqueSchema = z.object({
  userId: UuidSchema,
  roundId: UuidSchema,
  steelmanText: z.string().trim().min(1).max(6000).nullable().optional().default(null),
  critiqueMode: z.enum(["direct", "socratic", "red_team"]).nullable().optional().default(null),
  requestId: z.string().trim().min(1).max(160).nullable().optional().default(null),
});

const recordChallengeResponseSchema = z.object({
  userId: UuidSchema,
  roundId: UuidSchema,
  userResponse: z.string().trim().min(10).max(3000),
  responsePath: ResponsePathSchema.optional().default("defend"),
  confidenceAtRoundEnd: z.number().int().min(0).max(100),
  concessions: StringArraySchema,
  defenses: StringArraySchema,
  dismissals: StringArraySchema,
  engagementScore: z.number().int().min(0).max(100).nullable().optional().default(null),
  followUpPrompt: z.string().trim().min(1).max(4000).nullable().optional().default(null),
  uncertainty: JsonObjectSchema,
});

const generateLearningPromptSchema = z.object({
  userId: UuidSchema,
  mapId: UuidSchema,
  claimId: UuidSchema.nullable().optional().default(null),
  conceptId: UuidSchema.nullable().optional().default(null),
  roundId: UuidSchema.nullable().optional().default(null),
  workspaceContextId: UuidSchema.nullable().optional().default(null),
  promptType: z.string().trim().min(1).max(64),
  triggerCondition: z.string().trim().min(1).max(128),
  promptText: z.string().trim().min(1).max(8000),
  promptVersion: z.string().trim().min(1).max(64).optional().default("v1"),
  providerModel: z.string().trim().min(1).max(128).nullable().optional().default(null),
  promptPayload: JsonObjectSchema,
});

const submitTeachbackSchema = z.object({
  userId: UuidSchema,
  learningPromptId: UuidSchema,
  submission: z.string().trim().min(10).max(8000),
  evaluation: JsonObjectSchema,
});

const linkConceptToClaimSchema = z.object({
  userId: UuidSchema,
  claimId: UuidSchema,
  conceptId: UuidSchema,
  relationType: z.string().trim().min(1).max(64).optional().default("references"),
  confidence: z.number().int().min(0).max(100).optional().default(50),
  metadata: JsonObjectSchema,
});

type MoveEventType = typeof movesEvents.$inferInsert.type;
type MoveEventRecord = typeof movesEvents.$inferSelect;
type MapRecord = typeof maps.$inferSelect;
type ClaimRecord = typeof claims.$inferSelect;
type WorkspaceContextRecord = typeof workspaceContexts.$inferSelect;
type DialecticRoundRecord = typeof dialecticRounds.$inferSelect;
type ChallengeCritiqueRecord = typeof challengeCritiques.$inferSelect;
type LearningPromptRecord = typeof learningPrompts.$inferSelect;
type ClaimConceptEdgeRecord = typeof claimConceptEdges.$inferSelect;

type CommandResult<TRecord> = {
  invalidation: WorkspaceProjectionInvalidationResult;
  events: MoveEventRecord[];
  record: TRecord;
};

function buildContextKey(input: z.infer<typeof setWorkspaceSelectionSchema>) {
  if (input.contextKey) {
    return input.contextKey;
  }

  return `workspace:${input.userId}:${input.mapId}:${input.mode}`;
}

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

function buildInvalidationInput(
  userId: string,
  data: {
    mapId?: string | null;
    claimId?: string | null;
    conceptId?: string | null;
    workspaceContextId?: string | null;
  },
): WorkspaceProjectionInvalidationInput {
  return {
    userId,
    mapId: data.mapId ?? null,
    claimId: data.claimId ?? null,
    conceptId: data.conceptId ?? null,
    workspaceContextId: data.workspaceContextId ?? null,
  };
}

async function appendEvent(
  tx: Parameters<Parameters<ReturnType<typeof getDrizzleDb>["transaction"]>[0]>[0],
  data: {
    userId: string;
    mapId: string;
    claimId?: string | null;
    conceptId?: string | null;
    type: MoveEventType;
    payload?: Record<string, unknown>;
    requestId?: string | null;
  },
): Promise<MoveEventRecord> {
  const [event] = await tx
    .insert(movesEvents)
    .values({
      userId: data.userId,
      mapId: data.mapId,
      claimId: data.claimId ?? null,
      conceptId: data.conceptId ?? null,
      requestId: data.requestId ?? null,
      type: data.type,
      payload: data.payload ?? {},
    })
    .returning();

  return event;
}

async function getOwnedMap(tx: Parameters<Parameters<ReturnType<typeof getDrizzleDb>["transaction"]>[0]>[0], mapId: string, userId: string) {
  return assertFound(
    await selectOne(tx.select().from(maps).where(and(eq(maps.id, mapId), eq(maps.userId, userId))).limit(1)),
    "Map not found.",
  );
}

async function getOwnedClaim(tx: Parameters<Parameters<ReturnType<typeof getDrizzleDb>["transaction"]>[0]>[0], claimId: string, userId: string) {
  return assertFound(
    await selectOne(tx.select().from(claims).where(and(eq(claims.id, claimId), eq(claims.userId, userId))).limit(1)),
    "Claim not found.",
  );
}

async function getOwnedWorkspaceContext(
  tx: Parameters<Parameters<ReturnType<typeof getDrizzleDb>["transaction"]>[0]>[0],
  workspaceContextId: string,
  userId: string,
) {
  return assertFound(
    await selectOne(
      tx.select().from(workspaceContexts).where(and(eq(workspaceContexts.id, workspaceContextId), eq(workspaceContexts.userId, userId))).limit(1),
    ),
    "Workspace context not found.",
  );
}

async function getOwnedRound(tx: Parameters<Parameters<ReturnType<typeof getDrizzleDb>["transaction"]>[0]>[0], roundId: string, userId: string) {
  return assertFound(
    await selectOne(
      tx.select().from(dialecticRounds).where(and(eq(dialecticRounds.id, roundId), eq(dialecticRounds.userId, userId))).limit(1),
    ),
    "Challenge round not found.",
  );
}

async function getOwnedLearningPrompt(
  tx: Parameters<Parameters<ReturnType<typeof getDrizzleDb>["transaction"]>[0]>[0],
  learningPromptId: string,
  userId: string,
) {
  return assertFound(
    await selectOne(
      tx.select().from(learningPrompts).where(and(eq(learningPrompts.id, learningPromptId), eq(learningPrompts.userId, userId))).limit(1),
    ),
    "Learning prompt not found.",
  );
}

async function getOwnedConcept(
  tx: Parameters<Parameters<ReturnType<typeof getDrizzleDb>["transaction"]>[0]>[0],
  conceptId: string,
  userId: string,
) {
  return assertFound(
    await selectOne(tx.select().from(concepts).where(and(eq(concepts.id, conceptId), eq(concepts.userId, userId))).limit(1)),
    "Concept not found.",
  );
}

async function resolveLearningPromptMapId(
  tx: Parameters<Parameters<ReturnType<typeof getDrizzleDb>["transaction"]>[0]>[0],
  prompt: LearningPromptRecord,
  userId: string,
) {
  if (prompt.claimId) {
    return (await getOwnedClaim(tx, prompt.claimId, userId)).mapId;
  }

  if (prompt.roundId) {
    return (await getOwnedRound(tx, prompt.roundId, userId)).mapId;
  }

  if (prompt.workspaceContextId) {
    return assertFound(
      (await getOwnedWorkspaceContext(tx, prompt.workspaceContextId, userId)).mapId,
      "Teachback map not found.",
    );
  }

  throw new Error("Teachback map not found.");
}

export async function createMap(input: z.input<typeof createMapSchema>): Promise<CommandResult<MapRecord>> {
  const parsed = createMapSchema.parse(input);
  const db = getDrizzleDb();

  const { events, map } = await db.transaction(async (tx) => {
    const [map] = await tx
      .insert(maps)
      .values({
        userId: parsed.userId,
        sphereId: parsed.sphereId,
        title: parsed.title,
        rawThought: parsed.rawThought,
        status: parsed.status,
        metadata: parsed.metadata,
      })
      .returning();

    const event = await appendEvent(tx, {
      userId: parsed.userId,
      mapId: map.id,
      type: "map.created",
      payload: {
        sphereId: map.sphereId,
        title: map.title,
        status: map.status,
      },
    });

    return { events: [event], map };
  });

  const invalidation = invalidateWorkspaceProjections(buildInvalidationInput(parsed.userId, { mapId: map.id }));
  return { invalidation, events, record: map };
}

export async function createClaim(input: z.input<typeof createClaimSchema>): Promise<CommandResult<ClaimRecord>> {
  const parsed = createClaimSchema.parse(input);
  const db = getDrizzleDb();

  const { claim, events } = await db.transaction(async (tx) => {
    const map = await getOwnedMap(tx, parsed.mapId, parsed.userId);

    const [claim] = await tx
      .insert(claims)
      .values({
        userId: parsed.userId,
        mapId: map.id,
        parentClaimId: parsed.parentClaimId,
        text: parsed.text,
        note: parsed.note,
        kind: parsed.kind,
        structureKind: parsed.structureKind,
        provenance: parsed.provenance,
        status: parsed.status,
        confidence: parsed.confidence,
        metadata: parsed.metadata,
      })
      .returning();

    await tx
      .update(maps)
      .set({
        claimCount: sql`${maps.claimCount} + 1`,
      })
      .where(eq(maps.id, map.id));

    const event = await appendEvent(tx, {
      userId: parsed.userId,
      mapId: map.id,
      claimId: claim.id,
      type: "claim.created",
      payload: {
        kind: claim.kind,
        structureKind: claim.structureKind,
        status: claim.status,
        confidence: claim.confidence,
      },
    });

    return { claim, events: [event] };
  });

  const invalidation = invalidateWorkspaceProjections(
    buildInvalidationInput(parsed.userId, { mapId: claim.mapId, claimId: claim.id, conceptId: null }),
  );

  return { invalidation, events, record: claim };
}

export async function updateClaim(input: z.input<typeof updateClaimSchema>): Promise<CommandResult<ClaimRecord>> {
  const parsed = updateClaimSchema.parse(input);
  const db = getDrizzleDb();

  const { claim, events } = await db.transaction(async (tx) => {
    const existing = await getOwnedClaim(tx, parsed.claimId, parsed.userId);
    const nextMetadata = parsed.metadata ? { ...(existing.metadata ?? {}), ...parsed.metadata } : existing.metadata;

    const [claim] = await tx
      .update(claims)
      .set({
        text: parsed.text ?? existing.text,
        note: parsed.note !== undefined ? parsed.note : existing.note,
        kind: parsed.kind ?? existing.kind,
        structureKind: parsed.structureKind !== undefined ? parsed.structureKind : existing.structureKind,
        provenance: parsed.provenance ?? existing.provenance,
        status: parsed.status ?? existing.status,
        confidence: parsed.confidence ?? existing.confidence,
        metadata: nextMetadata,
      })
      .where(eq(claims.id, existing.id))
      .returning();

    const events: MoveEventRecord[] = [];
    events.push(
      await appendEvent(tx, {
        userId: parsed.userId,
        mapId: claim.mapId,
        claimId: claim.id,
        type: "claim.updated",
        payload: {
          changedFields: Object.keys(parsed).filter((key) => key !== "userId" && key !== "claimId"),
        },
      }),
    );

    if (parsed.confidence !== undefined && parsed.confidence !== existing.confidence) {
      events.push(
        await appendEvent(tx, {
          userId: parsed.userId,
          mapId: claim.mapId,
          claimId: claim.id,
          type: "claim.confidence_changed",
          payload: {
            previousConfidence: existing.confidence,
            nextConfidence: parsed.confidence,
          },
        }),
      );
    }

    return { claim, events };
  });

  const invalidation = invalidateWorkspaceProjections(buildInvalidationInput(parsed.userId, { mapId: claim.mapId, claimId: claim.id }));
  return { invalidation, events, record: claim };
}

export async function setWorkspaceSelection(
  input: z.input<typeof setWorkspaceSelectionSchema>,
): Promise<CommandResult<WorkspaceContextRecord>> {
  const parsed = setWorkspaceSelectionSchema.parse(input);
  const db = getDrizzleDb();

  const { context, events } = await db.transaction(async (tx) => {
    await getOwnedMap(tx, parsed.mapId, parsed.userId);

    if (parsed.selectedClaimId) {
      await getOwnedClaim(tx, parsed.selectedClaimId, parsed.userId);
    }

    if (parsed.selectedConceptId) {
      await getOwnedConcept(tx, parsed.selectedConceptId, parsed.userId);
    }

    const contextKey = buildContextKey(parsed);
    const existing =
      parsed.workspaceContextId != null
        ? await getOwnedWorkspaceContext(tx, parsed.workspaceContextId, parsed.userId)
        : await selectOne(
            tx
              .select()
              .from(workspaceContexts)
              .where(eq(workspaceContexts.userId, parsed.userId))
              .limit(1),
          );

    const [context] = existing
      ? await tx
          .update(workspaceContexts)
          .set({
            sphereId: parsed.sphereId,
            mapId: parsed.mapId,
            selectedClaimId: parsed.selectedClaimId,
            selectedConceptId: parsed.selectedConceptId,
            mode: parsed.mode,
            breadcrumb: parsed.breadcrumb,
            contextSnapshot: parsed.contextSnapshot,
            contextKey,
            lastAccessedAt: new Date(),
          })
          .where(eq(workspaceContexts.id, existing.id))
          .returning()
      : await tx
          .insert(workspaceContexts)
          .values({
            userId: parsed.userId,
            sphereId: parsed.sphereId,
            mapId: parsed.mapId,
            selectedClaimId: parsed.selectedClaimId,
            selectedConceptId: parsed.selectedConceptId,
            mode: parsed.mode,
            breadcrumb: parsed.breadcrumb,
            contextSnapshot: parsed.contextSnapshot,
            lastAccessedAt: new Date(),
            contextKey,
          })
          .returning();

    const event = await appendEvent(tx, {
      userId: parsed.userId,
      mapId: parsed.mapId,
      claimId: parsed.selectedClaimId,
      conceptId: parsed.selectedConceptId,
      type: "workspace.selection_changed",
      payload: {
        workspaceContextId: context.id,
        mode: parsed.mode,
        breadcrumb: parsed.breadcrumb,
      },
    });

    return { context, events: [event] };
  });

  const invalidation = invalidateWorkspaceProjections(
    buildInvalidationInput(parsed.userId, {
      mapId: context.mapId,
      claimId: context.selectedClaimId,
      conceptId: context.selectedConceptId,
      workspaceContextId: context.id,
    }),
  );

  return { invalidation, events, record: context };
}

export async function startChallengeRound(
  input: z.input<typeof startChallengeRoundSchema>,
): Promise<CommandResult<DialecticRoundRecord>> {
  const parsed = startChallengeRoundSchema.parse(input);
  const db = getDrizzleDb();

  const { round, events } = await db.transaction(async (tx) => {
    const map = await getOwnedMap(tx, parsed.mapId, parsed.userId);
    const claim = await getOwnedClaim(tx, parsed.claimId, parsed.userId);

    if (claim.mapId !== map.id) {
      throw new Error("Claim does not belong to the selected map.");
    }

    if (parsed.workspaceContextId) {
      await getOwnedWorkspaceContext(tx, parsed.workspaceContextId, parsed.userId);
    }

    const priorRound = await selectOne(
      tx
        .select()
        .from(dialecticRounds)
        .where(and(eq(dialecticRounds.claimId, claim.id), eq(dialecticRounds.userId, parsed.userId)))
        .orderBy(desc(dialecticRounds.roundNumber))
        .limit(1),
    );

    const [round] = await tx
      .insert(dialecticRounds)
      .values({
        userId: parsed.userId,
        mapId: map.id,
        claimId: claim.id,
        workspaceContextId: parsed.workspaceContextId,
        priorRoundId: priorRound?.id ?? null,
        roundNumber: (priorRound?.roundNumber ?? 0) + 1,
        critiqueGenerated: parsed.critiqueGenerated ?? "Critique requested.",
        critiqueFailureTypes: parsed.critiqueFailureTypes,
        critiqueLens: parsed.critiqueLens,
        critiqueStrength: parsed.critiqueStrength,
        critiqueMode: parsed.critiqueMode,
        voiceLabel: parsed.voiceLabel,
        confidenceAtRoundStart: parsed.confidenceAtRoundStart ?? claim.confidence,
        uncertainty: parsed.uncertainty,
      })
      .returning();

    await tx
      .update(claims)
      .set({
        lastChallengedAt: new Date(),
      })
      .where(eq(claims.id, claim.id));

    const event = await appendEvent(tx, {
      userId: parsed.userId,
      mapId: map.id,
      claimId: claim.id,
      type: "challenge.started",
      payload: {
        roundId: round.id,
        roundNumber: round.roundNumber,
        critiqueStrength: round.critiqueStrength,
        critiqueMode: round.critiqueMode,
      },
    });

    return { round, events: [event] };
  });

  const invalidation = invalidateWorkspaceProjections(
    buildInvalidationInput(parsed.userId, {
      mapId: round.mapId,
      claimId: round.claimId,
      workspaceContextId: round.workspaceContextId,
    }),
  );

  return { invalidation, events, record: round };
}

export async function requestChallengeCritique(
  input: z.input<typeof requestChallengeCritiqueSchema>,
): Promise<CommandResult<ChallengeCritiqueRecord>> {
  const parsed = requestChallengeCritiqueSchema.parse(input);
  const db = getDrizzleDb();
  const requestId = parsed.requestId ?? crypto.randomUUID();

  const { critique, events, round } = await db.transaction(async (tx) => {
    const existingRound = await getOwnedRound(tx, parsed.roundId, parsed.userId);
    const claim = await getOwnedClaim(tx, existingRound.claimId, parsed.userId);
    const priorRounds = await tx
      .select()
      .from(dialecticRounds)
      .where(and(eq(dialecticRounds.claimId, claim.id), eq(dialecticRounds.userId, parsed.userId)))
      .orderBy(desc(dialecticRounds.roundNumber))
      .limit(6);

    const priorRoundSummaries = priorRounds
      .filter((round) => round.id !== existingRound.id)
      .map((round) => {
        const snippetSource = round.userResponse?.trim().length ? round.userResponse : round.critiqueGenerated;
        const snippet =
          snippetSource.trim().length > 120 ? `${snippetSource.trim().slice(0, 119).trimEnd()}...` : snippetSource.trim();

        return `Round ${round.roundNumber}: ${snippet}`;
      });

    const result = await generateChallengeCritique(
      {
        claimText: claim.text,
        steelmanText: parsed.steelmanText,
        confidence: existingRound.confidenceAtRoundStart,
        priorRounds: priorRoundSummaries,
        critiqueMode: parsed.critiqueMode ?? (existingRound.critiqueMode as "direct" | "socratic" | "red_team" | null) ?? "direct",
      },
      {
        userId: parsed.userId,
        mapId: existingRound.mapId,
        claimId: existingRound.claimId,
        workspaceContextId: existingRound.workspaceContextId,
      },
    );

    const [round] = await tx
      .update(dialecticRounds)
      .set({
        critiqueGenerated: result.output.critique,
        critiqueFailureTypes: result.output.failureTypes,
        critiqueLens: result.output.critiqueLens,
        critiqueMode: parsed.critiqueMode ?? existingRound.critiqueMode,
        uncertainty: {
          ...(existingRound.uncertainty ?? {}),
          dependencyRisks: result.output.dependencyRisks,
          headline: result.output.headline,
          whyNow: result.output.whyNow,
        },
      })
      .where(eq(dialecticRounds.id, existingRound.id))
      .returning();

    const existingCritique = await selectOne(
      tx.select().from(challengeCritiques).where(eq(challengeCritiques.roundId, existingRound.id)).limit(1),
    );

    const [critique] = existingCritique
      ? await tx
          .update(challengeCritiques)
          .set({
            provider: result.meta.provider,
            model: result.meta.model,
            promptVersion: result.meta.promptVersion,
            headline: result.output.headline,
            critiqueText: result.output.critique,
            critiqueLens: result.output.critiqueLens,
            failureTypes: result.output.failureTypes,
            dependencyRisks: result.output.dependencyRisks,
            whyNow: result.output.whyNow,
            validatedOutput: result.output,
          })
          .where(eq(challengeCritiques.id, existingCritique.id))
          .returning()
      : await tx
          .insert(challengeCritiques)
          .values({
            userId: parsed.userId,
            mapId: existingRound.mapId,
            claimId: existingRound.claimId,
            roundId: existingRound.id,
            workspaceContextId: existingRound.workspaceContextId,
            provider: result.meta.provider,
            model: result.meta.model,
            promptVersion: result.meta.promptVersion,
            headline: result.output.headline,
            critiqueText: result.output.critique,
            critiqueLens: result.output.critiqueLens,
            failureTypes: result.output.failureTypes,
            dependencyRisks: result.output.dependencyRisks,
            whyNow: result.output.whyNow,
            validatedOutput: result.output,
          })
          .returning();

    const event = await appendEvent(tx, {
      userId: parsed.userId,
      mapId: existingRound.mapId,
      claimId: existingRound.claimId,
      type: "challenge.critique_generated",
      requestId,
      payload: {
        roundId: existingRound.id,
        critiqueId: critique.id,
        provider: critique.provider,
        model: critique.model,
        promptVersion: critique.promptVersion,
      },
    });

    return { critique, events: [event], round };
  });

  const invalidation = invalidateWorkspaceProjections(
    buildInvalidationInput(parsed.userId, {
      mapId: round.mapId,
      claimId: round.claimId,
      workspaceContextId: round.workspaceContextId,
    }),
  );

  return { invalidation, events, record: critique };
}

export async function recordChallengeResponse(
  input: z.input<typeof recordChallengeResponseSchema>,
): Promise<CommandResult<DialecticRoundRecord>> {
  const parsed = recordChallengeResponseSchema.parse(input);
  const db = getDrizzleDb();

  const { round, events, conceptId } = await db.transaction(async (tx) => {
    const existing = await getOwnedRound(tx, parsed.roundId, parsed.userId);
    const [round] = await tx
      .update(dialecticRounds)
      .set({
        userResponse: parsed.userResponse,
        responsePath: parsed.responsePath,
        confidenceAtRoundEnd: parsed.confidenceAtRoundEnd,
        confidenceDelta: parsed.confidenceAtRoundEnd - existing.confidenceAtRoundStart,
        concessions: parsed.concessions,
        defenses: parsed.defenses,
        dismissals: parsed.dismissals,
        engagementScore: parsed.engagementScore,
        followUpPrompt: parsed.followUpPrompt,
        uncertainty: parsed.uncertainty,
        closedAt: new Date(),
      })
      .where(eq(dialecticRounds.id, existing.id))
      .returning();

    const claim = await getOwnedClaim(tx, round.claimId, parsed.userId);
    const events: MoveEventRecord[] = [];

    if (parsed.confidenceAtRoundEnd !== claim.confidence) {
      await tx
        .update(claims)
        .set({
          confidence: parsed.confidenceAtRoundEnd,
          lastChallengedAt: new Date(),
        })
        .where(eq(claims.id, claim.id));

      events.push(
        await appendEvent(tx, {
          userId: parsed.userId,
          mapId: round.mapId,
          claimId: claim.id,
          type: "claim.confidence_changed",
          payload: {
            previousConfidence: claim.confidence,
            nextConfidence: parsed.confidenceAtRoundEnd,
            source: "challenge.round_responded",
            roundId: round.id,
          },
        }),
      );
    }

    events.push(
      await appendEvent(tx, {
        userId: parsed.userId,
        mapId: round.mapId,
        claimId: round.claimId,
        type: "challenge.round_responded",
        payload: {
          roundId: round.id,
          responsePath: parsed.responsePath,
          confidenceAtRoundEnd: parsed.confidenceAtRoundEnd,
          confidenceDelta: parsed.confidenceAtRoundEnd - existing.confidenceAtRoundStart,
        },
      }),
    );

    return { round, events, conceptId: null as string | null };
  });

  const invalidation = invalidateWorkspaceProjections(
    buildInvalidationInput(parsed.userId, {
      mapId: round.mapId,
      claimId: round.claimId,
      conceptId,
      workspaceContextId: round.workspaceContextId,
    }),
  );

  return { invalidation, events, record: round };
}

export const updateWorkspaceSelection = setWorkspaceSelection;
export const startChallenge = startChallengeRound;
export const respondToChallengeRound = recordChallengeResponse;

export async function generateLearningPrompt(
  input: z.input<typeof generateLearningPromptSchema>,
): Promise<CommandResult<LearningPromptRecord>> {
  const parsed = generateLearningPromptSchema.parse(input);
  const db = getDrizzleDb();

  const { prompt, events } = await db.transaction(async (tx) => {
    await getOwnedMap(tx, parsed.mapId, parsed.userId);

    if (parsed.claimId) {
      await getOwnedClaim(tx, parsed.claimId, parsed.userId);
    }

    if (parsed.conceptId) {
      await getOwnedConcept(tx, parsed.conceptId, parsed.userId);
    }

    if (parsed.roundId) {
      await getOwnedRound(tx, parsed.roundId, parsed.userId);
    }

    if (parsed.workspaceContextId) {
      await getOwnedWorkspaceContext(tx, parsed.workspaceContextId, parsed.userId);
    }

    const [prompt] = await tx
      .insert(learningPrompts)
      .values({
        userId: parsed.userId,
        claimId: parsed.claimId,
        conceptId: parsed.conceptId,
        roundId: parsed.roundId,
        workspaceContextId: parsed.workspaceContextId,
        promptType: parsed.promptType,
        triggerCondition: parsed.triggerCondition,
        promptText: parsed.promptText,
        promptVersion: parsed.promptVersion,
        providerModel: parsed.providerModel,
        promptPayload: parsed.promptPayload,
      })
      .returning();

    const event = await appendEvent(tx, {
      userId: parsed.userId,
      mapId: parsed.mapId,
      claimId: parsed.claimId,
      conceptId: parsed.conceptId,
      type: "learning.prompt_generated",
      payload: {
        learningPromptId: prompt.id,
        promptType: prompt.promptType,
        triggerCondition: prompt.triggerCondition,
        promptVersion: prompt.promptVersion,
        providerModel: prompt.providerModel,
      },
    });

    return { prompt, events: [event] };
  });

  const invalidation = invalidateWorkspaceProjections(
    buildInvalidationInput(parsed.userId, {
      mapId: parsed.mapId,
      claimId: parsed.claimId,
      conceptId: parsed.conceptId,
      workspaceContextId: parsed.workspaceContextId,
    }),
  );

  return { invalidation, events, record: prompt };
}

export async function submitTeachback(
  input: z.input<typeof submitTeachbackSchema>,
): Promise<CommandResult<LearningPromptRecord>> {
  const parsed = submitTeachbackSchema.parse(input);
  const db = getDrizzleDb();

  const { prompt, events, mapId, claimId, conceptId, workspaceContextId } = await db.transaction(async (tx) => {
    const existing = await getOwnedLearningPrompt(tx, parsed.learningPromptId, parsed.userId);
    const nextPayload = {
      ...(existing.promptPayload ?? {}),
      latestTeachback: {
        submittedAt: new Date().toISOString(),
        submission: parsed.submission,
        evaluation: parsed.evaluation,
      },
    };

    const [prompt] = await tx
      .update(learningPrompts)
      .set({
        userEngaged: true,
        engagedAt: new Date(),
        status: "answered",
        promptPayload: nextPayload,
      })
      .where(eq(learningPrompts.id, existing.id))
      .returning();

    const mapId = await resolveLearningPromptMapId(tx, existing, parsed.userId);
    const event = await appendEvent(tx, {
      userId: parsed.userId,
      mapId,
      claimId: existing.claimId,
      conceptId: existing.conceptId,
      type: "teachback.submitted",
      payload: {
        learningPromptId: existing.id,
        submission: parsed.submission,
        evaluation: parsed.evaluation,
      },
    });

    return {
      prompt,
      events: [event],
      mapId,
      claimId: existing.claimId,
      conceptId: existing.conceptId,
      workspaceContextId: existing.workspaceContextId,
    };
  });

  const invalidation = invalidateWorkspaceProjections(
    buildInvalidationInput(parsed.userId, {
      mapId,
      claimId,
      conceptId,
      workspaceContextId,
    }),
  );

  return { invalidation, events, record: prompt };
}

export async function linkConceptToClaim(
  input: z.input<typeof linkConceptToClaimSchema>,
): Promise<CommandResult<ClaimConceptEdgeRecord>> {
  const parsed = linkConceptToClaimSchema.parse(input);
  const db = getDrizzleDb();

  const { edge, events, mapId } = await db.transaction(async (tx) => {
    const claim = await getOwnedClaim(tx, parsed.claimId, parsed.userId);
    await getOwnedConcept(tx, parsed.conceptId, parsed.userId);

    const existing = await selectOne(
      tx
        .select()
        .from(claimConceptEdges)
        .where(
          and(
            eq(claimConceptEdges.claimId, parsed.claimId),
            eq(claimConceptEdges.conceptId, parsed.conceptId),
            eq(claimConceptEdges.relationType, parsed.relationType),
          ),
        )
        .limit(1),
    );

    const [edge] = existing
      ? await tx
          .update(claimConceptEdges)
          .set({
            confidence: parsed.confidence,
            metadata: parsed.metadata,
          })
          .where(eq(claimConceptEdges.id, existing.id))
          .returning()
      : await tx
          .insert(claimConceptEdges)
          .values({
            claimId: parsed.claimId,
            conceptId: parsed.conceptId,
            relationType: parsed.relationType,
            confidence: parsed.confidence,
            metadata: parsed.metadata,
          })
          .returning();

    const event = await appendEvent(tx, {
      userId: parsed.userId,
      mapId: claim.mapId,
      claimId: parsed.claimId,
      conceptId: parsed.conceptId,
      type: "concept.linked",
      payload: {
        relationType: edge.relationType,
        confidence: edge.confidence,
      },
    });

    return { edge, events: [event], mapId: claim.mapId };
  });

  const invalidation = invalidateWorkspaceProjections(
    buildInvalidationInput(parsed.userId, {
      mapId,
      claimId: parsed.claimId,
      conceptId: parsed.conceptId,
    }),
  );

  return { invalidation, events, record: edge };
}

export const workspaceCommandSchemas = {
  createMap: createMapSchema,
  createClaim: createClaimSchema,
  updateClaim: updateClaimSchema,
  setWorkspaceSelection: setWorkspaceSelectionSchema,
  startChallengeRound: startChallengeRoundSchema,
  requestChallengeCritique: requestChallengeCritiqueSchema,
  recordChallengeResponse: recordChallengeResponseSchema,
  updateWorkspaceSelection: setWorkspaceSelectionSchema,
  startChallenge: startChallengeRoundSchema,
  respondToChallengeRound: recordChallengeResponseSchema,
  generateLearningPrompt: generateLearningPromptSchema,
  submitTeachback: submitTeachbackSchema,
  linkConceptToClaim: linkConceptToClaimSchema,
};
