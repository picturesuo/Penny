import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client.ts";
import { claims, maps, movesEvents } from "../db/schema.ts";

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
  aggregateType: "claim";
  aggregateId: string;
  requestId: string;
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

type CreateClaimDbRow = {
  id: string;
  userId: string;
};

type CreateClaimDbTx = {
  select: (...args: unknown[]) => {
    from: (table: unknown) => {
      where: (condition: unknown) => {
        limit: (count: number) => Promise<CreateClaimDbRow[]>;
      };
    };
  };
  insert: (table: unknown) => {
    values: (value: Record<string, unknown>) => Promise<unknown>;
  };
};

type CreateClaimDb = {
  transaction<T>(callback: (tx: CreateClaimDbTx) => Promise<T>): Promise<T>;
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

function isCreateClaimRepositoryTx(value: unknown): value is CreateClaimRepositoryTx {
  return Boolean(
    value &&
      typeof value === "object" &&
      "findOwnedMap" in value &&
      typeof (value as CreateClaimRepositoryTx).findOwnedMap === "function" &&
      "insertClaim" in value &&
      typeof (value as CreateClaimRepositoryTx).insertClaim === "function" &&
      "insertMoveEvent" in value &&
      typeof (value as CreateClaimRepositoryTx).insertMoveEvent === "function",
  );
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
  repository: CreateClaimRepository | CreateClaimDb = getDb(),
  dependencies: CreateClaimDependencies = {},
): Promise<CreateClaimResult> {
  const normalized = validateCreateClaimInput(input);
  const createId = dependencies.createId ?? randomUUID;
  const now = dependencies.now ?? (() => new Date());

  return repository.transaction(async (tx) => {
    const ownedMap = isCreateClaimRepositoryTx(tx)
      ? await tx.findOwnedMap({
          mapId: normalized.mapId,
          userId: normalized.userId,
        })
      : (
          await tx
            .select({
              id: maps.id,
              userId: maps.userId,
            })
            .from(maps)
            .where(and(eq(maps.id, normalized.mapId), eq(maps.userId, normalized.userId)))
            .limit(1)
        )[0] ?? null;

    if (!ownedMap) {
      throw new CreateClaimMapNotFoundError(normalized.mapId);
    }

    const timestamp = now();
    const claimId = createId();
    const requestId = normalized.requestId ?? createId();

    if (isCreateClaimRepositoryTx(tx)) {
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
        aggregateType: "claim",
        aggregateId: claimId,
        requestId,
        type: "claim.created",
        payload: {
          mapId: ownedMap.id,
          parentClaimId: normalized.parentClaimId,
          kind: normalized.kind,
        },
        createdAt: timestamp,
      });
    } else {
      await tx.insert(claims).values({
        id: claimId,
        mapId: ownedMap.id,
        userId: normalized.userId,
        body: normalized.text,
        confidenceBps: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      await tx.insert(movesEvents).values({
        userId: normalized.userId,
        aggregateType: "claim",
        aggregateId: claimId,
        requestId,
        type: "claim.created",
        payloadJson: {
          mapId: ownedMap.id,
          parentClaimId: normalized.parentClaimId,
          kind: normalized.kind,
          note: normalized.note,
          text: normalized.text,
        },
        createdAt: timestamp,
      });
    }

    return {
      claimId,
    };
  });
}
