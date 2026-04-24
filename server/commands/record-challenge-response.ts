import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { getDb } from "../db/client.ts";
import { findExistingMoveEvent, type SelectableDbTx } from "../idempotency/find-existing-move-event.ts";
import { challengeRounds, movesEvents } from "../db/schema.ts";

export type RecordChallengeResponseEventType = "challenge.response.recorded";

export type RecordChallengeResponseInput = {
  userId: string;
  roundId: string;
  response: string;
  responsePath?: string | null;
  confidenceBps?: number | null;
  requestId?: string | null;
};

export type RecordChallengeResponseRoundRecord = {
  id: string;
  mapId: string;
  claimId: string;
  userId: string;
  status: string;
  updatedAt: Date;
};

export type ChallengeResponseRecordedEventRecord = {
  userId: string;
  aggregateType: "challenge_round";
  aggregateId: string;
  requestId: string;
  type: RecordChallengeResponseEventType;
  payload: {
    mapId: string;
    claimId: string;
    response: string;
    responsePath: string | null;
    confidenceBps: number | null;
    previousStatus: string;
    status: "responded";
  };
  createdAt: Date;
};

export type RecordChallengeResponseRepositoryTx = {
  findMoveEventByRequestId?(input: {
    userId: string;
    requestId: string;
    type: string;
  }): Promise<{ aggregateId: string } | null>;
  findRoundById?(input: {
    roundId: string;
  }): Promise<{ id: string; mapId: string; claimId: string; userId: string; status: string } | null>;
  findOwnedRound(input: {
    roundId: string;
    userId: string;
  }): Promise<{ id: string; mapId: string; claimId: string; userId: string; status: string } | null>;
  updateChallengeRound(record: RecordChallengeResponseRoundRecord): Promise<void>;
  insertMoveEvent(event: ChallengeResponseRecordedEventRecord): Promise<void>;
};

export type RecordChallengeResponseRepository = {
  transaction<T>(callback: (tx: RecordChallengeResponseRepositoryTx) => Promise<T>): Promise<T>;
};

type RecordChallengeResponseDbRow = {
  id: string;
  mapId: string;
  claimId: string;
  userId: string;
  status: string;
};

type RecordChallengeResponseDbTx = SelectableDbTx & {
  update: (table: unknown) => {
    set: (value: Record<string, unknown>) => {
      where: (condition: unknown) => Promise<unknown>;
    };
  };
  insert: (table: unknown) => {
    values: (value: Record<string, unknown>) => Promise<unknown>;
  };
};

type RecordChallengeResponseTx = RecordChallengeResponseRepositoryTx | RecordChallengeResponseDbTx;

type RecordChallengeResponseDb = {
  transaction<T>(callback: (tx: RecordChallengeResponseDbTx) => Promise<T>): Promise<T>;
};

type RecordChallengeResponseTransactional = {
  transaction<T>(callback: (tx: RecordChallengeResponseTx) => Promise<T>): Promise<T>;
};

export type RecordChallengeResponseResult = {
  roundId: string;
  responseRecorded: true;
};

export type RecordChallengeResponseDependencies = {
  createId?: () => string;
  now?: () => Date;
};

export class RecordChallengeResponseValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecordChallengeResponseValidationError";
  }
}

export class RecordChallengeResponseRoundNotFoundError extends Error {
  constructor(roundId: string) {
    super(`Challenge round not found for recordChallengeResponse: ${roundId}`);
    this.name = "RecordChallengeResponseRoundNotFoundError";
  }
}

export class RecordChallengeResponseRoundForbiddenError extends Error {
  constructor(roundId: string) {
    super(`User does not own challenge round for recordChallengeResponse: ${roundId}`);
    this.name = "RecordChallengeResponseRoundForbiddenError";
  }
}

type NormalizedRecordChallengeResponseInput = {
  userId: string;
  roundId: string;
  response: string;
  responsePath: string | null;
  confidenceBps: number | null;
  requestId: string | null;
};

const RESPONDED_STATUS = "responded";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RecordChallengeResponseValidationError("recordChallengeResponse input must be an object.");
  }

  return value as Record<string, unknown>;
}

function readRequiredString(
  value: unknown,
  fieldName: string,
  options: { minLength?: number; maxLength?: number } = {},
): string {
  if (typeof value !== "string") {
    throw new RecordChallengeResponseValidationError(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();

  if (options.minLength !== undefined && trimmed.length < options.minLength) {
    throw new RecordChallengeResponseValidationError(`${fieldName} must be at least ${options.minLength} character(s).`);
  }

  if (options.maxLength !== undefined && trimmed.length > options.maxLength) {
    throw new RecordChallengeResponseValidationError(`${fieldName} must be at most ${options.maxLength} character(s).`);
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
    throw new RecordChallengeResponseValidationError(`${fieldName} must be a string when provided.`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (options.maxLength !== undefined && trimmed.length > options.maxLength) {
    throw new RecordChallengeResponseValidationError(`${fieldName} must be at most ${options.maxLength} character(s).`);
  }

  return trimmed;
}

function readOptionalInteger(
  value: unknown,
  fieldName: string,
  options: { min?: number; max?: number } = {},
): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new RecordChallengeResponseValidationError(`${fieldName} must be an integer when provided.`);
  }

  if (options.min !== undefined && value < options.min) {
    throw new RecordChallengeResponseValidationError(`${fieldName} must be at least ${options.min}.`);
  }

  if (options.max !== undefined && value > options.max) {
    throw new RecordChallengeResponseValidationError(`${fieldName} must be at most ${options.max}.`);
  }

  return value;
}

function isRecordChallengeResponseRepositoryTx(value: unknown): value is RecordChallengeResponseRepositoryTx {
  return Boolean(
    value &&
      typeof value === "object" &&
      "findOwnedRound" in value &&
      typeof (value as RecordChallengeResponseRepositoryTx).findOwnedRound === "function" &&
      "updateChallengeRound" in value &&
      typeof (value as RecordChallengeResponseRepositoryTx).updateChallengeRound === "function" &&
      "insertMoveEvent" in value &&
      typeof (value as RecordChallengeResponseRepositoryTx).insertMoveEvent === "function",
  );
}

async function findRoundForChallengeResponse(
  tx: RecordChallengeResponseTx,
  input: { roundId: string; userId: string },
): Promise<{ id: string; mapId: string; claimId: string; userId: string; status: string } | null> {
  if (isRecordChallengeResponseRepositoryTx(tx)) {
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
        status: challengeRounds.status,
      })
      .from(challengeRounds)
      .where(eq(challengeRounds.id, input.roundId))
      .limit(1)) as RecordChallengeResponseDbRow[]
  )[0] ?? null;
}

export function validateRecordChallengeResponseInput(input: unknown): NormalizedRecordChallengeResponseInput {
  const object = asObject(input);

  return {
    userId: readRequiredString(object.userId, "userId", { minLength: 1, maxLength: 200 }),
    roundId: readRequiredString(object.roundId, "roundId", { minLength: 1, maxLength: 200 }),
    response: readRequiredString(object.response, "response", { minLength: 1, maxLength: 4000 }),
    responsePath: readOptionalString(object.responsePath, "responsePath", { maxLength: 64 }),
    confidenceBps: readOptionalInteger(object.confidenceBps, "confidenceBps", { min: 0, max: 10000 }),
    requestId: readOptionalString(object.requestId, "requestId", { maxLength: 200 }),
  };
}

export async function recordChallengeResponse(
  input: unknown,
  repository: RecordChallengeResponseRepository | RecordChallengeResponseDb = getDb() as unknown as RecordChallengeResponseDb,
  dependencies: RecordChallengeResponseDependencies = {},
): Promise<RecordChallengeResponseResult> {
  const normalized = validateRecordChallengeResponseInput(input);
  const createId = dependencies.createId ?? randomUUID;
  const now = dependencies.now ?? (() => new Date());
  const transactionalRepository = repository as RecordChallengeResponseTransactional;

  return transactionalRepository.transaction(async (tx) => {
    const requestId = normalized.requestId ?? createId();
    const existingEvent = await findExistingMoveEvent(tx, {
      userId: normalized.userId,
      requestId,
      type: "challenge.response.recorded",
    });

    if (existingEvent) {
      return {
        roundId: existingEvent.aggregateId,
        responseRecorded: true,
      };
    }

    const targetRound = await findRoundForChallengeResponse(tx, {
      roundId: normalized.roundId,
      userId: normalized.userId,
    });

    if (!targetRound) {
      throw new RecordChallengeResponseRoundNotFoundError(normalized.roundId);
    }

    if (targetRound.userId !== normalized.userId) {
      throw new RecordChallengeResponseRoundForbiddenError(normalized.roundId);
    }

    const timestamp = now();

    if (isRecordChallengeResponseRepositoryTx(tx)) {
      await tx.updateChallengeRound({
        id: targetRound.id,
        mapId: targetRound.mapId,
        claimId: targetRound.claimId,
        userId: targetRound.userId,
        status: RESPONDED_STATUS,
        updatedAt: timestamp,
      });

      await tx.insertMoveEvent({
        userId: normalized.userId,
        aggregateType: "challenge_round",
        aggregateId: targetRound.id,
        requestId,
        type: "challenge.response.recorded",
        payload: {
          mapId: targetRound.mapId,
          claimId: targetRound.claimId,
          response: normalized.response,
          responsePath: normalized.responsePath,
          confidenceBps: normalized.confidenceBps,
          previousStatus: targetRound.status,
          status: RESPONDED_STATUS,
        },
        createdAt: timestamp,
      });
    } else {
      await tx
        .update(challengeRounds)
        .set({
          status: RESPONDED_STATUS,
          updatedAt: timestamp,
        })
        .where(and(eq(challengeRounds.id, targetRound.id), eq(challengeRounds.userId, normalized.userId)));

      await tx.insert(movesEvents).values({
        userId: normalized.userId,
        aggregateType: "challenge_round",
        aggregateId: targetRound.id,
        requestId,
        type: "challenge.response.recorded",
        payloadJson: {
          mapId: targetRound.mapId,
          claimId: targetRound.claimId,
          response: normalized.response,
          responsePath: normalized.responsePath,
          confidenceBps: normalized.confidenceBps,
          previousStatus: targetRound.status,
          status: RESPONDED_STATUS,
        },
        createdAt: timestamp,
      });
    }

    return {
      roundId: targetRound.id,
      responseRecorded: true,
    };
  });
}
