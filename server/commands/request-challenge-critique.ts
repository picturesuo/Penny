import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { generateChallengeCritique as generateChallengeCritiqueOperation } from "../ai/operations/generateChallengeCritique.ts";
import { generateChallengeCritique as generateChallengeCritiqueStub } from "../ai/generate-challenge-critique.ts";
import { getDb } from "../db/client.ts";
import { challengeCritiques, challengeRounds, claims, maps, movesEvents } from "../db/schema.ts";
import { findExistingMoveEvent } from "../idempotency/find-existing-move-event.ts";

export type RequestChallengeCritiqueEventType =
  | "challenge.critique.requested"
  | "challenge.critique.generated"
  | "challenge.critique.failed";

export type ChallengeCritiqueStatus = "pending" | "ready" | "failed";

export type RequestChallengeCritiqueInput = {
  userId: string;
  roundId: string;
  requestId?: string | null;
};

export type ChallengeCritiqueRecord = {
  id: string;
  roundId: string;
  mapId: string;
  claimId: string;
  userId: string;
  status: ChallengeCritiqueStatus;
  body: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ChallengeCritiqueStoredRecord = {
  id: string;
  userId: string;
  status: Exclude<ChallengeCritiqueStatus, "pending">;
  body: string | null;
  updatedAt: Date;
};

export type ChallengeCritiqueEventRecord = {
  userId: string;
  aggregateType: "challenge_critique";
  aggregateId: string;
  requestId: string;
  type: RequestChallengeCritiqueEventType;
  payload: {
    roundId: string;
    mapId: string;
    claimId: string;
    status: ChallengeCritiqueStatus;
    body?: string | null;
    provider?: string | null;
    model?: string | null;
    promptVersion?: string | null;
    error?: string | null;
  };
  createdAt: Date;
};

export type ChallengeCritiqueRequestedEventRecord = ChallengeCritiqueEventRecord;

export type RequestChallengeCritiqueRepositoryTx = {
  findMoveEventByRequestId?(input: {
    userId: string;
    requestId: string;
    type: string;
  }): Promise<{ aggregateId: string; payload: Record<string, unknown> | null } | null>;
  findOwnedCritique?(input: {
    critiqueId: string;
    userId: string;
  }): Promise<{ id: string; status: string; body: string | null } | null>;
  findOwnedRound(input: {
    roundId: string;
    userId: string;
  }): Promise<{ id: string; mapId: string; claimId: string; userId: string } | null>;
  findCritiqueGenerationContext?(input: {
    claimId: string;
    mapId: string;
    roundId: string;
    userId: string;
  }): Promise<{
    claimText: string | null;
    claimConfidenceBps: number | null;
    mapTitle: string | null;
  } | null>;
  insertChallengeCritique(record: ChallengeCritiqueRecord): Promise<void>;
  updateChallengeCritique?(record: ChallengeCritiqueStoredRecord): Promise<void>;
  insertMoveEvent(event: ChallengeCritiqueEventRecord): Promise<void>;
};

export type RequestChallengeCritiqueRepository = {
  transaction<T>(callback: (tx: RequestChallengeCritiqueRepositoryTx) => Promise<T>): Promise<T>;
};

type RequestChallengeCritiqueDbRoundRow = {
  id: string;
  mapId: string;
  claimId: string;
  userId: string;
};

type RequestChallengeCritiqueDbCritiqueRow = {
  id: string;
  status: string;
  body: string | null;
};

type RequestChallengeCritiqueDbGenerationContextRow = {
  claimText: string;
  claimConfidenceBps: number;
};

type RequestChallengeCritiqueDbMapRow = {
  mapTitle: string;
};

type RequestChallengeCritiqueDbTx = {
  select: (...args: unknown[]) => {
    from: (table: unknown) => {
      where: (condition: unknown) => {
        limit: (count: number) => Promise<unknown[]>;
      };
    };
  };
  insert: (table: unknown) => {
    values: (value: Record<string, unknown>) => Promise<unknown>;
  };
  update: (table: unknown) => {
    set: (value: Record<string, unknown>) => {
      where: (condition: unknown) => Promise<unknown>;
    };
  };
};

type RequestChallengeCritiqueDb = {
  transaction<T>(callback: (tx: RequestChallengeCritiqueDbTx) => Promise<T>): Promise<T>;
};

type LoadedChallengeCritiqueContext = {
  roundId: string;
  mapId: string;
  claimId: string;
  userId: string;
  claimText: string | null;
  claimConfidenceBps: number | null;
  mapTitle: string | null;
};

type GeneratedChallengeCritiqueArtifact = {
  body: string;
  metadata: {
    model: string | null;
    promptVersion: string | null;
    provider: string | null;
  };
};

export type RequestChallengeCritiqueResult = {
  critiqueId: string;
  status: ChallengeCritiqueStatus;
};

export type RequestChallengeCritiqueDependencies = {
  createId?: () => string;
  generateCritique?: (input: LoadedChallengeCritiqueContext) => Promise<GeneratedChallengeCritiqueArtifact>;
  now?: () => Date;
};

export class RequestChallengeCritiqueValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestChallengeCritiqueValidationError";
  }
}

export class RequestChallengeCritiqueRoundNotFoundError extends Error {
  constructor(roundId: string) {
    super(`Challenge round not found for requestChallengeCritique: ${roundId}`);
    this.name = "RequestChallengeCritiqueRoundNotFoundError";
  }
}

type NormalizedRequestChallengeCritiqueInput = {
  userId: string;
  roundId: string;
  requestId: string | null;
};

const PENDING_STATUS = "pending" as const;
const READY_STATUS = "ready" as const;
const FAILED_STATUS = "failed" as const;
const FALLBACK_PROMPT_VERSION = "generateChallengeCritique.stub.v1";
const FALLBACK_MODEL = "heuristic-stub";
const FALLBACK_PROVIDER = "local";

function readPayloadStatus(payload: Record<string, unknown> | null): ChallengeCritiqueStatus {
  const status = payload?.status;

  if (status === READY_STATUS || status === FAILED_STATUS || status === PENDING_STATUS) {
    return status;
  }

  return PENDING_STATUS;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestChallengeCritiqueValidationError("requestChallengeCritique input must be an object.");
  }

  return value as Record<string, unknown>;
}

function readRequiredString(
  value: unknown,
  fieldName: string,
  options: { minLength?: number; maxLength?: number } = {},
): string {
  if (typeof value !== "string") {
    throw new RequestChallengeCritiqueValidationError(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();

  if (options.minLength !== undefined && trimmed.length < options.minLength) {
    throw new RequestChallengeCritiqueValidationError(`${fieldName} must be at least ${options.minLength} character(s).`);
  }

  if (options.maxLength !== undefined && trimmed.length > options.maxLength) {
    throw new RequestChallengeCritiqueValidationError(`${fieldName} must be at most ${options.maxLength} character(s).`);
  }

  return trimmed;
}

function readOptionalString(
  value: unknown,
  fieldName: string,
  options: { maxLength?: number } = {},
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new RequestChallengeCritiqueValidationError(`${fieldName} must be a string when provided.`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (options.maxLength !== undefined && trimmed.length > options.maxLength) {
    throw new RequestChallengeCritiqueValidationError(`${fieldName} must be at most ${options.maxLength} character(s).`);
  }

  return trimmed;
}

function isRequestChallengeCritiqueRepositoryTx(value: unknown): value is RequestChallengeCritiqueRepositoryTx {
  return Boolean(
    value &&
      typeof value === "object" &&
      "findOwnedRound" in value &&
      typeof (value as RequestChallengeCritiqueRepositoryTx).findOwnedRound === "function" &&
      "insertChallengeCritique" in value &&
      typeof (value as RequestChallengeCritiqueRepositoryTx).insertChallengeCritique === "function" &&
      "insertMoveEvent" in value &&
      typeof (value as RequestChallengeCritiqueRepositoryTx).insertMoveEvent === "function",
  );
}

export function validateRequestChallengeCritiqueInput(input: unknown): NormalizedRequestChallengeCritiqueInput {
  const object = asObject(input);

  return {
    userId: readRequiredString(object.userId, "userId", { minLength: 1, maxLength: 200 }),
    roundId: readRequiredString(object.roundId, "roundId", { minLength: 1, maxLength: 200 }),
    requestId: readOptionalString(object.requestId, "requestId", { maxLength: 200 }),
  };
}

function normalizeClaimConfidencePercent(confidenceBps: number | null) {
  if (typeof confidenceBps !== "number" || !Number.isFinite(confidenceBps)) {
    return 50;
  }

  return Math.max(0, Math.min(100, Math.round(confidenceBps / 100)));
}

function serializeGeneratedCritique(
  critique: unknown,
  metadata: { provider: string | null; model: string | null; promptVersion: string | null },
) {
  return JSON.stringify(
    {
      critique,
      metadata,
    },
    null,
    2,
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return String(error);
}

async function defaultGenerateCritique(input: LoadedChallengeCritiqueContext): Promise<GeneratedChallengeCritiqueArtifact> {
  const claimText = input.claimText?.trim() || "This claim needs a sharper challenge critique and a falsifiable test.";

  try {
    const generated = await generateChallengeCritiqueOperation(
      {
        claimId: input.claimId,
        claimText,
        claimConfidence: normalizeClaimConfidencePercent(input.claimConfidenceBps),
        mapTitle: input.mapTitle,
        neighboringClaims: [],
        previousRounds: [],
      },
      {
        userId: input.userId,
        mapId: input.mapId,
        claimId: input.claimId,
        roundId: input.roundId,
      },
    );

    return {
      body: serializeGeneratedCritique(generated.output, {
        provider: generated.meta.provider,
        model: generated.meta.model,
        promptVersion: generated.meta.promptVersion,
      }),
      metadata: {
        provider: generated.meta.provider,
        model: generated.meta.model,
        promptVersion: generated.meta.promptVersion,
      },
    };
  } catch {
    const generated = generateChallengeCritiqueStub({
      claim: claimText,
    });

    return {
      body: serializeGeneratedCritique(
        {
          body: generated.body,
        },
        {
          provider: FALLBACK_PROVIDER,
          model: FALLBACK_MODEL,
          promptVersion: FALLBACK_PROMPT_VERSION,
        },
      ),
      metadata: {
        provider: FALLBACK_PROVIDER,
        model: FALLBACK_MODEL,
        promptVersion: FALLBACK_PROMPT_VERSION,
      },
    };
  }
}

async function findOwnedCritique(
  tx: RequestChallengeCritiqueRepositoryTx | RequestChallengeCritiqueDbTx,
  input: { critiqueId: string; userId: string },
): Promise<{ id: string; status: string; body: string | null } | null> {
  if (isRequestChallengeCritiqueRepositoryTx(tx) && tx.findOwnedCritique) {
    return (await tx.findOwnedCritique(input)) ?? null;
  }

  const dbTx = tx as RequestChallengeCritiqueDbTx;
  const rows = (await dbTx
    .select({
      id: challengeCritiques.id,
      status: challengeCritiques.status,
      body: challengeCritiques.body,
    })
    .from(challengeCritiques)
    .where(and(eq(challengeCritiques.id, input.critiqueId), eq(challengeCritiques.userId, input.userId)))
    .limit(1)) as RequestChallengeCritiqueDbCritiqueRow[];

  return rows[0] ?? null;
}

async function loadChallengeCritiqueContext(
  tx: RequestChallengeCritiqueRepositoryTx | RequestChallengeCritiqueDbTx,
  input: { claimId: string; mapId: string; roundId: string; userId: string },
): Promise<LoadedChallengeCritiqueContext> {
  if (isRequestChallengeCritiqueRepositoryTx(tx) && tx.findCritiqueGenerationContext) {
    const context = await tx.findCritiqueGenerationContext(input);

    return {
      roundId: input.roundId,
      mapId: input.mapId,
      claimId: input.claimId,
      userId: input.userId,
      claimText: context?.claimText ?? null,
      claimConfidenceBps: context?.claimConfidenceBps ?? null,
      mapTitle: context?.mapTitle ?? null,
    };
  }

  const dbTx = tx as RequestChallengeCritiqueDbTx;
  const generationRows = (await dbTx
    .select({
      claimText: claims.body,
      claimConfidenceBps: claims.confidenceBps,
    })
    .from(claims)
    .where(and(eq(claims.id, input.claimId), eq(claims.mapId, input.mapId), eq(claims.userId, input.userId)))
    .limit(1)) as RequestChallengeCritiqueDbGenerationContextRow[];

  const generationRow = generationRows[0] ?? null;
  const mapRows = (await dbTx
    .select({
      mapTitle: maps.title,
    })
    .from(maps)
    .where(and(eq(maps.id, input.mapId), eq(maps.userId, input.userId)))
    .limit(1)) as RequestChallengeCritiqueDbMapRow[];
  const mapRow = mapRows[0] ?? null;

  return {
    roundId: input.roundId,
    mapId: input.mapId,
    claimId: input.claimId,
      userId: input.userId,
      claimText: generationRow?.claimText ?? null,
      claimConfidenceBps: generationRow?.claimConfidenceBps ?? null,
      mapTitle: mapRow?.mapTitle ?? null,
    };
}

async function updateStoredCritique(
  tx: RequestChallengeCritiqueRepositoryTx | RequestChallengeCritiqueDbTx,
  record: ChallengeCritiqueStoredRecord,
) {
  if (isRequestChallengeCritiqueRepositoryTx(tx) && tx.updateChallengeCritique) {
    await tx.updateChallengeCritique(record);
    return;
  }

  const dbTx = tx as RequestChallengeCritiqueDbTx;
  await dbTx
    .update(challengeCritiques)
    .set({
      status: record.status,
      body: record.body,
      updatedAt: record.updatedAt,
    })
    .where(and(eq(challengeCritiques.id, record.id), eq(challengeCritiques.userId, record.userId)));
}

async function insertCritiqueEvent(
  tx: RequestChallengeCritiqueRepositoryTx | RequestChallengeCritiqueDbTx,
  event: ChallengeCritiqueEventRecord,
) {
  if (isRequestChallengeCritiqueRepositoryTx(tx)) {
    await tx.insertMoveEvent(event);
    return;
  }

  const dbTx = tx as RequestChallengeCritiqueDbTx;
  await dbTx.insert(movesEvents).values({
    userId: event.userId,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    requestId: event.requestId,
    type: event.type,
    payloadJson: event.payload,
    createdAt: event.createdAt,
  });
}

export async function requestChallengeCritique(
  input: unknown,
  repository: RequestChallengeCritiqueRepository | RequestChallengeCritiqueDb = getDb() as unknown as
    | RequestChallengeCritiqueRepository
    | RequestChallengeCritiqueDb,
  dependencies: RequestChallengeCritiqueDependencies = {},
): Promise<RequestChallengeCritiqueResult> {
  const normalized = validateRequestChallengeCritiqueInput(input);
  const createId = dependencies.createId ?? randomUUID;
  const now = dependencies.now ?? (() => new Date());
  const generateCritique = dependencies.generateCritique ?? defaultGenerateCritique;

  return repository.transaction(async (tx) => {
    const requestId = normalized.requestId ?? createId();
    const existingEvent = await findExistingMoveEvent(tx, {
      userId: normalized.userId,
      requestId,
      type: "challenge.critique.requested",
    });

    if (existingEvent) {
      const existingCritique = await findOwnedCritique(tx, {
        critiqueId: existingEvent.aggregateId,
        userId: normalized.userId,
      });

      return {
        critiqueId: existingEvent.aggregateId,
        status: existingCritique
          ? (existingCritique.status as ChallengeCritiqueStatus)
          : readPayloadStatus(existingEvent.payload),
      };
    }

    const ownedRound = isRequestChallengeCritiqueRepositoryTx(tx)
      ? await tx.findOwnedRound({
          roundId: normalized.roundId,
          userId: normalized.userId,
        })
      : (
          (await (tx as RequestChallengeCritiqueDbTx)
            .select({
              id: challengeRounds.id,
              mapId: challengeRounds.mapId,
              claimId: challengeRounds.claimId,
              userId: challengeRounds.userId,
            })
            .from(challengeRounds)
            .where(and(eq(challengeRounds.id, normalized.roundId), eq(challengeRounds.userId, normalized.userId)))
            .limit(1)) as RequestChallengeCritiqueDbRoundRow[]
        )[0] ?? null;

    if (!ownedRound) {
      throw new RequestChallengeCritiqueRoundNotFoundError(normalized.roundId);
    }

    const timestamp = now();
    const critiqueId = createId();

    if (isRequestChallengeCritiqueRepositoryTx(tx)) {
      await tx.insertChallengeCritique({
        id: critiqueId,
        roundId: ownedRound.id,
        mapId: ownedRound.mapId,
        claimId: ownedRound.claimId,
        userId: normalized.userId,
        status: PENDING_STATUS,
        body: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    } else {
      await tx.insert(challengeCritiques).values({
        id: critiqueId,
        roundId: ownedRound.id,
        mapId: ownedRound.mapId,
        claimId: ownedRound.claimId,
        userId: normalized.userId,
        status: PENDING_STATUS,
        body: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    await insertCritiqueEvent(tx, {
      userId: normalized.userId,
      aggregateType: "challenge_critique",
      aggregateId: critiqueId,
      requestId,
      type: "challenge.critique.requested",
      payload: {
        roundId: ownedRound.id,
        mapId: ownedRound.mapId,
        claimId: ownedRound.claimId,
        status: PENDING_STATUS,
      },
      createdAt: timestamp,
    });

    try {
      const context = await loadChallengeCritiqueContext(tx, {
        roundId: ownedRound.id,
        mapId: ownedRound.mapId,
        claimId: ownedRound.claimId,
        userId: normalized.userId,
      });
      const generated = await generateCritique(context);
      const updatedAt = now();

      await updateStoredCritique(tx, {
        id: critiqueId,
        userId: normalized.userId,
        status: READY_STATUS,
        body: generated.body,
        updatedAt,
      });

      await insertCritiqueEvent(tx, {
        userId: normalized.userId,
        aggregateType: "challenge_critique",
        aggregateId: critiqueId,
        requestId,
        type: "challenge.critique.generated",
        payload: {
          roundId: ownedRound.id,
          mapId: ownedRound.mapId,
          claimId: ownedRound.claimId,
          status: READY_STATUS,
          body: generated.body,
          provider: generated.metadata.provider,
          model: generated.metadata.model,
          promptVersion: generated.metadata.promptVersion,
        },
        createdAt: updatedAt,
      });

      return {
        critiqueId,
        status: READY_STATUS,
      };
    } catch (error) {
      const updatedAt = now();

      await updateStoredCritique(tx, {
        id: critiqueId,
        userId: normalized.userId,
        status: FAILED_STATUS,
        body: null,
        updatedAt,
      });

      await insertCritiqueEvent(tx, {
        userId: normalized.userId,
        aggregateType: "challenge_critique",
        aggregateId: critiqueId,
        requestId,
        type: "challenge.critique.failed",
        payload: {
          roundId: ownedRound.id,
          mapId: ownedRound.mapId,
          claimId: ownedRound.claimId,
          status: FAILED_STATUS,
          error: getErrorMessage(error),
        },
        createdAt: updatedAt,
      });

      return {
        critiqueId,
        status: FAILED_STATUS,
      };
    }
  });
}
