import { and, desc, eq } from "drizzle-orm";

import type { DbClient } from "../db/client.ts";
import { getDb } from "../db/client.ts";
import { challengeRounds, claims, maps, workspaceContexts } from "../db/schema.ts";
import { buildShellView, type BuildShellViewRepository, type WorkspaceShellView } from "./build-shell-view.ts";

export type ChallengeClaimView = {
  id: string;
  mapId: string;
  userId: string;
  body: string;
  confidenceBps: number;
  createdAt: string;
  updatedAt: string;
};

export type ChallengeRoundView = {
  id: string;
  mapId: string;
  claimId: string;
  userId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type ChallengeCritiqueStateView = {
  status: "not_requested";
  critiqueId: null;
};

export type WorkspaceChallengeView = {
  shellContext: WorkspaceShellView;
  activeClaim: ChallengeClaimView | null;
  activeChallengeRound: ChallengeRoundView | null;
  critiqueState: ChallengeCritiqueStateView;
};

export type BuildChallengeViewInput = {
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

export async function buildChallengeView(
  input: BuildChallengeViewInput,
  db: DbClient = getDb(),
): Promise<WorkspaceChallengeView> {
  const shellView = await buildShellView(input, createShellRepository(db));
  const critiqueState: ChallengeCritiqueStateView = {
    status: "not_requested",
    critiqueId: null,
  };

  if (!shellView.mapId || !shellView.claimId) {
    return {
      shellContext: shellView,
      activeClaim: null,
      activeChallengeRound: null,
      critiqueState,
    };
  }

  const claimRows = await db
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
    .limit(1);

  const selectedClaimRow = claimRows[0];

  if (!selectedClaimRow) {
    return {
      shellContext: shellView,
      activeClaim: null,
      activeChallengeRound: null,
      critiqueState,
    };
  }

  const roundRows = await db
    .select({
      id: challengeRounds.id,
      mapId: challengeRounds.mapId,
      claimId: challengeRounds.claimId,
      userId: challengeRounds.userId,
      status: challengeRounds.status,
      createdAt: challengeRounds.createdAt,
      updatedAt: challengeRounds.updatedAt,
    })
    .from(challengeRounds)
    .where(
      and(
        eq(challengeRounds.mapId, shellView.mapId),
        eq(challengeRounds.claimId, shellView.claimId),
        eq(challengeRounds.userId, input.userId),
      ),
    )
    .orderBy(desc(challengeRounds.createdAt), desc(challengeRounds.id))
    .limit(1);

  const challengeRoundRow = roundRows[0] ?? null;

  return {
    shellContext: shellView,
    activeClaim: {
      id: selectedClaimRow.id,
      mapId: selectedClaimRow.mapId,
      userId: selectedClaimRow.userId,
      body: selectedClaimRow.body,
      confidenceBps: selectedClaimRow.confidenceBps,
      createdAt: selectedClaimRow.createdAt.toISOString(),
      updatedAt: selectedClaimRow.updatedAt.toISOString(),
    },
    activeChallengeRound: challengeRoundRow
      ? {
          id: challengeRoundRow.id,
          mapId: challengeRoundRow.mapId,
          claimId: challengeRoundRow.claimId,
          userId: challengeRoundRow.userId,
          status: challengeRoundRow.status,
          createdAt: challengeRoundRow.createdAt.toISOString(),
          updatedAt: challengeRoundRow.updatedAt.toISOString(),
        }
      : null,
    critiqueState,
  };
}
