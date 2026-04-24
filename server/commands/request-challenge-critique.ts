import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { getDb } from "../db/client.ts";
import { challengeCritiques, challengeRounds, claims, maps, movesEvents } from "../db/schema.ts";
import { findExistingMoveEvent, type SelectableDbTx } from "../idempotency/find-existing-move-event.ts";

export type RequestChallengeCritiqueEventType = "challenge.critique.requested";

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

export type ChallengeCritiqueRequestedEventRecord = {
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
  };
  createdAt: Date;
};

export type RequestChallengeCritiqueRepositoryTx = {
  findMoveEventByRequestId?(input: {
    userId: string;
    requestId: string;
    type: string;
  }): Promise<{ aggregateId: string; payload: Record<string, unknown> | null } | null>;
  findOwnedCritique?(input: {
    critiqueId: string;
    userId: string;
  }): Promise<{ id: string; roundId: string; status: string; body: string | null } | null>;
  findOwnedCritiqueByRound(input: {
    roundId: string;
    userId: string;
  }): Promise<{ id: string; roundId: string; status: string; body: string | null } | null>;
  findMapById(input: {
    mapId: string;
  }): Promise<{ id: string; userId: string } | null>;
  findClaimById(input: {
    claimId: string;
  }): Promise<{ id: string; mapId: string; userId: string } | null>;
  findRoundById?(input: {
    roundId: string;
  }): Promise<{ id: string; mapId: string; claimId: string; userId: string } | null>;
  findOwnedRound(input: {
    roundId: string;
    userId: string;
  }): Promise<{ id: string; mapId: string; claimId: string; userId: string } | null>;
  insertChallengeCritique(record: ChallengeCritiqueRecord): Promise<void>;
  updateChallengeCritiquePlaceholder(record: {
    id: string;
    userId: string;
    status: ChallengeCritiqueStatus;
    body: string | null;
    updatedAt: Date;
  }): Promise<void>;
  insertMoveEvent(event: ChallengeCritiqueRequestedEventRecord): Promise<void>;
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
  roundId: string;
  status: string;
  body: string | null;
};

type RequestChallengeCritiqueDbMapRow = {
  id: string;
  userId: string;
};

type RequestChallengeCritiqueDbClaimRow = {
  id: string;
  mapId: string;
  userId: string;
};

type RequestChallengeCritiqueDbTx = SelectableDbTx & {
  insert: (table: unknown) => {
    values: (value: Record<string, unknown>) => Promise<unknown>;
  };
  update: (table: unknown) => {
    set: (value: Record<string, unknown>) => {
      where: (condition: unknown) => Promise<unknown>;
    };
  };
};

type RequestChallengeCritiqueTx = RequestChallengeCritiqueRepositoryTx | RequestChallengeCritiqueDbTx;

type RequestChallengeCritiqueDb = {
  transaction<T>(callback: (tx: RequestChallengeCritiqueDbTx) => Promise<T>): Promise<T>;
};

type RequestChallengeCritiqueTransactional = {
  transaction<T>(callback: (tx: RequestChallengeCritiqueTx) => Promise<T>): Promise<T>;
};

export type RequestChallengeCritiqueResult = {
  critiqueId: string;
  roundId: string;
  critiqueStatus: ChallengeCritiqueStatus;
};

export type RequestChallengeCritiqueDependencies = {
  createId?: () => string;
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

export class RequestChallengeCritiqueRoundForbiddenError extends Error {
  constructor(roundId: string) {
    super(`User does not own challenge round for requestChallengeCritique: ${roundId}`);
    this.name = "RequestChallengeCritiqueRoundForbiddenError";
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

function normalizeStoredStatus(status: string | null | undefined): ChallengeCritiqueStatus {
  if (status === READY_STATUS || status === FAILED_STATUS || status === PENDING_STATUS) {
    return status;
  }

  return PENDING_STATUS;
}

function readPayloadStatus(payload: Record<string, unknown> | null): ChallengeCritiqueStatus {
  return normalizeStoredStatus(typeof payload?.status === "string" ? payload.status : null);
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
      "findOwnedCritiqueByRound" in value &&
      typeof (value as RequestChallengeCritiqueRepositoryTx).findOwnedCritiqueByRound === "function" &&
      "findMapById" in value &&
      typeof (value as RequestChallengeCritiqueRepositoryTx).findMapById === "function" &&
      "findClaimById" in value &&
      typeof (value as RequestChallengeCritiqueRepositoryTx).findClaimById === "function" &&
      "insertChallengeCritique" in value &&
      typeof (value as RequestChallengeCritiqueRepositoryTx).insertChallengeCritique === "function" &&
      "updateChallengeCritiquePlaceholder" in value &&
      typeof (value as RequestChallengeCritiqueRepositoryTx).updateChallengeCritiquePlaceholder === "function" &&
      "insertMoveEvent" in value &&
      typeof (value as RequestChallengeCritiqueRepositoryTx).insertMoveEvent === "function",
  );
}

function hasSelectQuery(value: RequestChallengeCritiqueTx): value is RequestChallengeCritiqueDbTx {
  return "select" in value && typeof value.select === "function";
}

export function validateRequestChallengeCritiqueInput(input: unknown): NormalizedRequestChallengeCritiqueInput {
  const object = asObject(input);

  return {
    userId: readRequiredString(object.userId, "userId", { minLength: 1, maxLength: 200 }),
    roundId: readRequiredString(object.roundId, "roundId", { minLength: 1, maxLength: 200 }),
    requestId: readOptionalString(object.requestId, "requestId", { maxLength: 200 }),
  };
}

async function findOwnedCritique(
  tx: RequestChallengeCritiqueTx,
  input: { critiqueId: string; userId: string },
): Promise<{ id: string; roundId: string; status: string; body: string | null } | null> {
  if (isRequestChallengeCritiqueRepositoryTx(tx) && tx.findOwnedCritique) {
    return (await tx.findOwnedCritique(input)) ?? null;
  }

  if (!hasSelectQuery(tx)) {
    return null;
  }

  const rows = (await tx
    .select({
      id: challengeCritiques.id,
      roundId: challengeCritiques.roundId,
      status: challengeCritiques.status,
      body: challengeCritiques.body,
    })
    .from(challengeCritiques)
    .where(and(eq(challengeCritiques.id, input.critiqueId), eq(challengeCritiques.userId, input.userId)))
    .limit(1)) as RequestChallengeCritiqueDbCritiqueRow[];

  return rows[0] ?? null;
}

async function findOwnedCritiqueByRound(
  tx: RequestChallengeCritiqueTx,
  input: { roundId: string; userId: string },
): Promise<{ id: string; roundId: string; status: string; body: string | null } | null> {
  if (isRequestChallengeCritiqueRepositoryTx(tx)) {
    return tx.findOwnedCritiqueByRound(input);
  }

  if (!hasSelectQuery(tx)) {
    return null;
  }

  const rows = (await tx
    .select({
      id: challengeCritiques.id,
      roundId: challengeCritiques.roundId,
      status: challengeCritiques.status,
      body: challengeCritiques.body,
    })
    .from(challengeCritiques)
    .where(and(eq(challengeCritiques.roundId, input.roundId), eq(challengeCritiques.userId, input.userId)))
    .limit(1)) as RequestChallengeCritiqueDbCritiqueRow[];

  return rows[0] ?? null;
}

async function findMapById(
  tx: RequestChallengeCritiqueTx,
  input: { mapId: string },
): Promise<{ id: string; userId: string } | null> {
  if (isRequestChallengeCritiqueRepositoryTx(tx)) {
    return tx.findMapById(input);
  }

  const rows = (await tx
    .select({
      id: maps.id,
      userId: maps.userId,
    })
    .from(maps)
    .where(eq(maps.id, input.mapId))
    .limit(1)) as RequestChallengeCritiqueDbMapRow[];

  return rows[0] ?? null;
}

async function findClaimById(
  tx: RequestChallengeCritiqueTx,
  input: { claimId: string },
): Promise<{ id: string; mapId: string; userId: string } | null> {
  if (isRequestChallengeCritiqueRepositoryTx(tx)) {
    return tx.findClaimById(input);
  }

  const rows = (await tx
    .select({
      id: claims.id,
      mapId: claims.mapId,
      userId: claims.userId,
    })
    .from(claims)
    .where(eq(claims.id, input.claimId))
    .limit(1)) as RequestChallengeCritiqueDbClaimRow[];

  return rows[0] ?? null;
}

async function findRoundForChallengeCritique(
  tx: RequestChallengeCritiqueTx,
  input: { roundId: string; userId: string },
): Promise<{ id: string; mapId: string; claimId: string; userId: string } | null> {
  if (isRequestChallengeCritiqueRepositoryTx(tx)) {
    if (tx.findRoundById) {
      return tx.findRoundById({ roundId: input.roundId });
    }

    return tx.findOwnedRound(input);
  }

  return (
    (await tx
      .select({
        id: challengeRounds.id,
        mapId: challengeRounds.mapId,
        claimId: challengeRounds.claimId,
        userId: challengeRounds.userId,
      })
      .from(challengeRounds)
      .where(eq(challengeRounds.id, input.roundId))
      .limit(1)) as RequestChallengeCritiqueDbRoundRow[]
  )[0] ?? null;
}

async function updateCritiquePlaceholder(
  tx: RequestChallengeCritiqueTx,
  record: {
    id: string;
    userId: string;
    status: ChallengeCritiqueStatus;
    body: string | null;
    updatedAt: Date;
  },
) {
  if (isRequestChallengeCritiqueRepositoryTx(tx)) {
    await tx.updateChallengeCritiquePlaceholder(record);
    return;
  }

  await tx
    .update(challengeCritiques)
    .set({
      status: record.status,
      body: record.body,
      critiqueJson: null,
      updatedAt: record.updatedAt,
    })
    .where(and(eq(challengeCritiques.id, record.id), eq(challengeCritiques.userId, record.userId)));
}

async function insertCritiqueEvent(
  tx: RequestChallengeCritiqueTx,
  event: ChallengeCritiqueRequestedEventRecord,
) {
  if (isRequestChallengeCritiqueRepositoryTx(tx)) {
    await tx.insertMoveEvent(event);
    return;
  }

  await tx.insert(movesEvents).values({
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
  repository: RequestChallengeCritiqueRepository | RequestChallengeCritiqueDb = getDb() as unknown as RequestChallengeCritiqueDb,
  dependencies: RequestChallengeCritiqueDependencies = {},
): Promise<RequestChallengeCritiqueResult> {
  const normalized = validateRequestChallengeCritiqueInput(input);
  const createId = dependencies.createId ?? randomUUID;
  const now = dependencies.now ?? (() => new Date());
  const transactionalRepository = repository as RequestChallengeCritiqueTransactional;

  return transactionalRepository.transaction(async (tx) => {
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
        roundId:
          existingCritique?.roundId ??
          (typeof existingEvent.payload?.roundId === "string" ? existingEvent.payload.roundId : normalized.roundId),
        critiqueStatus: readPayloadStatus(existingEvent.payload),
      };
    }

    const targetRound = await findRoundForChallengeCritique(tx, {
      roundId: normalized.roundId,
      userId: normalized.userId,
    });

    if (!targetRound) {
      throw new RequestChallengeCritiqueRoundNotFoundError(normalized.roundId);
    }

    if (targetRound.userId !== normalized.userId) {
      throw new RequestChallengeCritiqueRoundForbiddenError(normalized.roundId);
    }

    const targetMap = await findMapById(tx, { mapId: targetRound.mapId });
    const targetClaim = await findClaimById(tx, { claimId: targetRound.claimId });

    if (
      !targetMap ||
      !targetClaim ||
      targetMap.userId !== normalized.userId ||
      targetClaim.userId !== normalized.userId ||
      targetClaim.mapId !== targetRound.mapId
    ) {
      throw new RequestChallengeCritiqueRoundForbiddenError(normalized.roundId);
    }

    const timestamp = now();
    const existingCritique = await findOwnedCritiqueByRound(tx, {
      roundId: targetRound.id,
      userId: normalized.userId,
    });
    const critiqueId = existingCritique?.id ?? createId();

    if (existingCritique) {
      await updateCritiquePlaceholder(tx, {
        id: critiqueId,
        userId: normalized.userId,
        status: PENDING_STATUS,
        body: null,
        updatedAt: timestamp,
      });
    } else if (isRequestChallengeCritiqueRepositoryTx(tx)) {
      await tx.insertChallengeCritique({
        id: critiqueId,
        roundId: targetRound.id,
        mapId: targetRound.mapId,
        claimId: targetRound.claimId,
        userId: normalized.userId,
        status: PENDING_STATUS,
        body: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    } else {
      await tx.insert(challengeCritiques).values({
        id: critiqueId,
        roundId: targetRound.id,
        mapId: targetRound.mapId,
        claimId: targetRound.claimId,
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
        roundId: targetRound.id,
        mapId: targetRound.mapId,
        claimId: targetRound.claimId,
        status: PENDING_STATUS,
      },
      createdAt: timestamp,
    });

    return {
      critiqueId,
      roundId: targetRound.id,
      critiqueStatus: PENDING_STATUS,
    };
  });
}
