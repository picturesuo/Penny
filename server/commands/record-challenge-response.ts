import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { getDb } from "../db/client.ts";
import { findExistingMoveEvent } from "../idempotency/find-existing-move-event.ts";
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

type RecordChallengeResponseDbTx = {
  select: (...args: any[]) => {
    from: (table: any) => {
      where: (condition: any) => {
        limit: (count: number) => Promise<any[]>;
      };
    };
  };
  update: (table: any) => {
    set: (value: Record<string, unknown>) => {
      where: (condition: any) => Promise<unknown>;
    };
  };
  insert: (table: any) => {
    values: (value: Record<string, unknown>) => Promise<unknown>;
  };
};

type RecordChallengeResponseDb = {
  transaction<T>(callback: (tx: any) => Promise<T>): Promise<T>;
};

export type RecordChallengeResponseResult = {
  roundId: string;
  status: "responded";
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
  repository: RecordChallengeResponseRepository | RecordChallengeResponseDb = getDb(),
  dependencies: RecordChallengeResponseDependencies = {},
): Promise<RecordChallengeResponseResult> {
  const normalized = validateRecordChallengeResponseInput(input);
  const createId = dependencies.createId ?? randomUUID;
  const now = dependencies.now ?? (() => new Date());

  return repository.transaction(async (tx) => {
    const requestId = normalized.requestId ?? createId();
    const existingEvent = await findExistingMoveEvent(tx, {
      userId: normalized.userId,
      requestId,
      type: "challenge.response.recorded",
    });

    if (existingEvent) {
      return {
        roundId: existingEvent.aggregateId,
        status: RESPONDED_STATUS,
      };
    }

    const ownedRound = isRecordChallengeResponseRepositoryTx(tx)
      ? await tx.findOwnedRound({
          roundId: normalized.roundId,
          userId: normalized.userId,
        })
      : (
          ((await tx
            .select({
              id: challengeRounds.id,
              mapId: challengeRounds.mapId,
              claimId: challengeRounds.claimId,
              userId: challengeRounds.userId,
              status: challengeRounds.status,
            })
            .from(challengeRounds)
            .where(and(eq(challengeRounds.id, normalized.roundId), eq(challengeRounds.userId, normalized.userId)))
            .limit(1)) as RecordChallengeResponseDbRow[])[0] ?? null
        );

    if (!ownedRound) {
      throw new RecordChallengeResponseRoundNotFoundError(normalized.roundId);
    }

    const timestamp = now();

    if (isRecordChallengeResponseRepositoryTx(tx)) {
      await tx.updateChallengeRound({
        id: ownedRound.id,
        mapId: ownedRound.mapId,
        claimId: ownedRound.claimId,
        userId: ownedRound.userId,
        status: RESPONDED_STATUS,
        updatedAt: timestamp,
      });

      await tx.insertMoveEvent({
        userId: normalized.userId,
        aggregateType: "challenge_round",
        aggregateId: ownedRound.id,
        requestId,
        type: "challenge.response.recorded",
        payload: {
          mapId: ownedRound.mapId,
          claimId: ownedRound.claimId,
          response: normalized.response,
          responsePath: normalized.responsePath,
          confidenceBps: normalized.confidenceBps,
          previousStatus: ownedRound.status,
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
        .where(and(eq(challengeRounds.id, ownedRound.id), eq(challengeRounds.userId, normalized.userId)));

      await tx.insert(movesEvents).values({
        userId: normalized.userId,
        aggregateType: "challenge_round",
        aggregateId: ownedRound.id,
        requestId,
        type: "challenge.response.recorded",
        payloadJson: {
          mapId: ownedRound.mapId,
          claimId: ownedRound.claimId,
          response: normalized.response,
          responsePath: normalized.responsePath,
          confidenceBps: normalized.confidenceBps,
          previousStatus: ownedRound.status,
          status: RESPONDED_STATUS,
        },
        createdAt: timestamp,
      });
    }

    return {
      roundId: ownedRound.id,
      status: RESPONDED_STATUS,
    };
  });
}
