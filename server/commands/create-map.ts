import { randomUUID } from "node:crypto";
import { getDb } from "../db/client.ts";
import { maps, movesEvents } from "../db/schema.ts";

export type CreateMapEventType = "map.created";

export type CreateMapInput = {
  userId: string;
  title: string;
  requestId?: string | null;
};

export type CreateMapRecord = {
  id: string;
  userId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateMapEventRecord = {
  userId: string;
  aggregateType: "map";
  aggregateId: string;
  requestId: string;
  type: CreateMapEventType;
  payload: {
    title: string;
  };
  createdAt: Date;
};

export type CreateMapRepositoryTx = {
  insertMap(record: CreateMapRecord): Promise<void>;
  insertMoveEvent(event: CreateMapEventRecord): Promise<void>;
};

export type CreateMapRepository = {
  transaction<T>(callback: (tx: CreateMapRepositoryTx) => Promise<T>): Promise<T>;
};

type CreateMapDbTx = {
  insert: (table: unknown) => {
    values: (value: Record<string, unknown>) => Promise<unknown>;
  };
};

type CreateMapDb = {
  transaction<T>(callback: (tx: CreateMapDbTx) => Promise<T>): Promise<T>;
};

export type CreateMapResult = {
  mapId: string;
};

export type CreateMapDependencies = {
  createId?: () => string;
  now?: () => Date;
};

export class CreateMapValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreateMapValidationError";
  }
}

type NormalizedCreateMapInput = {
  userId: string;
  title: string;
  requestId: string | null;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CreateMapValidationError("createMap input must be an object.");
  }

  return value as Record<string, unknown>;
}

function readRequiredString(
  value: unknown,
  fieldName: string,
  options: { minLength?: number; maxLength?: number } = {},
): string {
  if (typeof value !== "string") {
    throw new CreateMapValidationError(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();

  if (options.minLength !== undefined && trimmed.length < options.minLength) {
    throw new CreateMapValidationError(`${fieldName} must be at least ${options.minLength} character(s).`);
  }

  if (options.maxLength !== undefined && trimmed.length > options.maxLength) {
    throw new CreateMapValidationError(`${fieldName} must be at most ${options.maxLength} character(s).`);
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
    throw new CreateMapValidationError(`${fieldName} must be a string when provided.`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (options.maxLength !== undefined && trimmed.length > options.maxLength) {
    throw new CreateMapValidationError(`${fieldName} must be at most ${options.maxLength} character(s).`);
  }

  return trimmed;
}

function isCreateMapRepositoryTx(value: unknown): value is CreateMapRepositoryTx {
  return Boolean(
    value &&
      typeof value === "object" &&
      "insertMap" in value &&
      typeof (value as CreateMapRepositoryTx).insertMap === "function" &&
      "insertMoveEvent" in value &&
      typeof (value as CreateMapRepositoryTx).insertMoveEvent === "function",
  );
}

export function validateCreateMapInput(input: unknown): NormalizedCreateMapInput {
  const object = asObject(input);

  return {
    userId: readRequiredString(object.userId, "userId", { minLength: 1, maxLength: 200 }),
    title: readRequiredString(object.title, "title", { minLength: 1, maxLength: 200 }),
    requestId: readOptionalString(object.requestId, "requestId", { maxLength: 200 }),
  };
}

export async function createMap(
  input: unknown,
  repository: CreateMapRepository | CreateMapDb = getDb(),
  dependencies: CreateMapDependencies = {},
): Promise<CreateMapResult> {
  const normalized = validateCreateMapInput(input);
  const createId = dependencies.createId ?? randomUUID;
  const now = dependencies.now ?? (() => new Date());

  return repository.transaction(async (tx) => {
    const timestamp = now();
    const mapId = createId();
    const requestId = normalized.requestId ?? createId();

    if (isCreateMapRepositoryTx(tx)) {
      await tx.insertMap({
        id: mapId,
        userId: normalized.userId,
        title: normalized.title,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      await tx.insertMoveEvent({
        userId: normalized.userId,
        aggregateType: "map",
        aggregateId: mapId,
        requestId,
        type: "map.created",
        payload: {
          title: normalized.title,
        },
        createdAt: timestamp,
      });
    } else {
      await tx.insert(maps).values({
        id: mapId,
        userId: normalized.userId,
        title: normalized.title,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      await tx.insert(movesEvents).values({
        userId: normalized.userId,
        aggregateType: "map",
        aggregateId: mapId,
        requestId,
        type: "map.created",
        payloadJson: {
          title: normalized.title,
        },
        createdAt: timestamp,
      });
    }

    return {
      mapId,
    };
  });
}
