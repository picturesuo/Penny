import { randomUUID } from "node:crypto";

export type StartChallengeRoundEventType = "challenge.round.started";

export type StartChallengeRoundInput = {
  userId: string;
  claimId: string;
  requestId?: string | null;
};

export type ChallengeRoundRecord = {
  id: string;
  mapId: string;
  claimId: string;
  userId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ChallengeRoundStartedEventRecord = {
  userId: string;
  aggregateType: "challenge_round";
  aggregateId: string;
  requestId: string;
  type: StartChallengeRoundEventType;
  payload: {
    mapId: string;
    claimId: string;
    status: string;
  };
  createdAt: Date;
};

export type StartChallengeRoundRepositoryTx = {
  findOwnedClaim(input: { claimId: string; userId: string }): Promise<{ id: string; mapId: string; userId: string } | null>;
  insertChallengeRound(record: ChallengeRoundRecord): Promise<void>;
  insertMoveEvent(event: ChallengeRoundStartedEventRecord): Promise<void>;
};

export type StartChallengeRoundRepository = {
  transaction<T>(callback: (tx: StartChallengeRoundRepositoryTx) => Promise<T>): Promise<T>;
};

export type StartChallengeRoundResult = {
  roundId: string;
};

export type StartChallengeRoundDependencies = {
  createId?: () => string;
  now?: () => Date;
};

export class StartChallengeRoundValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StartChallengeRoundValidationError";
  }
}

export class StartChallengeRoundClaimNotFoundError extends Error {
  constructor(claimId: string) {
    super(`Claim not found for startChallengeRound: ${claimId}`);
    this.name = "StartChallengeRoundClaimNotFoundError";
  }
}

type NormalizedStartChallengeRoundInput = {
  userId: string;
  claimId: string;
  requestId: string | null;
};

const DEFAULT_CHALLENGE_ROUND_STATUS = "started";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new StartChallengeRoundValidationError("startChallengeRound input must be an object.");
  }

  return value as Record<string, unknown>;
}

function readRequiredString(
  value: unknown,
  fieldName: string,
  options: { minLength?: number; maxLength?: number } = {},
): string {
  if (typeof value !== "string") {
    throw new StartChallengeRoundValidationError(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();

  if (options.minLength !== undefined && trimmed.length < options.minLength) {
    throw new StartChallengeRoundValidationError(`${fieldName} must be at least ${options.minLength} character(s).`);
  }

  if (options.maxLength !== undefined && trimmed.length > options.maxLength) {
    throw new StartChallengeRoundValidationError(`${fieldName} must be at most ${options.maxLength} character(s).`);
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
    throw new StartChallengeRoundValidationError(`${fieldName} must be a string when provided.`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (options.maxLength !== undefined && trimmed.length > options.maxLength) {
    throw new StartChallengeRoundValidationError(`${fieldName} must be at most ${options.maxLength} character(s).`);
  }

  return trimmed;
}

export function validateStartChallengeRoundInput(input: unknown): NormalizedStartChallengeRoundInput {
  const object = asObject(input);

  return {
    userId: readRequiredString(object.userId, "userId", { minLength: 1, maxLength: 200 }),
    claimId: readRequiredString(object.claimId, "claimId", { minLength: 1, maxLength: 200 }),
    requestId: readOptionalString(object.requestId, "requestId", { maxLength: 200 }),
  };
}

export async function startChallengeRound(
  input: unknown,
  repository: StartChallengeRoundRepository,
  dependencies: StartChallengeRoundDependencies = {},
): Promise<StartChallengeRoundResult> {
  const normalized = validateStartChallengeRoundInput(input);
  const createId = dependencies.createId ?? randomUUID;
  const now = dependencies.now ?? (() => new Date());

  return repository.transaction(async (tx) => {
    const ownedClaim = await tx.findOwnedClaim({
      claimId: normalized.claimId,
      userId: normalized.userId,
    });

    if (!ownedClaim) {
      throw new StartChallengeRoundClaimNotFoundError(normalized.claimId);
    }

    const timestamp = now();
    const roundId = createId();
    const requestId = normalized.requestId ?? createId();

    await tx.insertChallengeRound({
      id: roundId,
      mapId: ownedClaim.mapId,
      claimId: ownedClaim.id,
      userId: normalized.userId,
      status: DEFAULT_CHALLENGE_ROUND_STATUS,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await tx.insertMoveEvent({
      userId: normalized.userId,
      aggregateType: "challenge_round",
      aggregateId: roundId,
      requestId,
      type: "challenge.round.started",
      payload: {
        mapId: ownedClaim.mapId,
        claimId: ownedClaim.id,
        status: DEFAULT_CHALLENGE_ROUND_STATUS,
      },
      createdAt: timestamp,
    });

    return {
      roundId,
    };
  });
}
