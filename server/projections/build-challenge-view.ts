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
      status: "pending" | "failed";
      critiqueId: string;
      critiquePayload?: unknown;
      provider?: string;
      model?: string;
      promptVersion?: string;
    }
  | {
      status: "ready";
      critiqueId: string;
      body: string;
      critiquePayload?: unknown;
      provider?: string;
      model?: string;
      promptVersion?: string;
    };

export type ChallengeResponseStateView = {
  status: string;
  responsePayload?: Record<string, unknown>;
};

export type WorkspaceChallengeView = {
  shellContext: WorkspaceShellView;
  currentContext: WorkspaceShellView;
  workspaceContext: WorkspaceShellView;
  activeClaim: ChallengeClaimView | null;
  selectedClaim: ChallengeClaimView | null;
  activeChallengeRound: ChallengeRoundView | null;
  latestChallengeRound: ChallengeRoundView | null;
  critiqueState: ChallengeCritiqueStateView;
  critiqueStatus: ChallengeCritiqueStateView["status"];
  critiquePayload?: unknown;
  responseState: ChallengeResponseStateView;
  responseStatus: string;
  responsePayload?: Record<string, unknown>;
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

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function parseCritiqueBodyPayload(body: string | null): Record<string, unknown> | undefined {
  if (!body || !body.trim()) {
    return undefined;
  }

  try {
    return asRecord(JSON.parse(body)) ?? undefined;
  } catch {
    return undefined;
  }
}

function parseStoredCritiqueJson(value: unknown): Record<string, unknown> | undefined {
  return asRecord(value) ?? undefined;
}

function buildMetadataPayload(input: {
  provider: string | null;
  model: string | null;
  promptVersion: string | null;
}): Record<string, unknown> | undefined {
  const metadata: Record<string, unknown> = {};

  if (input.provider) {
    metadata.provider = input.provider;
  }

  if (input.model) {
    metadata.model = input.model;
  }

  if (input.promptVersion) {
    metadata.promptVersion = input.promptVersion;
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function buildCritiquePayload(
  eventPayload: Record<string, unknown> | null,
  parsedStoredBodyPayload: Record<string, unknown> | undefined,
  provider: string | null,
  model: string | null,
  promptVersion: string | null,
): Record<string, unknown> | undefined {
  const critiqueJson = asRecord(eventPayload?.critiqueJson);

  if (critiqueJson) {
    const payload: Record<string, unknown> = {
      critique: critiqueJson,
    };
    const metadata = buildMetadataPayload({ provider, model, promptVersion });

    if (metadata) {
      payload.metadata = metadata;
    }

    return payload;
  }

  return parsedStoredBodyPayload;
}

function formatListSection(title: string, items: string[]): string | null {
  if (!items.length) {
    return null;
  }

  return `${title}:\n- ${items.join("\n- ")}`;
}

function formatCritiqueBodyFromPayload(payload: Record<string, unknown> | undefined): string | null {
  const critique = asRecord(payload?.critique) ?? payload;

  if (!critique) {
    return null;
  }

  const directBody = readOptionalString(critique.body);

  if (directBody) {
    return directBody;
  }

  const sections = [
    readOptionalString(critique.conciseCritiqueSummary) ? `Main challenge: ${readOptionalString(critique.conciseCritiqueSummary)}` : null,
    readOptionalString(critique.strongestCounterargument)
      ? `Strongest counterargument: ${readOptionalString(critique.strongestCounterargument)}`
      : null,
    formatListSection("Assumptions", readStringArray(critique.assumptions)),
    formatListSection("Likely failure modes", readStringArray(critique.likelyFailureModes)),
    formatListSection("Follow-up questions", readStringArray(critique.followUpQuestions)),
    typeof critique.suggestedConfidenceDelta === "number"
      ? `Suggested confidence delta: ${critique.suggestedConfidenceDelta}`
      : null,
    readOptionalString(critique.uncertaintyNote) ? `Uncertainty note: ${readOptionalString(critique.uncertaintyNote)}` : null,
  ];

  const body = sections.filter((section): section is string => Boolean(section)).join("\n\n");
  return body || null;
}

function normalizeCritiqueStatus(status: string | null | undefined): "pending" | "ready" | "failed" {
  if (status === "ready" || status === "failed") {
    return status;
  }

  return "pending";
}

function buildResponseState(payload: Record<string, unknown> | null, roundStatus?: string | null): ChallengeResponseStateView {
  if (!payload) {
    return {
      status: roundStatus === "responded" ? "responded" : "not_recorded",
    };
  }

  return {
    status: readOptionalString(payload.status) ?? "recorded",
    responsePayload: payload,
  };
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
    const responseState = buildResponseState(null);

    return {
      shellContext: shellView,
      currentContext: shellView,
      workspaceContext: shellView,
      activeClaim: null,
      selectedClaim: null,
      activeChallengeRound: null,
      latestChallengeRound: null,
      critiqueState: {
        status: "not_requested",
        critiqueId: null,
      },
      critiqueStatus: "not_requested",
      responseState,
      responseStatus: responseState.status,
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
    const responseState = buildResponseState(null);

    return {
      shellContext: shellView,
      currentContext: shellView,
      workspaceContext: shellView,
      activeClaim: null,
      selectedClaim: null,
      activeChallengeRound: null,
      latestChallengeRound: null,
      critiqueState: {
        status: "not_requested",
        critiqueId: null,
      },
      critiqueStatus: "not_requested",
      responseState,
      responseStatus: responseState.status,
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
            critiqueJson: challengeCritiques.critiqueJson,
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
  const responseEventRows =
    challengeRoundRow === null
      ? []
      : await db
          .select({
            payloadJson: movesEvents.payloadJson,
            createdAt: movesEvents.createdAt,
          })
          .from(movesEvents)
          .where(
            and(
              eq(movesEvents.aggregateType, "challenge_round"),
              eq(movesEvents.aggregateId, challengeRoundRow.id),
              eq(movesEvents.userId, input.userId),
              eq(movesEvents.type, "challenge.response.recorded"),
            ),
          )
          .orderBy(desc(movesEvents.createdAt), desc(movesEvents.id))
          .limit(1);
  const responsePayload = asRecord(responseEventRows[0]?.payloadJson);
  const responseState = buildResponseState(responsePayload, challengeRoundRow?.status);
  const storedCritiqueJson = parseStoredCritiqueJson(critiqueRow?.critiqueJson);
  const parsedStoredBodyPayload = parseCritiqueBodyPayload(critiqueRow?.body ?? null);
  const eventBody = readOptionalString(critiqueEventPayload?.body);
  const parsedEventBodyPayload = parseCritiqueBodyPayload(eventBody);
  const parsedBodyPayload = storedCritiqueJson ?? parsedStoredBodyPayload ?? parsedEventBodyPayload;
  const parsedBodyMetadata = asRecord(parsedBodyPayload?.metadata);
  const provider = readOptionalString(critiqueEventPayload?.provider) ?? readOptionalString(parsedBodyMetadata?.provider);
  const model = readOptionalString(critiqueEventPayload?.model) ?? readOptionalString(parsedBodyMetadata?.model);
  const promptVersion =
    readOptionalString(critiqueEventPayload?.promptVersion) ?? readOptionalString(parsedBodyMetadata?.promptVersion);
  const critiquePayload = buildCritiquePayload(critiqueEventPayload, parsedBodyPayload, provider, model, promptVersion);
  const critiqueBody =
    (critiqueRow?.body && !parsedStoredBodyPayload ? readOptionalString(critiqueRow.body) : null) ??
    (eventBody && !parsedEventBodyPayload ? eventBody : null) ??
    formatCritiqueBodyFromPayload(critiquePayload);
  let critiqueState: ChallengeCritiqueStateView;

  if (critiqueRow === null) {
    critiqueState = {
      status: "not_requested",
      critiqueId: null,
    };
  } else {
    const normalizedStatus = normalizeCritiqueStatus(critiqueRow.status);

    if (normalizedStatus === "ready" && critiqueBody) {
      critiqueState = {
        status: "ready",
        critiqueId: critiqueRow.id,
        body: critiqueBody,
        ...(critiquePayload !== undefined ? { critiquePayload } : {}),
        ...(provider ? { provider } : {}),
        ...(model ? { model } : {}),
        ...(promptVersion ? { promptVersion } : {}),
      };
    } else {
      critiqueState = {
        status: normalizedStatus,
        critiqueId: critiqueRow.id,
        ...(critiquePayload !== undefined ? { critiquePayload } : {}),
        ...(provider ? { provider } : {}),
        ...(model ? { model } : {}),
        ...(promptVersion ? { promptVersion } : {}),
      };
    }
  }

  const activeClaim = {
    id: selectedClaimRow.id,
    mapId: selectedClaimRow.mapId,
    userId: selectedClaimRow.userId,
    body: selectedClaimRow.body,
    confidenceBps: selectedClaimRow.confidenceBps,
    createdAt: selectedClaimRow.createdAt.toISOString(),
    updatedAt: selectedClaimRow.updatedAt.toISOString(),
  };
  const activeChallengeRound = challengeRoundRow
    ? {
        id: challengeRoundRow.id,
        mapId: challengeRoundRow.mapId,
        claimId: challengeRoundRow.claimId,
        userId: challengeRoundRow.userId,
        status: challengeRoundRow.status,
        createdAt: challengeRoundRow.createdAt.toISOString(),
        updatedAt: challengeRoundRow.updatedAt.toISOString(),
      }
    : null;

  return {
    shellContext: shellView,
    currentContext: shellView,
    workspaceContext: shellView,
    activeClaim,
    selectedClaim: activeClaim,
    activeChallengeRound,
    latestChallengeRound: activeChallengeRound,
    critiqueState,
    critiqueStatus: critiqueState.status,
    ...(critiquePayload !== undefined ? { critiquePayload } : {}),
    responseState,
    responseStatus: responseState.status,
    ...(responsePayload !== null ? { responsePayload } : {}),
  };
}
