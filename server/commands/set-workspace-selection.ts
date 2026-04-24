import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client.ts";
import { claims, maps, movesEvents, workspaceContexts } from "../db/schema.ts";

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
  findOwnedMap(input: { mapId: string; userId: string }): Promise<{ id: string; userId: string } | null>;
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

export class SetWorkspaceSelectionClaimNotFoundError extends Error {
  constructor(claimId: string) {
    super(`Claim not found for setWorkspaceSelection: ${claimId}`);
    this.name = "SetWorkspaceSelectionClaimNotFoundError";
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
  repository: SetWorkspaceSelectionRepository | SetWorkspaceSelectionDb = getDb(),
  dependencies: SetWorkspaceSelectionDependencies = {},
): Promise<SetWorkspaceSelectionResult> {
  const normalized = validateSetWorkspaceSelectionInput(input);
  const createId = dependencies.createId ?? randomUUID;
  const now = dependencies.now ?? (() => new Date());

  return repository.transaction(async (tx) => {
    const ownedMap = isSetWorkspaceSelectionRepositoryTx(tx)
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
      throw new SetWorkspaceSelectionMapNotFoundError(normalized.mapId);
    }

    const existingContext = isSetWorkspaceSelectionRepositoryTx(tx)
      ? await tx.getWorkspaceContext({
          userId: normalized.userId,
        })
      : (((await tx
          .select({
            mode: workspaceContexts.mode,
            mapId: workspaceContexts.mapId,
            claimId: workspaceContexts.claimId,
          })
          .from(workspaceContexts)
          .where(eq(workspaceContexts.userId, normalized.userId))
          .limit(1))[0] as WorkspaceContextDbRow | undefined) ?? null);

    const nextClaimId =
      normalized.claimId ?? (existingContext?.mapId === normalized.mapId ? existingContext.claimId : null);

    if (nextClaimId) {
      const ownedClaim = isSetWorkspaceSelectionRepositoryTx(tx)
        ? await tx.findOwnedClaim({
            claimId: nextClaimId,
            mapId: ownedMap.id,
            userId: normalized.userId,
          })
        : (
            await tx
              .select({
                id: claims.id,
              })
              .from(claims)
              .where(
                and(
                  eq(claims.id, nextClaimId),
                  eq(claims.mapId, ownedMap.id),
                  eq(claims.userId, normalized.userId),
                ),
              )
              .limit(1)
          )[0] ?? null;

      if (!ownedClaim) {
        throw new SetWorkspaceSelectionClaimNotFoundError(nextClaimId);
      }
    }

    const timestamp = now();
    const requestId = normalized.requestId ?? createId();

    if (isSetWorkspaceSelectionRepositoryTx(tx)) {
      await tx.upsertWorkspaceContext({
        userId: normalized.userId,
        mode: normalized.mode,
        mapId: ownedMap.id,
        claimId: nextClaimId,
        updatedAt: timestamp,
      });

      await tx.insertMoveEvent({
        userId: normalized.userId,
        aggregateId: createId(),
        requestId,
        type: "workspace.selection.changed",
        payload: {
          mode: normalized.mode,
          mapId: ownedMap.id,
          claimId: nextClaimId,
        },
        createdAt: timestamp,
      });
    } else {
      if (existingContext) {
        await tx
          .update(workspaceContexts)
          .set({
            mode: normalizeModeForStorage(normalized.mode),
            mapId: ownedMap.id,
            claimId: nextClaimId,
            updatedAt: timestamp,
          })
          .where(eq(workspaceContexts.userId, normalized.userId));
      } else {
        await tx.insert(workspaceContexts).values({
          userId: normalized.userId,
          mode: normalizeModeForStorage(normalized.mode),
          mapId: ownedMap.id,
          claimId: nextClaimId,
          updatedAt: timestamp,
        });
      }

      await tx.insert(movesEvents).values({
        userId: normalized.userId,
        aggregateType: "workspace_context",
        aggregateId: createId(),
        requestId,
        type: "workspace.selection.changed",
        payloadJson: {
          mode: normalized.mode,
          mapId: ownedMap.id,
          claimId: nextClaimId,
        },
        createdAt: timestamp,
      });
    }

    return {
      mode: normalized.mode,
      mapId: ownedMap.id,
      claimId: nextClaimId,
    };
  });
}
