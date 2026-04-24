import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.ts";
import { claims, maps, movesEvents, workspaceContexts } from "../db/schema.ts";
import { resolveCommandContext } from "./command-context.ts";

export const WORKSPACE_SELECTION_MODES = ["Brain", "Challenge", "Learn"] as const;

export type WorkspaceSelectionMode = (typeof WORKSPACE_SELECTION_MODES)[number];

export type SetWorkspaceSelectionInput = {
  userId: string;
  mode: WorkspaceSelectionMode;
  mapId: string;
  claimId?: string | null;
  requestId?: string | null;
};

export type WorkspaceContextRecord = {
  userId: string;
  mode: WorkspaceSelectionMode;
  mapId: string;
  claimId: string | null;
  updatedAt: Date;
};

export type WorkspaceSelectionChangedEventRecord = {
  userId: string;
  aggregateId: string;
  requestId: string;
  type: "workspace.selection.changed";
  payload: {
    mode: WorkspaceSelectionMode;
    mapId: string;
    claimId: string | null;
  };
  createdAt: Date;
};

export type SetWorkspaceSelectionRepositoryTx = {
  findMapById?(input: { mapId: string }): Promise<{ id: string; userId: string } | null>;
  findOwnedMap(input: { mapId: string; userId: string }): Promise<{ id: string; userId: string } | null>;
  findClaimById?(input: { claimId: string }): Promise<{ id: string; mapId: string; userId: string } | null>;
  findOwnedClaim(input: { claimId: string; mapId: string; userId: string }): Promise<{ id: string } | null>;
  getWorkspaceContext(input: { userId: string }): Promise<WorkspaceContextRecord | null>;
  upsertWorkspaceContext(record: WorkspaceContextRecord): Promise<void>;
  insertMoveEvent(event: WorkspaceSelectionChangedEventRecord): Promise<void>;
};

export type SetWorkspaceSelectionRepository = {
  transaction<T>(callback: (tx: SetWorkspaceSelectionRepositoryTx) => Promise<T>): Promise<T>;
};

type WorkspaceContextDbRow = {
  mode: string;
  mapId: string;
  claimId: string | null;
};

type SetWorkspaceSelectionDbTx = {
  select: (...args: unknown[]) => {
    from: (table: unknown) => {
      where: (condition: unknown) => {
        limit: (count: number) => Promise<Array<{ id: string; userId?: string; mode?: string; mapId?: string | null; claimId?: string | null }>>;
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

type SetWorkspaceSelectionDb = {
  transaction<T>(callback: (tx: SetWorkspaceSelectionDbTx) => Promise<T>): Promise<T>;
};

export type SetWorkspaceSelectionResult = {
  mode: WorkspaceSelectionMode;
  mapId: string;
  claimId: string | null;
};

export type SetWorkspaceSelectionDependencies = {
  createId?: () => string;
  now?: () => Date;
};

export class SetWorkspaceSelectionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SetWorkspaceSelectionValidationError";
  }
}

export class SetWorkspaceSelectionMapNotFoundError extends Error {
  constructor(mapId: string) {
    super(`Map not found for setWorkspaceSelection: ${mapId}`);
    this.name = "SetWorkspaceSelectionMapNotFoundError";
  }
}

export class SetWorkspaceSelectionMapForbiddenError extends Error {
  constructor(mapId: string) {
    super(`User does not own map for setWorkspaceSelection: ${mapId}`);
    this.name = "SetWorkspaceSelectionMapForbiddenError";
  }
}

export class SetWorkspaceSelectionClaimNotFoundError extends Error {
  constructor(claimId: string) {
    super(`Claim not found for setWorkspaceSelection: ${claimId}`);
    this.name = "SetWorkspaceSelectionClaimNotFoundError";
  }
}

export class SetWorkspaceSelectionClaimForbiddenError extends Error {
  constructor(claimId: string) {
    super(`User does not own claim for setWorkspaceSelection: ${claimId}`);
    this.name = "SetWorkspaceSelectionClaimForbiddenError";
  }
}

type NormalizedSetWorkspaceSelectionInput = {
  userId: string;
  mode: WorkspaceSelectionMode;
  mapId: string;
  claimId: string | null;
  requestId: string | null;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SetWorkspaceSelectionValidationError("setWorkspaceSelection input must be an object.");
  }

  return value as Record<string, unknown>;
}

function readRequiredString(
  value: unknown,
  fieldName: string,
  options: { minLength?: number; maxLength?: number } = {},
): string {
  if (typeof value !== "string") {
    throw new SetWorkspaceSelectionValidationError(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();

  if (options.minLength !== undefined && trimmed.length < options.minLength) {
    throw new SetWorkspaceSelectionValidationError(`${fieldName} must be at least ${options.minLength} character(s).`);
  }

  if (options.maxLength !== undefined && trimmed.length > options.maxLength) {
    throw new SetWorkspaceSelectionValidationError(`${fieldName} must be at most ${options.maxLength} character(s).`);
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
    throw new SetWorkspaceSelectionValidationError(`${fieldName} must be a string when provided.`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (options.maxLength !== undefined && trimmed.length > options.maxLength) {
    throw new SetWorkspaceSelectionValidationError(`${fieldName} must be at most ${options.maxLength} character(s).`);
  }

  return trimmed;
}

function readMode(value: unknown): WorkspaceSelectionMode {
  if (typeof value !== "string") {
    throw new SetWorkspaceSelectionValidationError("mode must be a string.");
  }

  if (!WORKSPACE_SELECTION_MODES.includes(value as WorkspaceSelectionMode)) {
    throw new SetWorkspaceSelectionValidationError(
      `mode must be one of: ${WORKSPACE_SELECTION_MODES.join(", ")}.`,
    );
  }

  return value as WorkspaceSelectionMode;
}

function normalizeModeForStorage(mode: WorkspaceSelectionMode) {
  return mode.toLowerCase() as "brain" | "challenge" | "learn";
}

function isSetWorkspaceSelectionRepositoryTx(value: unknown): value is SetWorkspaceSelectionRepositoryTx {
  return Boolean(
    value &&
      typeof value === "object" &&
      "findOwnedMap" in value &&
      typeof (value as SetWorkspaceSelectionRepositoryTx).findOwnedMap === "function" &&
      "findOwnedClaim" in value &&
      typeof (value as SetWorkspaceSelectionRepositoryTx).findOwnedClaim === "function" &&
      "getWorkspaceContext" in value &&
      typeof (value as SetWorkspaceSelectionRepositoryTx).getWorkspaceContext === "function" &&
      "upsertWorkspaceContext" in value &&
      typeof (value as SetWorkspaceSelectionRepositoryTx).upsertWorkspaceContext === "function" &&
      "insertMoveEvent" in value &&
      typeof (value as SetWorkspaceSelectionRepositoryTx).insertMoveEvent === "function",
  );
}

async function findMapForWorkspaceSelection(
  tx: SetWorkspaceSelectionRepositoryTx | SetWorkspaceSelectionDbTx,
  input: { mapId: string; userId: string },
): Promise<{ id: string; userId: string } | null> {
  if (isSetWorkspaceSelectionRepositoryTx(tx)) {
    if (tx.findMapById) {
      return tx.findMapById({ mapId: input.mapId });
    }

    return tx.findOwnedMap(input);
  }

  return (
    (await tx
      .select({
        id: maps.id,
        userId: maps.userId,
      })
      .from(maps)
      .where(eq(maps.id, input.mapId))
      .limit(1)) as Array<{ id: string; userId: string }>
  )[0] ?? null;
}

async function findClaimForWorkspaceSelection(
  tx: SetWorkspaceSelectionRepositoryTx | SetWorkspaceSelectionDbTx,
  input: { claimId: string; mapId: string; userId: string },
): Promise<{ id: string; mapId: string; userId?: string } | null> {
  if (isSetWorkspaceSelectionRepositoryTx(tx)) {
    if (tx.findClaimById) {
      return tx.findClaimById({ claimId: input.claimId });
    }

    const ownedClaim = await tx.findOwnedClaim(input);
    return ownedClaim
      ? {
          id: ownedClaim.id,
          mapId: input.mapId,
          userId: input.userId,
        }
      : null;
  }

  return (
    (await tx
      .select({
        id: claims.id,
        mapId: claims.mapId,
        userId: claims.userId,
      })
      .from(claims)
      .where(eq(claims.id, input.claimId))
      .limit(1)) as Array<{ id: string; mapId: string; userId: string }>
  )[0] ?? null;
}

export function validateSetWorkspaceSelectionInput(input: unknown): NormalizedSetWorkspaceSelectionInput {
  const object = asObject(input);

  return {
    userId: readRequiredString(object.userId, "userId", { minLength: 1, maxLength: 200 }),
    mode: readMode(object.mode),
    mapId: readRequiredString(object.mapId, "mapId", { minLength: 1, maxLength: 200 }),
    claimId: readOptionalString(object.claimId, "claimId", { maxLength: 200 }),
    requestId: readOptionalString(object.requestId, "requestId", { maxLength: 200 }),
  };
}

export async function setWorkspaceSelection(
  input: unknown,
  repository: SetWorkspaceSelectionRepository | SetWorkspaceSelectionDb = getDb() as unknown as SetWorkspaceSelectionDb,
  dependencies: SetWorkspaceSelectionDependencies = {},
): Promise<SetWorkspaceSelectionResult> {
  const normalized = validateSetWorkspaceSelectionInput(input);
  const createId = dependencies.createId ?? randomUUID;
  const now = dependencies.now ?? (() => new Date());

  return repository.transaction(async (tx) => {
    const commandContext = resolveCommandContext({
      actorUserId: normalized.userId,
      requestId: normalized.requestId,
      now,
      createId,
    });
    const targetMap = await findMapForWorkspaceSelection(tx, {
      mapId: normalized.mapId,
      userId: commandContext.actorUserId,
    });

    if (!targetMap) {
      throw new SetWorkspaceSelectionMapNotFoundError(normalized.mapId);
    }

    if (targetMap.userId !== commandContext.actorUserId) {
      throw new SetWorkspaceSelectionMapForbiddenError(normalized.mapId);
    }

    const existingContext = isSetWorkspaceSelectionRepositoryTx(tx)
      ? await tx.getWorkspaceContext({
          userId: commandContext.actorUserId,
        })
      : (((await tx
          .select({
            mode: workspaceContexts.mode,
            mapId: workspaceContexts.mapId,
            claimId: workspaceContexts.claimId,
          })
          .from(workspaceContexts)
          .where(eq(workspaceContexts.userId, commandContext.actorUserId))
          .limit(1))[0] as WorkspaceContextDbRow | undefined) ?? null);

    const nextClaimId =
      normalized.claimId ?? (existingContext?.mapId === normalized.mapId ? existingContext.claimId : null);

    if (nextClaimId) {
      const targetClaim = await findClaimForWorkspaceSelection(tx, {
        claimId: nextClaimId,
        mapId: targetMap.id,
        userId: commandContext.actorUserId,
      });

      if (!targetClaim) {
        throw new SetWorkspaceSelectionClaimNotFoundError(nextClaimId);
      }

      if (targetClaim.userId && targetClaim.userId !== commandContext.actorUserId) {
        throw new SetWorkspaceSelectionClaimForbiddenError(nextClaimId);
      }

      if (targetClaim.mapId !== targetMap.id) {
        throw new SetWorkspaceSelectionClaimNotFoundError(nextClaimId);
      }
    }

    if (isSetWorkspaceSelectionRepositoryTx(tx)) {
      await tx.upsertWorkspaceContext({
        userId: commandContext.actorUserId,
        mode: normalized.mode,
        mapId: targetMap.id,
        claimId: nextClaimId,
        updatedAt: commandContext.now,
      });

      await tx.insertMoveEvent({
        userId: commandContext.actorUserId,
        aggregateId: createId(),
        requestId: commandContext.requestId,
        type: "workspace.selection.changed",
        payload: {
          mode: normalized.mode,
          mapId: targetMap.id,
          claimId: nextClaimId,
        },
        createdAt: commandContext.now,
      });
    } else {
      if (existingContext) {
        await tx
          .update(workspaceContexts)
          .set({
            mode: normalizeModeForStorage(normalized.mode),
            mapId: targetMap.id,
            claimId: nextClaimId,
            updatedAt: commandContext.now,
          })
          .where(eq(workspaceContexts.userId, commandContext.actorUserId));
      } else {
        await tx.insert(workspaceContexts).values({
          userId: commandContext.actorUserId,
          mode: normalizeModeForStorage(normalized.mode),
          mapId: targetMap.id,
          claimId: nextClaimId,
          updatedAt: commandContext.now,
        });
      }

      await tx.insert(movesEvents).values({
        userId: commandContext.actorUserId,
        aggregateType: "workspace_context",
        aggregateId: createId(),
        requestId: commandContext.requestId,
        type: "workspace.selection.changed",
        payloadJson: {
          mode: normalized.mode,
          mapId: targetMap.id,
          claimId: nextClaimId,
        },
        createdAt: commandContext.now,
      });
    }

    return {
      mode: normalized.mode,
      mapId: targetMap.id,
      claimId: nextClaimId,
    };
  });
}
