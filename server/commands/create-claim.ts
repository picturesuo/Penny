import { randomUUID } from "node:crypto";

export type CreateClaimEventType = "claim.created";

export type CreateClaimInput = {
  userId: string;
  mapId: string;
  text: string;
  note?: string | null;
  parentClaimId?: string | null;
  kind?: string;
  requestId?: string | null;
};

export type CreateClaimRecord = {
  id: string;
  userId: string;
  mapId: string;
  text: string;
  note: string | null;
  parentClaimId: string | null;
  kind: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateClaimEventRecord = {
  userId: string;
  aggregateId: string;
  requestId: string | null;
  type: CreateClaimEventType;
  payload: {
    mapId: string;
    parentClaimId: string | null;
    kind: string;
  };
  createdAt: Date;
};

export type CreateClaimRepositoryTx = {
  findOwnedMap(input: { mapId: string; userId: string }): Promise<{ id: string; userId: string } | null>;
  insertClaim(record: CreateClaimRecord): Promise<void>;
  insertMoveEvent(event: CreateClaimEventRecord): Promise<void>;
};

export type CreateClaimRepository = {
  transaction<T>(callback: (tx: CreateClaimRepositoryTx) => Promise<T>): Promise<T>;
};

export type CreateClaimResult = {
  claimId: string;
};

export type CreateClaimDependencies = {
  createId?: () => string;
  now?: () => Date;
};

export class CreateClaimValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreateClaimValidationError";
  }
}

export class CreateClaimMapNotFoundError extends Error {
  constructor(mapId: string) {
    super(`Map not found for createClaim: ${mapId}`);
    this.name = "CreateClaimMapNotFoundError";
  }
}

type NormalizedCreateClaimInput = {
  userId: string;
  mapId: string;
  text: string;
  note: string | null;
  parentClaimId: string | null;
  kind: string;
  requestId: string | null;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CreateClaimValidationError("createClaim input must be an object.");
  }

  return value as Record<string, unknown>;
}

function readRequiredString(
  value: unknown,
  fieldName: string,
  options: { minLength?: number; maxLength?: number } = {},
): string {
  if (typeof value !== "string") {
    throw new CreateClaimValidationError(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();

  if (options.minLength !== undefined && trimmed.length < options.minLength) {
    throw new CreateClaimValidationError(`${fieldName} must be at least ${options.minLength} character(s).`);
  }

  if (options.maxLength !== undefined && trimmed.length > options.maxLength) {
    throw new CreateClaimValidationError(`${fieldName} must be at most ${options.maxLength} character(s).`);
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
    throw new CreateClaimValidationError(`${fieldName} must be a string when provided.`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (options.maxLength !== undefined && trimmed.length > options.maxLength) {
    throw new CreateClaimValidationError(`${fieldName} must be at most ${options.maxLength} character(s).`);
  }

  return trimmed;
}

export function validateCreateClaimInput(input: unknown): NormalizedCreateClaimInput {
  const object = asObject(input);

  return {
    userId: readRequiredString(object.userId, "userId", { minLength: 1, maxLength: 200 }),
    mapId: readRequiredString(object.mapId, "mapId", { minLength: 1, maxLength: 200 }),
    text: readRequiredString(object.text, "text", { minLength: 1, maxLength: 4000 }),
    note: readOptionalString(object.note, "note", { maxLength: 4000 }),
    parentClaimId: readOptionalString(object.parentClaimId, "parentClaimId", { maxLength: 200 }),
    kind: readOptionalString(object.kind, "kind", { maxLength: 64 }) ?? "claim",
    requestId: readOptionalString(object.requestId, "requestId", { maxLength: 200 }),
  };
}

export async function createClaim(
  input: unknown,
  repository: CreateClaimRepository,
  dependencies: CreateClaimDependencies = {},
): Promise<CreateClaimResult> {
  const normalized = validateCreateClaimInput(input);
  const createId = dependencies.createId ?? randomUUID;
  const now = dependencies.now ?? (() => new Date());

  return repository.transaction(async (tx) => {
    const ownedMap = await tx.findOwnedMap({
      mapId: normalized.mapId,
      userId: normalized.userId,
    });

    if (!ownedMap) {
      throw new CreateClaimMapNotFoundError(normalized.mapId);
    }

    const timestamp = now();
    const claimId = createId();

    await tx.insertClaim({
      id: claimId,
      userId: normalized.userId,
      mapId: ownedMap.id,
      text: normalized.text,
      note: normalized.note,
      parentClaimId: normalized.parentClaimId,
      kind: normalized.kind,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await tx.insertMoveEvent({
      userId: normalized.userId,
      aggregateId: claimId,
      requestId: normalized.requestId,
      type: "claim.created",
      payload: {
        mapId: ownedMap.id,
        parentClaimId: normalized.parentClaimId,
        kind: normalized.kind,
      },
      createdAt: timestamp,
    });

    return {
      claimId,
    };
  });
}
