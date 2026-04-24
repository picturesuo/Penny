import { and, eq } from "drizzle-orm";
import type { DbClient } from "../db/client.ts";
import { getDb } from "../db/client.ts";
import { claims, maps, workspaceContexts, type workspaceMode } from "../db/schema.ts";

type WorkspaceMode = typeof workspaceMode.enumValues[number];

export type WorkspaceShellView = {
  workspaceContext: {
    mode: WorkspaceMode;
    mapId: string | null;
    claimId: string | null;
  };
};

export type BuildShellViewInput = {
  userId: string;
};

const DEFAULT_WORKSPACE_MODE: WorkspaceMode = "brain";

export async function buildShellView(
  input: BuildShellViewInput,
  db: DbClient = getDb(),
): Promise<WorkspaceShellView> {
  const contexts = await db
    .select({
      mode: workspaceContexts.mode,
      mapId: workspaceContexts.mapId,
      claimId: workspaceContexts.claimId,
    })
    .from(workspaceContexts)
    .where(eq(workspaceContexts.userId, input.userId))
    .limit(1);

  const context = contexts[0];

  if (!context) {
    return {
      workspaceContext: {
        mode: DEFAULT_WORKSPACE_MODE,
        mapId: null,
        claimId: null,
      },
    };
  }

  let mapId: string | null = null;
  let claimId: string | null = null;

  if (context.mapId) {
    const ownedMaps = await db
      .select({ id: maps.id })
      .from(maps)
      .where(and(eq(maps.id, context.mapId), eq(maps.userId, input.userId)))
      .limit(1);

    if (ownedMaps[0]) {
      mapId = ownedMaps[0].id;
    }
  }

  if (context.claimId && mapId) {
    const ownedClaims = await db
      .select({ id: claims.id })
      .from(claims)
      .where(and(eq(claims.id, context.claimId), eq(claims.mapId, mapId), eq(claims.userId, input.userId)))
      .limit(1);

    if (ownedClaims[0]) {
      claimId = ownedClaims[0].id;
    }
  }

  return {
    workspaceContext: {
      mode: context.mode,
      mapId,
      claimId,
    },
  };
}
