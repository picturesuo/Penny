import { and, asc, eq } from "drizzle-orm";
import type { DbClient } from "../db/client.ts";
import { getDb } from "../db/client.ts";
import { claims, maps, workspaceContexts } from "../db/schema.ts";
import { buildShellView, type BuildShellViewRepository } from "./build-shell-view.ts";

export type BrainClaimView = {
  id: string;
  mapId: string;
  userId: string;
  body: string;
  confidenceBps: number;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceBrainView = {
  currentContext: {
    mode: string;
    mapId: string | null;
    claimId: string | null;
  };
  workspaceContext: {
    mode: string;
    mapId: string | null;
    claimId: string | null;
  };
  mapSummary: {
    id: string;
    title: string;
    claimCount: number;
  } | null;
  claims: BrainClaimView[];
  selectedClaim: BrainClaimView | null;
  recentEvents: [];
};

export type BuildBrainViewInput = {
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

export async function buildBrainView(
  input: BuildBrainViewInput,
  db: DbClient = getDb(),
): Promise<WorkspaceBrainView> {
  const shellView = await buildShellView(input, createShellRepository(db));
  const mapId = shellView.mapId;
  const selectedClaimId = shellView.claimId;

  if (!mapId) {
    const workspaceContext = {
      mode: shellView.mode,
      mapId: null,
      claimId: null,
    };

    return {
      currentContext: workspaceContext,
      workspaceContext,
      mapSummary: null,
      claims: [],
      selectedClaim: null,
      recentEvents: [],
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
    .where(and(eq(claims.userId, input.userId), eq(claims.mapId, mapId)))
    .orderBy(asc(claims.createdAt), asc(claims.id));

  const normalizedClaims = claimRows.map((claim) => ({
    id: claim.id,
    mapId: claim.mapId,
    userId: claim.userId,
    body: claim.body,
    confidenceBps: claim.confidenceBps,
    createdAt: claim.createdAt.toISOString(),
    updatedAt: claim.updatedAt.toISOString(),
  }));

  const workspaceContext = {
    mode: shellView.mode,
    mapId,
    claimId: selectedClaimId,
  };

  return {
    currentContext: workspaceContext,
    workspaceContext,
    mapSummary: {
      id: mapId,
      title: shellView.breadcrumb.find((item) => item.kind === "map")?.label ?? "",
      claimCount: normalizedClaims.length,
    },
    claims: normalizedClaims,
    selectedClaim: normalizedClaims.find((claim) => claim.id === selectedClaimId) ?? null,
    recentEvents: [],
  };
}
