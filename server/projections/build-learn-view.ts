import { and, eq } from "drizzle-orm";

import type { DbClient } from "../db/client.ts";
import { getDb } from "../db/client.ts";
import { claims, maps, workspaceContexts } from "../db/schema.ts";
import { buildShellView, type BuildShellViewRepository, type WorkspaceShellView } from "./build-shell-view.ts";

export type LearnPlaceholderView = {
  status: "not_implemented";
  message: "Learn mode coming soon";
};

export type LearnClaimView = {
  id: string;
  mapId: string;
  userId: string;
  body: string;
  confidenceBps: number;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceLearnView = {
  shellContext: WorkspaceShellView;
  workspaceContext: WorkspaceShellView;
  selectedMapId: string | null;
  selectedClaimId: string | null;
  selectedClaim: LearnClaimView | null;
  learnState: LearnPlaceholderView;
  status: LearnPlaceholderView["status"];
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
  const selectedClaimRows =
    shellView.mapId && shellView.claimId
      ? await db
          .select({
            id: claims.id,
            mapId: claims.mapId,
            userId: claims.userId,
            body: claims.body,
            confidenceBps: claims.confidenceBps,
            createdAt: claims.createdAt,
            updatedAt: claims.updatedAt,
          })
          .from(claims)
          .where(and(eq(claims.id, shellView.claimId), eq(claims.mapId, shellView.mapId), eq(claims.userId, input.userId)))
          .limit(1)
      : [];
  const selectedClaimRow = selectedClaimRows[0] ?? null;

  return {
    shellContext: shellView,
    workspaceContext: shellView,
    selectedMapId: shellView.mapId,
    selectedClaimId: shellView.claimId,
    selectedClaim: selectedClaimRow
      ? {
          id: selectedClaimRow.id,
          mapId: selectedClaimRow.mapId,
          userId: selectedClaimRow.userId,
          body: selectedClaimRow.body,
          confidenceBps: selectedClaimRow.confidenceBps,
          createdAt: selectedClaimRow.createdAt.toISOString(),
          updatedAt: selectedClaimRow.updatedAt.toISOString(),
        }
      : null,
    learnState: {
      status: "not_implemented",
      message: "Learn mode coming soon",
    },
    status: "not_implemented",
  };
}
