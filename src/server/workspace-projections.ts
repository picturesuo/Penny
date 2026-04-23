import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDrizzleDb } from "@/db/drizzle";
import {
  challengeCritiques,
  challengeRounds,
  claims,
  maps,
  movesEvents,
  workspaceContexts,
} from "@/db/schema";

const WorkspaceProjectionModeSchema = z.enum(["brain", "challenge", "learn"]);
const WorkspaceProjectionInputSchema = z.object({
  userId: z.string().uuid("Invalid UUID."),
  workspaceContextId: z.string().uuid("Invalid UUID.").nullable().optional().default(null),
  contextKey: z.string().trim().min(1).max(160).nullable().optional().default(null),
  mapId: z.string().uuid("Invalid UUID.").nullable().optional().default(null),
  mode: WorkspaceProjectionModeSchema.nullable().optional().default(null),
});

type WorkspaceProjectionMode = z.infer<typeof WorkspaceProjectionModeSchema>;
type WorkspaceProjectionInput = z.input<typeof WorkspaceProjectionInputSchema>;
type ParsedWorkspaceProjectionInput = z.infer<typeof WorkspaceProjectionInputSchema>;

type WorkspaceContextRecord = typeof workspaceContexts.$inferSelect;
type MapRecord = typeof maps.$inferSelect;
type ClaimRecord = typeof claims.$inferSelect;
type ChallengeRoundRecord = typeof challengeRounds.$inferSelect;
type ChallengeCritiqueRecord = typeof challengeCritiques.$inferSelect;
type MoveEventRecord = typeof movesEvents.$inferSelect;

type MapSummary = {
  id: string;
  title: string;
  rawThought: string;
  status: string;
  claimCount: number;
  updatedAt: string;
};

type ClaimSummary = {
  id: string;
  text: string;
  note: string | null;
  kind: string;
  status: string;
  confidence: number;
  lastChallengedAt: string | null;
  updatedAt: string;
};

type EventSummary = {
  id: string;
  type: MoveEventRecord["type"];
  label: string;
  createdAt: string;
  claimId: string | null;
};

type ShellSelection = {
  contextId: string | null;
  contextKey: string;
  mode: WorkspaceProjectionMode;
  mapId: string | null;
  claimId: string | null;
};

export type ShellView = {
  breadcrumb: string[];
  selection: ShellSelection;
  selectedMapSummary: MapSummary | null;
};

export type WorkspaceShellView = ShellView;

export type BrainView = {
  shell: ShellView;
  claimList: ClaimSummary[];
  selectedClaim: ClaimSummary | null;
  recentActivity: EventSummary[];
};

export type ChallengeView = {
  shell: ShellView;
  activeClaim: ClaimSummary | null;
  currentRound: {
    id: string;
    roundNumber: number;
    priorRoundId: string | null;
    responsePath: "defend" | "revise" | "absorb" | null;
    userResponse: string | null;
    confidenceAtRoundStart: number;
    confidenceAtRoundEnd: number | null;
    confidenceDelta: number | null;
    followUpPrompt: string | null;
    startedAt: string;
    closedAt: string | null;
  } | null;
  critique:
    | {
        status: "pending";
        roundId: string;
      }
    | {
        status: "ready";
        roundId: string;
        provider: string;
        model: string;
        promptVersion: string;
        headline: string;
        critiqueText: string;
        critiqueLens: string;
        failureTypes: string[];
        dependencyRisks: string[];
        whyNow: string;
        generatedAt: string;
      }
    | null;
  priorRound: {
    id: string;
    roundNumber: number;
    responsePath: string | null;
    userResponse: string | null;
    confidenceAtRoundEnd: number | null;
    confidenceDelta: number | null;
    closedAt: string | null;
  } | null;
};

export type LearnView = {
  shell: ShellView;
  phase: "not_ready";
  message: string;
};

type ResolvedWorkspaceState = {
  parsed: ParsedWorkspaceProjectionInput;
  contextRecord: WorkspaceContextRecord | null;
  mode: WorkspaceProjectionMode;
  mapRecord: MapRecord | null;
  claimRecords: ClaimRecord[];
  selectedClaim: ClaimRecord | null;
  roundRecords: ChallengeRoundRecord[];
  critiqueByRoundId: Map<string, ChallengeCritiqueRecord>;
  eventRecords: MoveEventRecord[];
};

function toIsoString(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function buildProjectionBreadcrumb(mode: WorkspaceProjectionMode): string[] {
  const base = ["Work", "Market Thesis", "Distribution Claim"];
  return mode === "learn" ? [...base, "Network Effects"] : base;
}

function summarizeMap(record: MapRecord | null): MapSummary | null {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    title: record.title,
    rawThought: record.rawThought,
    status: record.status,
    claimCount: record.claimCount,
    updatedAt: record.updatedAt.toISOString(),
  };
}

function summarizeClaim(record: ClaimRecord | null): ClaimSummary | null {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    text: record.text,
    note: record.note,
    kind: record.kind,
    status: record.status,
    confidence: record.confidence,
    lastChallengedAt: toIsoString(record.lastChallengedAt),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function summarizeEvent(record: MoveEventRecord): EventSummary {
  const labelMap: Partial<Record<MoveEventRecord["type"], string>> = {
    "map.created": "Map created",
    "claim.created": "Claim created",
    "claim.updated": "Claim updated",
    "claim.confidence.changed": "Confidence changed",
    "challenge.round.started": "Challenge round started",
    "challenge.critique.requested": "Challenge critique requested",
    "challenge.critique.generated": "Challenge critique generated",
    "challenge.response.recorded": "Challenge response recorded",
    "workspace.selection.changed": "Workspace selection changed",
  };

  return {
    id: record.id,
    type: record.type,
    label: labelMap[record.type] ?? record.type,
    createdAt: record.createdAt.toISOString(),
    claimId: record.claimId,
  };
}

async function selectOne<T>(promise: Promise<T[]>): Promise<T | null> {
  const rows = await promise;
  return rows[0] ?? null;
}

async function resolvePersistedWorkspaceContext(
  parsed: ParsedWorkspaceProjectionInput,
): Promise<WorkspaceContextRecord | null> {
  const db = getDrizzleDb();

  if (parsed.workspaceContextId) {
    return selectOne(
      db
        .select()
        .from(workspaceContexts)
        .where(and(eq(workspaceContexts.id, parsed.workspaceContextId), eq(workspaceContexts.userId, parsed.userId)))
        .limit(1),
    );
  }

  if (parsed.contextKey) {
    return selectOne(
      db
        .select()
        .from(workspaceContexts)
        .where(and(eq(workspaceContexts.contextKey, parsed.contextKey), eq(workspaceContexts.userId, parsed.userId)))
        .limit(1),
    );
  }

  if (parsed.mapId) {
    return selectOne(
      db
        .select()
        .from(workspaceContexts)
        .where(and(eq(workspaceContexts.mapId, parsed.mapId), eq(workspaceContexts.userId, parsed.userId)))
        .limit(1),
    );
  }

  return selectOne(
    db
      .select()
      .from(workspaceContexts)
      .where(eq(workspaceContexts.userId, parsed.userId))
      .orderBy(desc(workspaceContexts.lastAccessedAt))
      .limit(1),
  );
}

async function resolveMapRecord(
  parsed: ParsedWorkspaceProjectionInput,
  contextRecord: WorkspaceContextRecord | null,
): Promise<MapRecord | null> {
  const db = getDrizzleDb();
  const candidateMapId = contextRecord?.mapId ?? parsed.mapId ?? null;

  if (candidateMapId) {
    return selectOne(
      db
        .select()
        .from(maps)
        .where(and(eq(maps.id, candidateMapId), eq(maps.userId, parsed.userId)))
        .limit(1),
    );
  }

  return selectOne(
    db
      .select()
      .from(maps)
      .where(eq(maps.userId, parsed.userId))
      .orderBy(desc(maps.updatedAt))
      .limit(1),
  );
}

function resolveProjectionMode(
  parsed: ParsedWorkspaceProjectionInput,
  contextRecord: WorkspaceContextRecord | null,
): WorkspaceProjectionMode {
  return WorkspaceProjectionModeSchema.parse(parsed.mode ?? contextRecord?.mode ?? "brain");
}

async function resolveWorkspaceState(input: WorkspaceProjectionInput): Promise<ResolvedWorkspaceState> {
  const parsed = WorkspaceProjectionInputSchema.parse(input);
  const db = getDrizzleDb();
  const contextRecord = await resolvePersistedWorkspaceContext(parsed);
  const mode = resolveProjectionMode(parsed, contextRecord);
  const mapRecord = await resolveMapRecord(parsed, contextRecord);

  const claimRecords = mapRecord
    ? await db
        .select()
        .from(claims)
        .where(and(eq(claims.userId, parsed.userId), eq(claims.mapId, mapRecord.id)))
        .orderBy(desc(claims.updatedAt))
        .limit(24)
    : [];

  const selectedClaimId = contextRecord?.selectedClaimId ?? null;
  const selectedClaim =
    claimRecords.find((record) => record.id === selectedClaimId) ??
    (selectedClaimId
      ? await selectOne(
          db
            .select()
            .from(claims)
            .where(and(eq(claims.id, selectedClaimId), eq(claims.userId, parsed.userId)))
            .limit(1),
        )
      : null) ??
    claimRecords[0] ??
    null;

  const roundRecords =
    selectedClaim != null
      ? await db
          .select()
          .from(challengeRounds)
          .where(and(eq(challengeRounds.userId, parsed.userId), eq(challengeRounds.claimId, selectedClaim.id)))
          .orderBy(desc(challengeRounds.roundNumber))
          .limit(8)
      : [];

  const critiqueRecords =
    roundRecords.length > 0
      ? await db
          .select()
          .from(challengeCritiques)
          .where(
            and(
              eq(challengeCritiques.userId, parsed.userId),
              inArray(
                challengeCritiques.roundId,
                roundRecords.map((record) => record.id),
              ),
            ),
          )
          .orderBy(desc(challengeCritiques.createdAt))
      : [];

  const eventRecords =
    mapRecord != null
      ? await db
          .select()
          .from(movesEvents)
          .where(and(eq(movesEvents.userId, parsed.userId), eq(movesEvents.mapId, mapRecord.id)))
          .orderBy(desc(movesEvents.createdAt))
          .limit(12)
      : [];

  return {
    parsed,
    contextRecord,
    mode,
    mapRecord,
    claimRecords,
    selectedClaim,
    roundRecords,
    critiqueByRoundId: new Map(critiqueRecords.map((record) => [record.roundId, record])),
    eventRecords,
  };
}

function buildShellFromState(state: ResolvedWorkspaceState): ShellView {
  const selectedMapSummary = summarizeMap(state.mapRecord);
  const selectedClaim = summarizeClaim(state.selectedClaim);

  return {
    breadcrumb: buildProjectionBreadcrumb(state.mode),
    selection: {
      contextId: state.contextRecord?.id ?? null,
      contextKey:
        state.contextRecord?.contextKey ??
        `workspace:${state.parsed.userId}:${state.mapRecord?.id ?? "none"}:${state.mode}`,
      mode: state.mode,
      mapId: selectedMapSummary?.id ?? state.parsed.mapId ?? null,
      claimId: selectedClaim?.id ?? null,
    },
    selectedMapSummary,
  };
}

function buildPriorRoundState(
  roundRecords: ChallengeRoundRecord[],
  currentRound: ChallengeRoundRecord | null,
): ChallengeView["priorRound"] {
  if (!currentRound) {
    return null;
  }

  const priorRound =
    roundRecords.find((record) => record.id === currentRound.priorRoundId) ??
    roundRecords.find((record) => record.id !== currentRound.id) ??
    null;

  if (!priorRound) {
    return null;
  }

  return {
    id: priorRound.id,
    roundNumber: priorRound.roundNumber,
    responsePath: priorRound.responsePath,
    userResponse: priorRound.userResponse,
    confidenceAtRoundEnd: priorRound.confidenceAtRoundEnd,
    confidenceDelta: priorRound.confidenceDelta,
    closedAt: toIsoString(priorRound.closedAt),
  };
}

export async function buildShellView(input: WorkspaceProjectionInput): Promise<ShellView> {
  const state = await resolveWorkspaceState(input);
  return buildShellFromState(state);
}

export async function buildBrainView(input: WorkspaceProjectionInput): Promise<BrainView> {
  const state = await resolveWorkspaceState({
    ...input,
    mode: input.mode ?? "brain",
  });

  return {
    shell: buildShellFromState(state),
    claimList: state.claimRecords.map((record) => summarizeClaim(record)!).filter(Boolean),
    selectedClaim: summarizeClaim(state.selectedClaim),
    recentActivity: state.eventRecords.map(summarizeEvent),
  };
}

export async function buildChallengeView(input: WorkspaceProjectionInput): Promise<ChallengeView> {
  const state = await resolveWorkspaceState({
    ...input,
    mode: input.mode ?? "challenge",
  });
  const currentRound = state.roundRecords[0] ?? null;
  const critiqueRecord = currentRound ? state.critiqueByRoundId.get(currentRound.id) ?? null : null;

  return {
    shell: buildShellFromState(state),
    activeClaim: summarizeClaim(state.selectedClaim),
    currentRound: currentRound
      ? {
          id: currentRound.id,
          roundNumber: currentRound.roundNumber,
          priorRoundId: currentRound.priorRoundId,
          responsePath: (currentRound.responsePath as "defend" | "revise" | "absorb" | null) ?? null,
          userResponse: currentRound.userResponse,
          confidenceAtRoundStart: currentRound.confidenceAtRoundStart,
          confidenceAtRoundEnd: currentRound.confidenceAtRoundEnd,
          confidenceDelta: currentRound.confidenceDelta,
          followUpPrompt: currentRound.followUpPrompt,
          startedAt: currentRound.startedAt.toISOString(),
          closedAt: toIsoString(currentRound.closedAt),
        }
      : null,
    critique: currentRound
      ? critiqueRecord
        ? {
            status: "ready",
            roundId: critiqueRecord.roundId,
            provider: critiqueRecord.provider,
            model: critiqueRecord.model,
            promptVersion: critiqueRecord.promptVersion,
            headline: critiqueRecord.headline,
            critiqueText: critiqueRecord.critiqueText,
            critiqueLens: critiqueRecord.critiqueLens,
            failureTypes: critiqueRecord.failureTypes,
            dependencyRisks: critiqueRecord.dependencyRisks,
            whyNow: critiqueRecord.whyNow,
            generatedAt: critiqueRecord.createdAt.toISOString(),
          }
        : {
            status: "pending",
            roundId: currentRound.id,
          }
      : null,
    priorRound: buildPriorRoundState(state.roundRecords, currentRound),
  };
}

export async function buildLearnView(input: WorkspaceProjectionInput): Promise<LearnView> {
  const state = await resolveWorkspaceState({
    ...input,
    mode: "learn",
  });

  return {
    shell: buildShellFromState(state),
    phase: "not_ready",
    message: "Learn mode stays placeholder-only in Phase 1 while challenge critique, events, and shell state are hardened.",
  };
}

export const buildWorkspaceShellView = buildShellView;

export const workspaceProjectionSchemas = {
  input: WorkspaceProjectionInputSchema,
  mode: WorkspaceProjectionModeSchema,
};
