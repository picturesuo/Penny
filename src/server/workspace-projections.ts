import "server-only";

import { and, desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { getDrizzleDb } from "@/db/drizzle";
import {
  claimConceptEdges,
  claimEdges,
  claims,
  concepts,
  dialecticRounds,
  learningPrompts,
  maps,
  movesEvents,
  spheres,
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

type SphereRecord = typeof spheres.$inferSelect;
type MapRecord = typeof maps.$inferSelect;
type ClaimRecord = typeof claims.$inferSelect;
type ClaimEdgeRecord = typeof claimEdges.$inferSelect;
type ConceptRecord = typeof concepts.$inferSelect;
type ClaimConceptEdgeRecord = typeof claimConceptEdges.$inferSelect;
type WorkspaceContextRecord = typeof workspaceContexts.$inferSelect;
type DialecticRoundRecord = typeof dialecticRounds.$inferSelect;
type LearningPromptRecord = typeof learningPrompts.$inferSelect;
type MoveEventRecord = typeof movesEvents.$inferSelect;

type WorkspaceMapSummary = {
  id: string;
  title: string;
  rawThought: string;
  status: string;
  claimCount: number;
  updatedAt: string;
};

type WorkspaceSphereSummary = {
  id: string;
  title: string;
  slug: string;
  colorToken: string | null;
  isActive: boolean;
  isArchived: boolean;
};

type WorkspaceClaimSummary = {
  id: string;
  text: string;
  note: string | null;
  kind: string;
  status: string;
  confidence: number;
  lastChallengedAt: string | null;
  updatedAt: string;
};

type WorkspaceConceptSummary = {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  status: string;
  updatedAt: string;
};

type WorkspaceMiniGraphNode = {
  id: string;
  label: string;
  emphasis: "focus" | "linked" | "related";
};

type WorkspaceMiniGraphEdge = {
  id: string;
  from: string;
  to: string;
  relation: string;
  weight: number | null;
};

type WorkspaceMiniGraph = {
  nodes: WorkspaceMiniGraphNode[];
  edges: WorkspaceMiniGraphEdge[];
};

type WorkspaceEventSummary = {
  id: string;
  type: MoveEventRecord["type"];
  label: string;
  createdAt: string;
  claimId: string | null;
  conceptId: string | null;
};

type WorkspaceModeRailItem = {
  key: WorkspaceProjectionMode;
  label: string;
  accentToken: "brain" | "challenge" | "learn";
  isActive: boolean;
};

type WorkspaceContextView = {
  contextId: string | null;
  contextKey: string;
  persisted: boolean;
  projectionMode: WorkspaceProjectionMode;
  storedMode: WorkspaceProjectionMode | null;
  breadcrumb: string[];
  lastAccessedAt: string | null;
  map: WorkspaceMapSummary | null;
  sphere: WorkspaceSphereSummary | null;
  selection: {
    claim: WorkspaceClaimSummary | null;
    concept: WorkspaceConceptSummary | null;
  };
};

export type WorkspaceShellView = {
  workspace: WorkspaceContextView;
  topBar: {
    breadcrumb: string[];
    title: string;
    subtitle: string | null;
  };
  leftRail: {
    modes: WorkspaceModeRailItem[];
    spheres: WorkspaceSphereSummary[];
  };
};

export type BrainView = {
  workspace: WorkspaceContextView;
  stream: {
    sectionTitle: string;
    continuePrompt: string;
    highlightedClaim: WorkspaceClaimSummary | null;
    recentThoughts: WorkspaceClaimSummary[];
  };
  inspector: {
    claim: WorkspaceClaimSummary;
    confidenceLabel: string;
    keyConnections: WorkspaceMiniGraph;
    dependents: Array<{
      claim: WorkspaceClaimSummary;
      relation: string;
      weight: number;
    }>;
    lastChallenged: string | null;
    miniMap: WorkspaceMiniGraph;
  } | null;
  activity: {
    recentEvents: WorkspaceEventSummary[];
  };
};

export type ChallengeView = {
  workspace: WorkspaceContextView;
  focus: {
    claim: WorkspaceClaimSummary | null;
    counterargument: {
      roundId: string;
      roundNumber: number;
      text: string;
      failureTypes: string[];
      lens: string;
      strength: string;
      voiceLabel: string | null;
    } | null;
  };
  response: {
    activeRound: {
      roundId: string;
      roundNumber: number;
      confidenceAtRoundStart: number;
      confidenceAtRoundEnd: number | null;
      responsePath: "defend" | "revise" | "absorb" | null;
      userResponse: string | null;
      followUpPrompt: string | null;
      concessions: string[];
      defenses: string[];
      dismissals: string[];
    } | null;
    responsePaths: Array<{
      key: "defend" | "revise" | "absorb";
      label: string;
      isSelected: boolean;
      isPrimary: boolean;
    }>;
    recentRounds: Array<{
      roundId: string;
      roundNumber: number;
      responsePath: string | null;
      confidenceDelta: number | null;
      closedAt: string | null;
    }>;
  };
  transparency: {
    critique: Array<{
      label: string;
      value: string;
    }>;
    dependencyCascade: {
      summary: string;
      steps: Array<{
        claim: WorkspaceClaimSummary;
        relation: string;
        weight: number;
      }>;
    } | null;
  };
};

export type LearnView = {
  workspace: WorkspaceContextView;
  conceptNav: Array<WorkspaceConceptSummary & { isSelected: boolean }>;
  teachback: {
    promptId: string | null;
    conceptTitle: string;
    explanation: string;
    promptText: string | null;
    submission: string | null;
    checklist: Array<{
      id: string;
      label: string;
      completed: boolean;
    }>;
    secondaryCta: {
      label: string;
      exampleText: string | null;
    };
  };
  contextPanel: {
    conceptGraph: WorkspaceMiniGraph;
    relatedClaim: WorkspaceClaimSummary | null;
    connectedIdeas: WorkspaceConceptSummary[];
  };
};

type ResolvedWorkspaceState = {
  contextView: WorkspaceContextView;
  mapRecord: MapRecord | null;
  sphereRecords: SphereRecord[];
  selectedClaim: ClaimRecord | null;
  recentClaims: ClaimRecord[];
  selectedClaimEdges: ClaimEdgeRecord[];
  relatedClaimIndex: Map<string, ClaimRecord>;
  selectedConcept: ConceptRecord | null;
  conceptRecords: ConceptRecord[];
  conceptEdgeRecords: ClaimConceptEdgeRecord[];
  roundRecords: DialecticRoundRecord[];
  eventRecords: MoveEventRecord[];
  learningPromptRecords: LearningPromptRecord[];
};

function toIsoString(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function dedupeIds(ids: Array<string | null | undefined>): string[] {
  return Array.from(new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0)));
}

function truncate(text: string, maxLength = 88): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trimEnd()}...`;
}

function buildProjectionBreadcrumb(mode: WorkspaceProjectionMode): string[] {
  const base = ["Work", "Market Thesis", "Distribution Claim"];
  return mode === "learn" ? [...base, "Network Effects"] : base;
}

function summarizeMap(record: MapRecord | null): WorkspaceMapSummary | null {
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

function summarizeSphere(record: SphereRecord | null, activeSphereId: string | null): WorkspaceSphereSummary | null {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    title: record.title,
    slug: record.slug,
    colorToken: record.colorToken,
    isActive: record.id === activeSphereId,
    isArchived: record.isArchived,
  };
}

function summarizeClaim(record: ClaimRecord | null): WorkspaceClaimSummary | null {
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

function summarizeConcept(record: ConceptRecord | null): WorkspaceConceptSummary | null {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    name: record.name,
    description: record.description,
    slug: record.slug,
    status: record.status,
    updatedAt: record.updatedAt.toISOString(),
  };
}

function summarizeEvent(record: MoveEventRecord): WorkspaceEventSummary {
  const labelMap: Record<MoveEventRecord["type"], string> = {
    "map.created": "Map created",
    "claim.created": "Claim created",
    "claim.updated": "Claim updated",
    "claim.confidence.changed": "Confidence changed",
    "challenge.round.started": "Challenge round started",
    "challenge.critique.requested": "Challenge critique requested",
    "challenge.critique.generated": "Challenge critique generated",
    "challenge.response.recorded": "Challenge response recorded",
    "learning.prompt_generated": "Learning prompt generated",
    "teachback.submitted": "Teach-back submitted",
    "concept.created": "Concept created",
    "concept.linked": "Concept linked",
    "workspace.selection.changed": "Workspace selection changed",
  };

  return {
    id: record.id,
    type: record.type,
    label: labelMap[record.type],
    createdAt: record.createdAt.toISOString(),
    claimId: record.claimId,
    conceptId: record.conceptId,
  };
}

function buildModeRail(projectionMode: WorkspaceProjectionMode): WorkspaceModeRailItem[] {
  return [
    { key: "brain", label: "Brain", accentToken: "brain", isActive: projectionMode === "brain" },
    { key: "challenge", label: "Challenge", accentToken: "challenge", isActive: projectionMode === "challenge" },
    { key: "learn", label: "Learn", accentToken: "learn", isActive: projectionMode === "learn" },
  ];
}

function buildMiniClaimGraph(params: {
  selectedClaim: ClaimRecord | null;
  edges: ClaimEdgeRecord[];
  claimIndex: Map<string, ClaimRecord>;
}): WorkspaceMiniGraph {
  const { selectedClaim, edges, claimIndex } = params;

  if (!selectedClaim) {
    return { nodes: [], edges: [] };
  }

  const nodes: WorkspaceMiniGraphNode[] = [
    {
      id: selectedClaim.id,
      label: truncate(selectedClaim.text, 44),
      emphasis: "focus",
    },
  ];
  const graphEdges: WorkspaceMiniGraphEdge[] = [];
  const linkedClaimIds = dedupeIds(
    edges.flatMap((edge) => [edge.fromClaimId === selectedClaim.id ? edge.toClaimId : edge.fromClaimId]),
  ).slice(0, 5);

  for (const claimId of linkedClaimIds) {
    const claim = claimIndex.get(claimId);

    if (!claim) {
      continue;
    }

    nodes.push({
      id: claim.id,
      label: truncate(claim.text, 36),
      emphasis: "linked",
    });
  }

  for (const edge of edges.slice(0, 8)) {
    const fromId = edge.fromClaimId;
    const toId = edge.toClaimId;
    const hasFrom = nodes.some((node) => node.id === fromId);
    const hasTo = nodes.some((node) => node.id === toId);

    if (!hasFrom || !hasTo) {
      continue;
    }

    graphEdges.push({
      id: edge.id,
      from: fromId,
      to: toId,
      relation: edge.edgeType,
      weight: edge.weight,
    });
  }

  return { nodes, edges: graphEdges };
}

function buildMiniConceptGraph(params: {
  selectedConcept: ConceptRecord | null;
  linkedConcepts: ConceptRecord[];
}): WorkspaceMiniGraph {
  const { selectedConcept, linkedConcepts } = params;

  if (!selectedConcept) {
    return { nodes: [], edges: [] };
  }

  const nodes: WorkspaceMiniGraphNode[] = [
    {
      id: selectedConcept.id,
      label: selectedConcept.name,
      emphasis: "focus",
    },
  ];
  const edges: WorkspaceMiniGraphEdge[] = [];

  for (const concept of linkedConcepts.filter((entry) => entry.id !== selectedConcept.id).slice(0, 5)) {
    nodes.push({
      id: concept.id,
      label: concept.name,
      emphasis: "related",
    });
    edges.push({
      id: `${selectedConcept.id}:${concept.id}`,
      from: selectedConcept.id,
      to: concept.id,
      relation: "connected",
      weight: null,
    });
  }

  return { nodes, edges };
}

function buildChallengeResponsePaths(activeRound: DialecticRoundRecord | null) {
  return [
    { key: "defend" as const, label: "Defend", isSelected: activeRound?.responsePath === "defend", isPrimary: activeRound?.responsePath === "defend" },
    { key: "revise" as const, label: "Revise", isSelected: activeRound?.responsePath === "revise", isPrimary: activeRound?.responsePath === "revise" },
    { key: "absorb" as const, label: "Absorb", isSelected: activeRound?.responsePath === "absorb", isPrimary: activeRound?.responsePath === "absorb" },
  ];
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
        .orderBy(desc(workspaceContexts.lastAccessedAt))
        .limit(1),
    );
  }

  if (parsed.mapId) {
    return selectOne(
      db
        .select()
        .from(workspaceContexts)
        .where(and(eq(workspaceContexts.userId, parsed.userId), eq(workspaceContexts.mapId, parsed.mapId)))
        .orderBy(desc(workspaceContexts.lastAccessedAt))
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

async function resolveMapRecord(parsed: ParsedWorkspaceProjectionInput, contextRecord: WorkspaceContextRecord | null): Promise<MapRecord | null> {
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

async function resolveWorkspaceState(input: WorkspaceProjectionInput, projectionMode: WorkspaceProjectionMode): Promise<ResolvedWorkspaceState> {
  const parsed = WorkspaceProjectionInputSchema.parse({
    ...input,
    mode: input.mode ?? projectionMode,
  });
  const db = getDrizzleDb();
  const contextRecord = await resolvePersistedWorkspaceContext(parsed);
  const mapRecord = await resolveMapRecord(parsed, contextRecord);
  const effectiveSphereId = contextRecord?.sphereId ?? mapRecord?.sphereId ?? null;
  const [sphereRecords, recentClaims] = await Promise.all([
    db
      .select()
      .from(spheres)
      .where(eq(spheres.userId, parsed.userId))
      .orderBy(desc(spheres.updatedAt))
      .limit(12),
    mapRecord
      ? db
          .select()
          .from(claims)
          .where(and(eq(claims.userId, parsed.userId), eq(claims.mapId, mapRecord.id)))
          .orderBy(desc(claims.updatedAt))
          .limit(12)
      : Promise.resolve([] as ClaimRecord[]),
  ]);

  const sphereRecord =
    sphereRecords.find((record) => record.id === effectiveSphereId) ??
    (effectiveSphereId
      ? await selectOne(
          db
            .select()
            .from(spheres)
            .where(and(eq(spheres.id, effectiveSphereId), eq(spheres.userId, parsed.userId)))
            .limit(1),
        )
      : null);

  const contextSelectedClaimId = contextRecord?.selectedClaimId ?? null;
  const selectedClaim =
    recentClaims.find((record) => record.id === contextSelectedClaimId) ??
    (contextSelectedClaimId
      ? await selectOne(
          db
            .select()
            .from(claims)
            .where(and(eq(claims.id, contextSelectedClaimId), eq(claims.userId, parsed.userId)))
            .limit(1),
        )
      : null) ??
    recentClaims[0] ??
    null;

  const mapClaimIdRows = mapRecord
    ? await db
        .select({ id: claims.id })
        .from(claims)
        .where(and(eq(claims.userId, parsed.userId), eq(claims.mapId, mapRecord.id)))
    : [];
  const mapClaimIds = mapClaimIdRows.map((record) => record.id);
  const selectedClaimEdges =
    selectedClaim && mapRecord
      ? await db
          .select()
          .from(claimEdges)
          .where(
            and(
              eq(claimEdges.mapId, mapRecord.id),
              or(eq(claimEdges.fromClaimId, selectedClaim.id), eq(claimEdges.toClaimId, selectedClaim.id)),
            ),
          )
          .orderBy(desc(claimEdges.updatedAt))
          .limit(12)
      : [];
  const conceptEdgeRecords =
    mapClaimIds.length > 0
      ? await db
          .select()
          .from(claimConceptEdges)
          .where(inArray(claimConceptEdges.claimId, mapClaimIds))
          .orderBy(desc(claimConceptEdges.updatedAt))
          .limit(24)
      : [];
  const conceptIds = dedupeIds([
    contextRecord?.selectedConceptId ?? null,
    ...conceptEdgeRecords.map((record) => record.conceptId),
  ]);
  const conceptRecords =
    conceptIds.length > 0
      ? await db
          .select()
          .from(concepts)
          .where(and(eq(concepts.userId, parsed.userId), inArray(concepts.id, conceptIds)))
          .orderBy(desc(concepts.updatedAt))
      : [];
  const selectedConcept =
    conceptRecords.find((record) => record.id === contextRecord?.selectedConceptId) ??
    (() => {
      if (!selectedClaim) {
        return null;
      }

      const edge = conceptEdgeRecords.find((record) => record.claimId === selectedClaim.id);
      return edge ? conceptRecords.find((record) => record.id === edge.conceptId) ?? null : null;
    })() ??
    conceptRecords[0] ??
    null;

  const roundRecords =
    selectedClaim != null
      ? await db
          .select()
          .from(dialecticRounds)
          .where(and(eq(dialecticRounds.userId, parsed.userId), eq(dialecticRounds.claimId, selectedClaim.id)))
          .orderBy(desc(dialecticRounds.roundNumber))
          .limit(6)
      : [];
  const eventRecords =
    mapRecord != null
      ? await db
          .select()
          .from(movesEvents)
          .where(and(eq(movesEvents.userId, parsed.userId), eq(movesEvents.mapId, mapRecord.id)))
          .orderBy(desc(movesEvents.createdAt))
          .limit(10)
      : [];

  let learningPromptRecords: LearningPromptRecord[] = [];
  if (selectedConcept) {
    learningPromptRecords = await db
      .select()
      .from(learningPrompts)
      .where(and(eq(learningPrompts.userId, parsed.userId), eq(learningPrompts.conceptId, selectedConcept.id)))
      .orderBy(desc(learningPrompts.createdAt))
      .limit(4);
  } else if (selectedClaim) {
    learningPromptRecords = await db
      .select()
      .from(learningPrompts)
      .where(and(eq(learningPrompts.userId, parsed.userId), eq(learningPrompts.claimId, selectedClaim.id)))
      .orderBy(desc(learningPrompts.createdAt))
      .limit(4);
  } else if (contextRecord) {
    learningPromptRecords = await db
      .select()
      .from(learningPrompts)
      .where(and(eq(learningPrompts.userId, parsed.userId), eq(learningPrompts.workspaceContextId, contextRecord.id)))
      .orderBy(desc(learningPrompts.createdAt))
      .limit(4);
  }

  const relatedClaimIds = dedupeIds([
    ...selectedClaimEdges.flatMap((record) => [record.fromClaimId, record.toClaimId]),
    ...conceptEdgeRecords.filter((record) => record.conceptId === selectedConcept?.id).map((record) => record.claimId),
  ]);
  const recentClaimIds = new Set(recentClaims.map((record) => record.id));
  const missingRelatedClaimIds = relatedClaimIds.filter((id) => !recentClaimIds.has(id));
  const additionalRelatedClaims =
    missingRelatedClaimIds.length > 0
      ? await db
          .select()
          .from(claims)
          .where(and(eq(claims.userId, parsed.userId), inArray(claims.id, missingRelatedClaimIds)))
      : [];
  const relatedClaimIndex = new Map<string, ClaimRecord>(
    [...recentClaims, ...additionalRelatedClaims]
      .map((record) => [record.id, record] as const),
  );

  const contextView: WorkspaceContextView = {
    contextId: contextRecord?.id ?? null,
    contextKey: contextRecord?.contextKey ?? `workspace:${parsed.userId}:${mapRecord?.id ?? "none"}:${projectionMode}`,
    persisted: contextRecord != null,
    projectionMode,
    storedMode: contextRecord?.mode ?? null,
    breadcrumb: buildProjectionBreadcrumb(projectionMode),
    lastAccessedAt: toIsoString(contextRecord?.lastAccessedAt),
    map: summarizeMap(mapRecord),
    sphere: summarizeSphere(sphereRecord, effectiveSphereId),
    selection: {
      claim: summarizeClaim(selectedClaim),
      concept: summarizeConcept(selectedConcept),
    },
  };

  return {
    contextView,
    mapRecord,
    sphereRecords,
    selectedClaim,
    recentClaims,
    selectedClaimEdges,
    relatedClaimIndex,
    selectedConcept,
    conceptRecords,
    conceptEdgeRecords,
    roundRecords,
    eventRecords,
    learningPromptRecords,
  };
}

export async function buildWorkspaceShellView(input: WorkspaceProjectionInput): Promise<WorkspaceShellView> {
  const state = await resolveWorkspaceState(input, "brain");
  const projectionMode = WorkspaceProjectionModeSchema.parse(input.mode ?? state.contextView.storedMode ?? "brain");
  const activeSphereId = state.contextView.sphere?.id ?? null;
  const workspace: WorkspaceContextView = {
    ...state.contextView,
    projectionMode,
    breadcrumb: buildProjectionBreadcrumb(projectionMode),
  };

  return {
    workspace,
    topBar: {
      breadcrumb: workspace.breadcrumb,
      title: workspace.map?.title ?? "Penny",
      subtitle: workspace.sphere?.title ?? null,
    },
    leftRail: {
      modes: buildModeRail(projectionMode),
      spheres: state.sphereRecords.map((record) => ({
        id: record.id,
        title: record.title,
        slug: record.slug,
        colorToken: record.colorToken,
        isActive: record.id === activeSphereId,
        isArchived: record.isArchived,
      })),
    },
  };
}

export async function buildBrainView(input: WorkspaceProjectionInput): Promise<BrainView> {
  const state = await resolveWorkspaceState(input, "brain");
  const dependentClaims = state.selectedClaimEdges
    .map((edge) => {
      const relatedId = edge.fromClaimId === state.selectedClaim?.id ? edge.toClaimId : edge.fromClaimId;
      const relatedClaim = state.relatedClaimIndex.get(relatedId) ?? null;

      return relatedClaim
        ? {
            claim: summarizeClaim(relatedClaim)!,
            relation: edge.edgeType,
            weight: edge.weight,
          }
        : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null)
    .slice(0, 5);

  const recentThoughts = state.recentClaims
    .filter((record) => record.id !== state.selectedClaim?.id)
    .slice(0, 5)
    .map((record) => summarizeClaim(record)!)
    .filter(Boolean);

  return {
    workspace: state.contextView,
    stream: {
      sectionTitle: "Stream",
      continuePrompt: "Continue where you left off",
      highlightedClaim: summarizeClaim(state.selectedClaim),
      recentThoughts,
    },
    inspector: state.selectedClaim
      ? {
          claim: summarizeClaim(state.selectedClaim)!,
          confidenceLabel: `${state.selectedClaim.confidence}%`,
          keyConnections: buildMiniClaimGraph({
            selectedClaim: state.selectedClaim,
            edges: state.selectedClaimEdges,
            claimIndex: state.relatedClaimIndex,
          }),
          dependents: dependentClaims,
          lastChallenged: toIsoString(state.selectedClaim.lastChallengedAt),
          miniMap: buildMiniClaimGraph({
            selectedClaim: state.selectedClaim,
            edges: state.selectedClaimEdges,
            claimIndex: state.relatedClaimIndex,
          }),
        }
      : null,
    activity: {
      recentEvents: state.eventRecords.map(summarizeEvent),
    },
  };
}

export async function buildChallengeView(input: WorkspaceProjectionInput): Promise<ChallengeView> {
  const state = await resolveWorkspaceState(input, "challenge");
  const activeRound = state.roundRecords[0] ?? null;
  const cascadeSteps = state.selectedClaimEdges
    .map((edge) => {
      const relatedId = edge.fromClaimId === state.selectedClaim?.id ? edge.toClaimId : edge.fromClaimId;
      const claim = state.relatedClaimIndex.get(relatedId) ?? null;

      return claim
        ? {
            claim: summarizeClaim(claim)!,
            relation: edge.edgeType,
            weight: edge.weight,
          }
        : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null)
    .slice(0, 5);
  const uncertainty = asRecord(activeRound?.uncertainty);
  const uncertaintySummary = asString(uncertainty.summary) ?? asString(uncertainty.reasoning) ?? null;

  return {
    workspace: state.contextView,
    focus: {
      claim: summarizeClaim(state.selectedClaim),
      counterargument: activeRound
        ? {
            roundId: activeRound.id,
            roundNumber: activeRound.roundNumber,
            text: activeRound.critiqueGenerated,
            failureTypes: activeRound.critiqueFailureTypes,
            lens: activeRound.critiqueLens,
            strength: activeRound.critiqueStrength,
            voiceLabel: activeRound.voiceLabel,
          }
        : null,
    },
    response: {
      activeRound: activeRound
        ? {
            roundId: activeRound.id,
            roundNumber: activeRound.roundNumber,
            confidenceAtRoundStart: activeRound.confidenceAtRoundStart,
            confidenceAtRoundEnd: activeRound.confidenceAtRoundEnd,
            responsePath: (activeRound.responsePath as "defend" | "revise" | "absorb" | null) ?? null,
            userResponse: activeRound.userResponse,
            followUpPrompt: activeRound.followUpPrompt,
            concessions: activeRound.concessions,
            defenses: activeRound.defenses,
            dismissals: activeRound.dismissals,
          }
        : null,
      responsePaths: buildChallengeResponsePaths(activeRound),
      recentRounds: state.roundRecords.slice(0, 5).map((round) => ({
        roundId: round.id,
        roundNumber: round.roundNumber,
        responsePath: round.responsePath,
        confidenceDelta: round.confidenceDelta,
        closedAt: toIsoString(round.closedAt),
      })),
    },
    transparency: {
      critique: activeRound
        ? [
            { label: "Critique lens", value: activeRound.critiqueLens },
            { label: "Strength", value: activeRound.critiqueStrength },
            { label: "Failure types", value: activeRound.critiqueFailureTypes.join(", ") || "Not specified" },
            { label: "Why now", value: uncertaintySummary ?? "Derived from the current claim and workspace context." },
          ]
        : [],
      dependencyCascade: state.selectedClaim && cascadeSteps.length
        ? {
            summary: `${cascadeSteps.length} nearby claim${cascadeSteps.length === 1 ? "" : "s"} would feel this challenge.`,
            steps: cascadeSteps,
          }
        : null,
    },
  };
}

export async function buildLearnView(input: WorkspaceProjectionInput): Promise<LearnView> {
  const state = await resolveWorkspaceState(input, "learn");
  const activePrompt = state.learningPromptRecords[0] ?? null;
  const promptPayload = asRecord(activePrompt?.promptPayload);
  const latestTeachback = asRecord(promptPayload.latestTeachback);
  const latestEvaluation = asRecord(latestTeachback.evaluation);
  const explicitChecklist = asStringArray(promptPayload.feedbackChecklist).length
    ? asStringArray(promptPayload.feedbackChecklist)
    : asStringArray(promptPayload.checklist);
  const completedChecklist = new Set(asStringArray(latestEvaluation.completedChecklist));
  const selectedClaimSummary = summarizeClaim(state.selectedClaim);
  const relatedConcepts = state.selectedConcept
    ? state.conceptRecords.filter((record) => record.id !== state.selectedConcept?.id).slice(0, 5)
    : state.conceptRecords.slice(0, 5);
  const checklist = (explicitChecklist.length
    ? explicitChecklist
    : [
        state.selectedConcept
          ? `Explain ${state.selectedConcept.name} in the context of the active claim.`
          : "Explain the concept in the context of the active claim.",
        "Name the mechanism, not just the conclusion.",
        "Use one concrete example or edge case.",
      ]).map((label, index) => ({
        id: `check-${index + 1}`,
        label,
        completed: completedChecklist.has(label),
      }));

  return {
    workspace: state.contextView,
    conceptNav: state.conceptRecords.slice(0, 8).map((record) => ({
      ...summarizeConcept(record)!,
      isSelected: record.id === state.selectedConcept?.id,
    })),
    teachback: {
      promptId: activePrompt?.id ?? null,
      conceptTitle: state.selectedConcept?.name ?? "Concept",
      explanation:
        asString(promptPayload.explanation) ??
        state.selectedConcept?.description ??
        "Understand the concept well enough to restate it in the context of your claim.",
      promptText: activePrompt?.promptText ?? null,
      submission: asString(latestTeachback.submission),
      checklist,
      secondaryCta: {
        label: "Show me an example",
        exampleText: asString(promptPayload.exampleText) ?? asString(promptPayload.example) ?? null,
      },
    },
    contextPanel: {
      conceptGraph: buildMiniConceptGraph({
        selectedConcept: state.selectedConcept,
        linkedConcepts: [state.selectedConcept, ...relatedConcepts].filter((record): record is ConceptRecord => record != null),
      }),
      relatedClaim: selectedClaimSummary,
      connectedIdeas: relatedConcepts.map((record) => summarizeConcept(record)!).filter(Boolean),
    },
  };
}

export const workspaceProjectionSchemas = {
  input: WorkspaceProjectionInputSchema,
  mode: WorkspaceProjectionModeSchema,
};
