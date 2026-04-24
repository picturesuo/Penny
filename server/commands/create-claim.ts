import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/client.ts";
import { findExistingMoveEvent, type SelectableDbTx } from "../idempotency/find-existing-move-event.ts";
import { maps, movesEvents } from "../db/schema.ts";
import { resolveCommandContext } from "./command-context.ts";

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
    note: string | null;
    text: string;
  };
  createdAt: Date;
};

export type CreateClaimActivityEventRecord = {
  userId: string;
  sessionId: string | null;
  aggregateType: "claim";
  aggregateId: string;
  requestId: string;
  type: CreateClaimEventType;
  payload: {
    mapId: string;
    parentClaimId: string | null;
    kind: string;
    note: string | null;
    text: string;
  };
  createdAt: Date;
};

export type CreateClaimRepositoryTx = {
  findMoveEventByRequestId?(input: { userId: string; requestId: string; type: string }): Promise<{
    aggregateId: string;
  } | null>;
  findMapById?(input: { mapId: string }): Promise<{ id: string; userId: string } | null>;
  findOwnedMap(input: { mapId: string; userId: string }): Promise<{ id: string; userId: string } | null>;
  insertClaim(record: CreateClaimRecord): Promise<void>;
  insertMoveEvent(event: CreateClaimEventRecord): Promise<void>;
  insertActivityEvent?(event: CreateClaimActivityEventRecord): Promise<void>;
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
  execute: (query: unknown) => Promise<unknown>;
  insert: (table: unknown) => {
    values: (value: Record<string, unknown>) => Promise<unknown>;
  };
} & SelectableDbTx;

type CreateClaimTx = CreateClaimRepositoryTx | CreateClaimDbTx;

type CreateClaimDb = {
  transaction<T>(callback: (tx: CreateClaimDbTx) => Promise<T>): Promise<T>;
};

type CreateClaimTransactional = {
  transaction<T>(callback: (tx: CreateClaimTx) => Promise<T>): Promise<T>;
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

export class CreateClaimMapForbiddenError extends Error {
  constructor(mapId: string) {
    super(`User does not own map for createClaim: ${mapId}`);
    this.name = "CreateClaimMapForbiddenError";
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

async function findMapForCreateClaim(
  tx: CreateClaimTx,
  input: { mapId: string; userId: string },
): Promise<{ id: string; userId: string } | null> {
  if (isCreateClaimRepositoryTx(tx)) {
    if (tx.findMapById) {
      return tx.findMapById({ mapId: input.mapId });
    }

    return tx.findOwnedMap(input);
  }

  return (
    await tx
      .select({
        id: maps.id,
        userId: maps.userId,
      })
      .from(maps)
      .where(eq(maps.id, input.mapId))
      .limit(1)
  )[0] ?? null;
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
  repository: CreateClaimRepository | CreateClaimDb = getDb() as unknown as CreateClaimDb,
  dependencies: CreateClaimDependencies = {},
): Promise<CreateClaimResult> {
  const normalized = validateCreateClaimInput(input);
  const createId = dependencies.createId ?? randomUUID;
  const now = dependencies.now ?? (() => new Date());
  const transactionalRepository = repository as CreateClaimTransactional;

  return transactionalRepository.transaction(async (tx) => {
    const commandContext = resolveCommandContext({
      actorUserId: normalized.userId,
      requestId: normalized.requestId,
      now,
      createId,
    });
    const existingEvent = await findExistingMoveEvent(tx, {
      userId: commandContext.actorUserId,
      requestId: commandContext.requestId,
      type: "claim.created",
    });

    if (existingEvent) {
      return {
        claimId: existingEvent.aggregateId,
      };
    }

    const targetMap = await findMapForCreateClaim(tx, {
      mapId: normalized.mapId,
      userId: commandContext.actorUserId,
    });

    if (!targetMap) {
      throw new CreateClaimMapNotFoundError(normalized.mapId);
    }

    if (targetMap.userId !== commandContext.actorUserId) {
      throw new CreateClaimMapForbiddenError(normalized.mapId);
    }

    const claimId = createId();

    if (isCreateClaimRepositoryTx(tx)) {
      const eventPayload = {
        mapId: targetMap.id,
        parentClaimId: normalized.parentClaimId,
        kind: normalized.kind,
        note: normalized.note,
        text: normalized.text,
      };

      await tx.insertClaim({
        id: claimId,
        userId: commandContext.actorUserId,
        mapId: targetMap.id,
        text: normalized.text,
        note: normalized.note,
        parentClaimId: normalized.parentClaimId,
        kind: normalized.kind,
        createdAt: commandContext.now,
        updatedAt: commandContext.now,
      });

      await tx.insertMoveEvent({
        userId: commandContext.actorUserId,
        aggregateType: "claim",
        aggregateId: claimId,
        requestId: commandContext.requestId,
        type: "claim.created",
        payload: eventPayload,
        createdAt: commandContext.now,
      });

      if (tx.insertActivityEvent) {
        await tx.insertActivityEvent({
          userId: commandContext.actorUserId,
          sessionId: null,
          aggregateType: "claim",
          aggregateId: claimId,
          requestId: commandContext.requestId,
          type: "claim.created",
          payload: eventPayload,
          createdAt: commandContext.now,
        });
      }
    } else {
      const payloadJson = {
        mapId: targetMap.id,
        parentClaimId: normalized.parentClaimId,
        kind: normalized.kind,
        note: normalized.note,
        text: normalized.text,
      };

      await tx.execute(sql`
        insert into claims (id, map_id, user_id, body, confidence_bps, created_at, updated_at)
        values (
          ${claimId},
          ${targetMap.id},
          ${commandContext.actorUserId},
          ${normalized.text},
          ${0},
          ${commandContext.now.toISOString()},
          ${commandContext.now.toISOString()}
        )
      `);

      await tx.insert(movesEvents).values({
        userId: commandContext.actorUserId,
        aggregateType: "claim",
        aggregateId: claimId,
        requestId: commandContext.requestId,
        type: "claim.created",
        payloadJson,
        createdAt: commandContext.now,
      });

      await tx.execute(sql`
        insert into activity_events (
          user_id,
          session_id,
          aggregate_type,
          aggregate_id,
          type,
          payload_json,
          request_id,
          created_at
        )
        values (
          ${commandContext.actorUserId},
          ${null},
          ${"claim"},
          ${claimId},
          ${"claim.created"},
          ${JSON.stringify(payloadJson)}::jsonb,
          ${commandContext.requestId},
          ${commandContext.now.toISOString()}
        )
      `);
    }

    return {
      claimId,
    };
  });
}
