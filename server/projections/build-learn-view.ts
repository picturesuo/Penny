import { and, eq } from "drizzle-orm";

import type { DbClient } from "../db/client.ts";
import { getDb } from "../db/client.ts";
import { claims, maps, workspaceContexts } from "../db/schema.ts";
import { buildShellView, type BuildShellViewRepository, type WorkspaceShellView } from "./build-shell-view.ts";

export type LearnPlaceholderView = {
  status: "not_implemented";
  message: "Learn mode coming soon";
};

export type WorkspaceLearnView = {
  shellContext: WorkspaceShellView;
  selectedMapId: string | null;
  selectedClaimId: string | null;
  learnState: LearnPlaceholderView;
};

export type BuildLearnViewInput = {
  userId: string;
};

function createShellRepository(db: DbClient): BuildShellViewRepository {
  return {
    async getWorkspaceContext(input) {
      const rows = await db
        .select({
          mode: workspaceContexts.mode,
          mapId: workspaceContexts.mapId,
          claimId: workspaceContexts.claimId,
        })
        .from(workspaceContexts)
        .where(eq(workspaceContexts.userId, input.userId))
        .limit(1);

      return rows[0] ?? null;
    },
    async findOwnedMap(input) {
      const rows = await db
        .select({
          id: maps.id,
          title: maps.title,
        })
        .from(maps)
        .where(and(eq(maps.id, input.mapId), eq(maps.userId, input.userId)))
        .limit(1);

      return rows[0] ?? null;
    },
    async findOwnedClaim(input) {
      const rows = await db
        .select({
          id: claims.id,
          body: claims.body,
        })
        .from(claims)
        .where(and(eq(claims.id, input.claimId), eq(claims.mapId, input.mapId), eq(claims.userId, input.userId)))
        .limit(1);

      return rows[0] ?? null;
    },
  };
}

export async function buildLearnView(
  input: BuildLearnViewInput,
  db: DbClient = getDb(),
): Promise<WorkspaceLearnView> {
  const shellView = await buildShellView(input, createShellRepository(db));

  return {
    shellContext: shellView,
    selectedMapId: shellView.mapId,
    selectedClaimId: shellView.claimId,
    learnState: {
      status: "not_implemented",
      message: "Learn mode coming soon",
    },
  };
}
