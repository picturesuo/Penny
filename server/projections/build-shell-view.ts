import { and, eq } from "drizzle-orm";

import type { DbClient } from "../db/client.ts";
import { getDb } from "../db/client.ts";
import { claims, maps, workspaceContexts, workspaceMode } from "../db/schema.ts";

export type WorkspaceMode = (typeof workspaceMode.enumValues)[number];

export type ShellBreadcrumbItem = {
  kind: "map" | "claim";
  id: string;
  label: string;
};

export type WorkspaceShellView = {
  mode: WorkspaceMode;
  mapId: string | null;
  claimId: string | null;
  breadcrumbItems: ShellBreadcrumbItem[];
};

export type BuildShellViewInput = {
  userId: string;
};

type WorkspaceContextRow = {
  mode: string;
  mapId: string | null;
  claimId: string | null;
};

type MapRow = {
  id: string;
  title: string;
};

type ClaimRow = {
  id: string;
  body: string;
};

export type BuildShellViewRepository = {
  getWorkspaceContext(input: { userId: string }): Promise<WorkspaceContextRow | null>;
  findOwnedMap(input: { mapId: string; userId: string }): Promise<MapRow | null>;
  findOwnedClaim(input: { claimId: string; mapId: string; userId: string }): Promise<ClaimRow | null>;
};

const DEFAULT_WORKSPACE_MODE: WorkspaceMode = "brain";
const WORKSPACE_MODES = new Set<WorkspaceMode>(workspaceMode.enumValues);

function normalizeMode(value: string): WorkspaceMode {
  const normalized = value.trim().toLowerCase();

  if (WORKSPACE_MODES.has(normalized as WorkspaceMode)) {
    return normalized as WorkspaceMode;
  }

  return DEFAULT_WORKSPACE_MODE;
}

function createDbRepository(db: DbClient): BuildShellViewRepository {
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

export async function buildShellView(
  input: BuildShellViewInput,
  repository: BuildShellViewRepository = createDbRepository(getDb()),
): Promise<WorkspaceShellView> {
  const context = await repository.getWorkspaceContext({
    userId: input.userId,
  });

  if (!context) {
    return {
      mode: DEFAULT_WORKSPACE_MODE,
      mapId: null,
      claimId: null,
      breadcrumbItems: [],
    };
  }

  const mode = normalizeMode(context.mode);
  const breadcrumbItems: ShellBreadcrumbItem[] = [];
  let mapId: string | null = null;
  let claimId: string | null = null;

  if (context.mapId) {
    const map = await repository.findOwnedMap({
      mapId: context.mapId,
      userId: input.userId,
    });

    if (map) {
      mapId = map.id;
      breadcrumbItems.push({
        kind: "map",
        id: map.id,
        label: map.title,
      });
    }
  }

  if (context.claimId && mapId) {
    const claim = await repository.findOwnedClaim({
      claimId: context.claimId,
      mapId,
      userId: input.userId,
    });

    if (claim) {
      claimId = claim.id;
      breadcrumbItems.push({
        kind: "claim",
        id: claim.id,
        label: claim.body,
      });
    }
  }

  return {
    mode,
    mapId,
    claimId,
    breadcrumbItems,
  };
}
