import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client.ts";
import { findExistingMoveEvent } from "../idempotency/find-existing-move-event.ts";
import { challengeCritiques, challengeRounds, movesEvents } from "../db/schema.ts";

export type RequestChallengeCritiqueEventType = "challenge.critique.requested";

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
  status: string;
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
    status: string;
  };
  createdAt: Date;
};

export type RequestChallengeCritiqueRepositoryTx = {
  findMoveEventByRequestId?(input: {
    userId: string;
    requestId: string;
    type: string;
  }): Promise<{ aggregateId: string; payload: Record<string, unknown> | null } | null>;
  findOwnedRound(input: {
    roundId: string;
    userId: string;
  }): Promise<{ id: string; mapId: string; claimId: string; userId: string } | null>;
  insertChallengeCritique(record: ChallengeCritiqueRecord): Promise<void>;
  insertMoveEvent(event: ChallengeCritiqueRequestedEventRecord): Promise<void>;
};

export type RequestChallengeCritiqueRepository = {
  transaction<T>(callback: (tx: RequestChallengeCritiqueRepositoryTx) => Promise<T>): Promise<T>;
};

type RequestChallengeCritiqueDbTx = {
  select: (...args: unknown[]) => {
    from: (table: unknown) => {
      where: (condition: unknown) => {
        limit: (count: number) => Promise<Array<{ id: string; mapId: string; claimId: string; userId: string }>>;
      };
    };
  };
  insert: (table: unknown) => {
    values: (value: Record<string, unknown>) => Promise<unknown>;
  };
};

type RequestChallengeCritiqueDb = {
  transaction<T>(callback: (tx: RequestChallengeCritiqueDbTx) => Promise<T>): Promise<T>;
};

export type RequestChallengeCritiqueResult = {
  critiqueId: string;
  status: string;
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

type NormalizedRequestChallengeCritiqueInput = {
  userId: string;
  roundId: string;
  requestId: string | null;
};

const DEFAULT_CHALLENGE_CRITIQUE_STATUS = "pending";

function readPayloadStatus(payload: Record<string, unknown> | null): string {
  if (typeof payload?.status === "string" && payload.status.trim()) {
    return payload.status;
  }

  return DEFAULT_CHALLENGE_CRITIQUE_STATUS;
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

export async function requestChallengeCritique(
  input: unknown,
  repository: RequestChallengeCritiqueRepository | RequestChallengeCritiqueDb = getDb() as
    | RequestChallengeCritiqueRepository
    | RequestChallengeCritiqueDb,
  dependencies: RequestChallengeCritiqueDependencies = {},
): Promise<RequestChallengeCritiqueResult> {
  const normalized = validateRequestChallengeCritiqueInput(input);
  const createId = dependencies.createId ?? randomUUID;
  const now = dependencies.now ?? (() => new Date());

  return repository.transaction(async (tx) => {
    const requestId = normalized.requestId ?? createId();
    const existingEvent = await findExistingMoveEvent(tx, {
      userId: normalized.userId,
      requestId,
      type: "challenge.critique.requested",
    });

    if (existingEvent) {
      return {
        critiqueId: existingEvent.aggregateId,
        status: readPayloadStatus(existingEvent.payload),
      };
    }

    const ownedRound = isRequestChallengeCritiqueRepositoryTx(tx)
      ? await tx.findOwnedRound({
          roundId: normalized.roundId,
          userId: normalized.userId,
        })
      : (
          await tx
            .select({
              id: challengeRounds.id,
              mapId: challengeRounds.mapId,
              claimId: challengeRounds.claimId,
              userId: challengeRounds.userId,
            })
            .from(challengeRounds)
            .where(and(eq(challengeRounds.id, normalized.roundId), eq(challengeRounds.userId, normalized.userId)))
            .limit(1)
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
        status: DEFAULT_CHALLENGE_CRITIQUE_STATUS,
        body: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      await tx.insertMoveEvent({
        userId: normalized.userId,
        aggregateType: "challenge_critique",
        aggregateId: critiqueId,
        requestId,
        type: "challenge.critique.requested",
        payload: {
          roundId: ownedRound.id,
          mapId: ownedRound.mapId,
          claimId: ownedRound.claimId,
          status: DEFAULT_CHALLENGE_CRITIQUE_STATUS,
        },
        createdAt: timestamp,
      });
    } else {
      await tx.insert(challengeCritiques).values({
        id: critiqueId,
        roundId: ownedRound.id,
        mapId: ownedRound.mapId,
        claimId: ownedRound.claimId,
        userId: normalized.userId,
        status: DEFAULT_CHALLENGE_CRITIQUE_STATUS,
        body: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      await tx.insert(movesEvents).values({
        userId: normalized.userId,
        aggregateType: "challenge_critique",
        aggregateId: critiqueId,
        requestId,
        type: "challenge.critique.requested",
        payloadJson: {
          roundId: ownedRound.id,
          mapId: ownedRound.mapId,
          claimId: ownedRound.claimId,
          status: DEFAULT_CHALLENGE_CRITIQUE_STATUS,
        },
        createdAt: timestamp,
      });
    }

    return {
      critiqueId,
      status: DEFAULT_CHALLENGE_CRITIQUE_STATUS,
    };
  });
}
