import { and, desc, eq } from "drizzle-orm";

import type { DbClient } from "../db/client.ts";
import { getDb } from "../db/client.ts";
import { challengeCritiques, challengeRounds, claims, maps, movesEvents, workspaceContexts } from "../db/schema.ts";
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

export type ChallengeCritiqueStateView =
  | {
      status: "not_requested";
      critiqueId: null;
    }
  | {
      status: string;
      critiqueId: string;
      critiquePayload?: unknown;
      provider?: string;
      model?: string;
      promptVersion?: string;
    }
  | {
      status: string;
      critiqueId: string;
      body: string;
      critiquePayload?: unknown;
      provider?: string;
      model?: string;
      promptVersion?: string;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseCritiqueBodyPayload(body: string | null): unknown | undefined {
  if (!body || !body.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

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

  if (!shellView.mapId || !shellView.claimId) {
    return {
      shellContext: shellView,
      activeClaim: null,
      activeChallengeRound: null,
      critiqueState: {
        status: "not_requested",
        critiqueId: null,
      },
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
      critiqueState: {
        status: "not_requested",
        critiqueId: null,
      },
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
  const critiqueRows =
    challengeRoundRow === null
      ? []
      : await db
          .select({
            id: challengeCritiques.id,
            status: challengeCritiques.status,
            body: challengeCritiques.body,
            createdAt: challengeCritiques.createdAt,
          })
          .from(challengeCritiques)
          .where(and(eq(challengeCritiques.roundId, challengeRoundRow.id), eq(challengeCritiques.userId, input.userId)))
          .orderBy(desc(challengeCritiques.createdAt), desc(challengeCritiques.id))
          .limit(1);

  const critiqueRow = critiqueRows[0] ?? null;
  const critiqueEventRows =
    critiqueRow === null
      ? []
      : await db
          .select({
            payloadJson: movesEvents.payloadJson,
            createdAt: movesEvents.createdAt,
          })
          .from(movesEvents)
          .where(
            and(
              eq(movesEvents.aggregateType, "challenge_critique"),
              eq(movesEvents.aggregateId, critiqueRow.id),
              eq(movesEvents.userId, input.userId),
              eq(movesEvents.type, "challenge.critique.generated"),
            ),
          )
          .orderBy(desc(movesEvents.createdAt), desc(movesEvents.id))
          .limit(1);

  const critiqueEventPayload = asRecord(critiqueEventRows[0]?.payloadJson);
  const critiquePayload = critiqueEventPayload?.critiqueJson ?? parseCritiqueBodyPayload(critiqueRow?.body ?? null);
  const provider = readOptionalString(critiqueEventPayload?.provider);
  const model = readOptionalString(critiqueEventPayload?.model);
  const promptVersion = readOptionalString(critiqueEventPayload?.promptVersion);
  const critiqueState =
    critiqueRow === null
      ? ({
          status: "not_requested",
          critiqueId: null,
        } satisfies ChallengeCritiqueStateView)
      : {
          status: critiqueRow.status,
          critiqueId: critiqueRow.id,
          ...(critiqueRow.status === "ready" && critiqueRow.body ? { body: critiqueRow.body } : {}),
          ...(critiquePayload !== undefined ? { critiquePayload } : {}),
          ...(provider ? { provider } : {}),
          ...(model ? { model } : {}),
          ...(promptVersion ? { promptVersion } : {}),
        };

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
