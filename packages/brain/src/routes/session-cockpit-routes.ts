import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { createPennyDb, type PennyDatabase } from "../db/client.ts";
import { artifacts, challengeRounds } from "../db/schema.ts";
import {
  type BrainRepository,
  BrainRepositoryConflictError,
  BrainRepositoryNotFoundError,
  createBrainRepository,
} from "../domain/repository.ts";
import type { EntityId } from "../domain/types.ts";
import {
  loadSessionGraph,
  SessionGraphConflictError,
  SessionGraphNotFoundError,
  type SessionGraphPayload,
} from "../session-graph-route.ts";
import {
  ThinkingModeConflictError,
  ThinkingModeNotFoundError,
  ThinkingModeService,
  type ManualFocusResponse,
  type StartNextMoveResponse,
  type ThinkingModeStateResponse,
  type ThinkingModeTickResponse,
} from "../services/thinking-mode-service.ts";

const UuidSchema = z.string().uuid();
const CandidateIdSchema = z.string().trim().min(1).max(200);
const EmptyBodySchema = z.object({}).strict();
const TickBodySchema = z
  .object({
    resume: z.boolean().optional().default(false),
    limit: z.number().int().min(1).max(20).optional(),
  })
  .strict();
const ManualFocusBodySchema = z
  .object({
    claimId: UuidSchema,
    reason: z.string().trim().min(1).max(1_000).optional(),
    previousSuggestionMoveId: UuidSchema.optional(),
  })
  .strict();

type ChallengeRoundRow = typeof challengeRounds.$inferSelect;
type ArtifactRow = typeof artifacts.$inferSelect;
type CockpitClaim = SessionGraphPayload["ideaMap"]["claims"][number];
type CockpitEdge = SessionGraphPayload["ideaMap"]["edges"][number];
type WorkStructureType = "essay" | "startup" | "research" | "decision" | "general";
type WorkStructureStepStatus = "not_started" | "active" | "resolved" | "stale";

type WorkStructureStepDefinition = {
  id: string;
  title: string;
  purpose: string;
  keywords: string[];
  preferredKinds: string[];
  baseImportance: number;
  baseFragility: number;
  choices: Array<{
    id: string;
    label: string;
    description: string;
  }>;
};

type RankedWorkStructureStep = WorkStructureStep & {
  order: number;
  score: number;
};

export type WorkStructureChoice = {
  id: string;
  label: string;
  description: string;
  claimIds: EntityId[];
  edgeIds: EntityId[];
};

export type WorkStructureStep = {
  id: string;
  title: string;
  purpose: string;
  rank: number;
  fragility: number;
  importance: number;
  status: WorkStructureStepStatus;
  claimIds: EntityId[];
  edgeIds: EntityId[];
  whyNow: string;
  detailChoices: WorkStructureChoice[];
};

export type WorkStructure = {
  structureType: WorkStructureType;
  label: string;
  description: string;
  activeStepId: string | null;
  steps: WorkStructureStep[];
};

export type SessionCockpitChallengeRound = {
  id: EntityId;
  sessionId: EntityId;
  status: ChallengeRoundRow["status"];
  response: ChallengeRoundRow["response"];
  targetClaimId: EntityId;
  targetClaimVersionId: EntityId;
  critiqueClaimId: EntityId;
  critiqueClaimVersionId: EntityId;
  challengeEdgeId: EntityId;
  brainRunId: EntityId;
  challengeMoveId: EntityId;
  responseMoveId: EntityId | null;
  focusCompletedMoveId: EntityId | null;
  failureType: ChallengeRoundRow["failureType"];
  strength: ChallengeRoundRow["strength"];
  critique: string;
  whyThis: string;
  whatWouldResolveIt: string;
  createdAt: string;
  respondedAt: string | null;
  updatedAt: string;
};

export type SessionCockpitActiveChallenge = SessionCockpitChallengeRound & {
  targetClaim: CockpitClaim | null;
  critiqueClaim: CockpitClaim | null;
  challengeEdge: CockpitEdge | null;
};

export type SessionCockpitArtifact = {
  id: EntityId;
  sessionId: EntityId;
  kind: ArtifactRow["kind"];
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type BrainGraphPathNode = {
  id: string;
  claimId: EntityId;
  label: string;
  role: string;
  kind: CockpitClaim["kind"];
  status: CockpitClaim["status"];
  confidence: number;
  depth: number;
  lane: number;
  rank: number;
  moveCount: number;
  edgeIds: EntityId[];
  selected: boolean;
  suggested: boolean;
};

export type BrainGraphPathEdge = {
  id: string;
  edgeId: EntityId;
  fromNodeId: string;
  toNodeId: string;
  kind: CockpitEdge["kind"];
  status: CockpitEdge["status"];
  label: string | null;
};

export type BrainGraphPath = {
  layout: "top_down";
  generatedFrom: "claims_edges_moves";
  focusClaimId: EntityId | null;
  nodes: BrainGraphPathNode[];
  edges: BrainGraphPathEdge[];
  meta: {
    nodeCount: number;
    edgeCount: number;
    maxDepth: number;
  };
};

export type SessionCockpitPayload = {
  session: SessionGraphPayload["session"];
  sourceOfTruth: SessionGraphPayload["sourceOfTruth"];
  ideaMap: SessionGraphPayload["ideaMap"];
  workStructure: WorkStructure;
  graphPath: BrainGraphPath;
  graph: SessionGraphPayload["graph"];
  moves: SessionGraphPayload["moves"];
  lensSnapshot: SessionGraphPayload["lensSnapshot"];
  autopilot: ThinkingModeStateResponse;
  modeContract: ThinkingModeStateResponse["modeContract"];
  activeChallenge: SessionCockpitActiveChallenge | null;
  latestArtifact: SessionCockpitArtifact | null;
  meta: SessionGraphPayload["meta"] & {
    latestArtifactId: EntityId | null;
    activeChallengeId: EntityId | null;
  };
};

export type SessionAutopilotTickInput = {
  sessionId: EntityId;
  resume?: boolean;
  limit?: number;
};

export type SessionStartNextMoveInput = {
  sessionId: EntityId;
  candidateId: string;
};

export type SessionManualFocusInput = {
  sessionId: EntityId;
  claimId: EntityId;
  reason?: string | null;
  previousSuggestionMoveId?: EntityId | null;
};

export type SessionCockpitRouteService = {
  getCockpit(sessionId: EntityId): Promise<SessionCockpitPayload>;
  getAutopilotState(sessionId: EntityId): Promise<ThinkingModeStateResponse>;
  tickAutopilot(input: SessionAutopilotTickInput): Promise<ThinkingModeTickResponse>;
  startCandidate(input: SessionStartNextMoveInput): Promise<StartNextMoveResponse>;
  manualFocus(input: SessionManualFocusInput): Promise<ManualFocusResponse>;
};

export type SessionCockpitRouteOptions = {
  service?: SessionCockpitRouteService;
  db?: PennyDatabase;
  databaseUrl?: string;
};

export class SessionCockpitService implements SessionCockpitRouteService {
  private readonly repository: BrainRepository;
  private readonly thinkingModeService: ThinkingModeService;

  constructor(private readonly db: PennyDatabase) {
    this.repository = createBrainRepository(db);
    this.thinkingModeService = new ThinkingModeService(this.repository);
  }

  async getCockpit(sessionId: EntityId): Promise<SessionCockpitPayload> {
    const [graph, autopilot, activeChallenge, latestArtifact] = await Promise.all([
      loadSessionGraph(this.db, sessionId),
      this.getAutopilotState(sessionId),
      loadActiveChallenge(this.db, sessionId),
      loadLatestArtifact(this.db, sessionId),
    ]);

    return buildSessionCockpitPayload(graph, autopilot, activeChallenge, latestArtifact);
  }

  async getAutopilotState(sessionId: EntityId): Promise<ThinkingModeStateResponse> {
    return this.thinkingModeService.getState(brainIdForSessionAlias(sessionId), sessionId);
  }

  async tickAutopilot(input: SessionAutopilotTickInput): Promise<ThinkingModeTickResponse> {
    const tickInput = {
      brainId: brainIdForSessionAlias(input.sessionId),
      sessionId: input.sessionId,
    };

    return this.thinkingModeService.tick({
      ...tickInput,
      ...(input.resume !== undefined ? { resume: input.resume } : {}),
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
    });
  }

  async startCandidate(input: SessionStartNextMoveInput): Promise<StartNextMoveResponse> {
    return this.thinkingModeService.startCandidate({
      brainId: brainIdForSessionAlias(input.sessionId),
      sessionId: input.sessionId,
      candidateId: input.candidateId,
    });
  }

  async manualFocus(input: SessionManualFocusInput): Promise<ManualFocusResponse> {
    return this.thinkingModeService.manualFocus({
      brainId: brainIdForSessionAlias(input.sessionId),
      sessionId: input.sessionId,
      claimId: input.claimId,
      reason: input.reason ?? null,
      previousSuggestionMoveId: input.previousSuggestionMoveId ?? null,
    });
  }
}

export async function handleSessionCockpitRequest(
  request: Request,
  sessionId: string,
  options: SessionCockpitRouteOptions = {},
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed("GET /api/sessions/:sessionId/cockpit requires the GET method.", "GET");
  }

  const sessionIdResult = UuidSchema.safeParse(sessionId);

  if (!sessionIdResult.success) {
    return invalidRequest("Invalid sessionId.", ["sessionId path parameter must be a UUID."]);
  }

  try {
    const service = resolveService(options);

    return jsonResponse({ data: await service.getCockpit(sessionIdResult.data) });
  } catch (error) {
    return sessionAdapterErrorResponse(error);
  }
}

export async function handleSessionAutopilotStateRequest(
  request: Request,
  sessionId: string,
  options: SessionCockpitRouteOptions = {},
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed("GET /api/sessions/:sessionId/autopilot/state requires the GET method.", "GET");
  }

  const sessionIdResult = UuidSchema.safeParse(sessionId);

  if (!sessionIdResult.success) {
    return invalidRequest("Invalid sessionId.", ["sessionId path parameter must be a UUID."]);
  }

  try {
    const service = resolveService(options);

    return jsonResponse({ data: await service.getAutopilotState(sessionIdResult.data) });
  } catch (error) {
    return sessionAdapterErrorResponse(error);
  }
}

export async function handleSessionAutopilotTickRequest(
  request: Request,
  sessionId: string,
  options: SessionCockpitRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/sessions/:sessionId/autopilot/tick requires the POST method.", "POST");
  }

  const sessionIdResult = UuidSchema.safeParse(sessionId);

  if (!sessionIdResult.success) {
    return invalidRequest("Invalid sessionId.", ["sessionId path parameter must be a UUID."]);
  }

  const parsed = await parseJsonRequest(request, TickBodySchema);

  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const service = resolveService(options);
    const input: SessionAutopilotTickInput = {
      sessionId: sessionIdResult.data,
      resume: parsed.data.resume,
    };

    if (parsed.data.limit !== undefined) {
      input.limit = parsed.data.limit;
    }

    return jsonResponse({ data: await service.tickAutopilot(input) }, 201);
  } catch (error) {
    return sessionAdapterErrorResponse(error);
  }
}

export async function handleSessionStartNextMoveCandidateRequest(
  request: Request,
  sessionId: string,
  candidateId: string,
  options: SessionCockpitRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed(
      "POST /api/sessions/:sessionId/next-move-candidates/:candidateId/start requires the POST method.",
      "POST",
    );
  }

  const sessionIdResult = UuidSchema.safeParse(sessionId);
  const candidateIdResult = CandidateIdSchema.safeParse(candidateId);

  if (!sessionIdResult.success) {
    return invalidRequest("Invalid sessionId.", ["sessionId path parameter must be a UUID."]);
  }

  if (!candidateIdResult.success) {
    return invalidRequest("Invalid candidateId.", ["candidateId path parameter is required."]);
  }

  const parsed = await parseJsonRequest(request, EmptyBodySchema);

  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const service = resolveService(options);

    return jsonResponse(
      {
        data: await service.startCandidate({
          sessionId: sessionIdResult.data,
          candidateId: candidateIdResult.data,
        }),
      },
      201,
    );
  } catch (error) {
    return sessionAdapterErrorResponse(error);
  }
}

export async function handleSessionManualFocusRequest(
  request: Request,
  sessionId: string,
  options: SessionCockpitRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/sessions/:sessionId/focus/manual requires the POST method.", "POST");
  }

  const sessionIdResult = UuidSchema.safeParse(sessionId);

  if (!sessionIdResult.success) {
    return invalidRequest("Invalid sessionId.", ["sessionId path parameter must be a UUID."]);
  }

  const parsed = await parseJsonRequest(request, ManualFocusBodySchema);

  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const service = resolveService(options);
    const input: SessionManualFocusInput = {
      sessionId: sessionIdResult.data,
      claimId: parsed.data.claimId,
    };

    if (parsed.data.reason !== undefined) {
      input.reason = parsed.data.reason;
    }

    if (parsed.data.previousSuggestionMoveId !== undefined) {
      input.previousSuggestionMoveId = parsed.data.previousSuggestionMoveId;
    }

    return jsonResponse({ data: await service.manualFocus(input) }, 201);
  } catch (error) {
    return sessionAdapterErrorResponse(error);
  }
}

export function buildSessionCockpitPayload(
  graph: SessionGraphPayload,
  autopilot: ThinkingModeStateResponse,
  activeChallenge: SessionCockpitChallengeRound | null,
  latestArtifact: SessionCockpitArtifact | null = null,
): SessionCockpitPayload {
  return {
    session: graph.session,
    sourceOfTruth: graph.sourceOfTruth,
    ideaMap: graph.ideaMap,
    workStructure: buildWorkStructure(graph, autopilot, activeChallenge),
    graphPath: buildBrainGraphPath(graph, autopilot, activeChallenge),
    graph: graph.graph,
    moves: graph.moves,
    lensSnapshot: graph.lensSnapshot,
    autopilot,
    modeContract: autopilot.modeContract,
    activeChallenge: activeChallenge ? attachChallengeGraphRefs(activeChallenge, graph) : null,
    latestArtifact,
    meta: {
      ...graph.meta,
      latestArtifactId: latestArtifact?.id ?? null,
      activeChallengeId: activeChallenge?.id ?? null,
    },
  };
}

export function buildBrainGraphPath(
  graph: SessionGraphPayload,
  autopilot: ThinkingModeStateResponse,
  activeChallenge: SessionCockpitChallengeRound | null,
): BrainGraphPath {
  const claims = graph.ideaMap.claims;
  const edges = graph.ideaMap.edges;
  const focusClaimId =
    activeChallenge?.targetClaimId ??
    autopilot.focusState.focusedClaimId ??
    autopilot.selectedCandidate?.targetClaimId ??
    claims[0]?.id ??
    null;
  const rootClaimId = claims[0]?.id ?? focusClaimId;
  const depths = graphPathDepths(claims, edges, rootClaimId ?? null);
  const nodesByDepth = new Map<number, CockpitClaim[]>();

  for (const claim of claims) {
    const depth = depths.get(claim.id) ?? 0;
    const siblings = nodesByDepth.get(depth) ?? [];
    siblings.push(claim);
    nodesByDepth.set(depth, siblings);
  }

  const nodes: BrainGraphPathNode[] = [];

  for (const [depth, depthClaims] of [...nodesByDepth.entries()].sort(([left], [right]) => left - right)) {
    const sortedClaims = [...depthClaims].sort((left, right) => graphPathClaimSort(left, right, focusClaimId));
    const center = (sortedClaims.length - 1) / 2;

    sortedClaims.forEach((claim, index) => {
      const edgeIds = uniqueStrings([...claim.incomingEdgeIds, ...claim.outgoingEdgeIds]);

      nodes.push({
        id: `claim:${claim.id}`,
        claimId: claim.id,
        label: claim.text,
        role: graphPathRole(claim, edges, rootClaimId ?? null),
        kind: claim.kind,
        status: claim.status,
        confidence: claim.confidence,
        depth,
        lane: index - center,
        rank: nodes.length + 1,
        moveCount: claim.moveIds.length,
        edgeIds,
        selected: claim.id === focusClaimId,
        suggested: claim.id === autopilot.selectedCandidate?.targetClaimId,
      });
    });
  }

  const nodeIds = new Set(nodes.map((node) => node.claimId));
  const nodeByClaimId = new Map(nodes.map((node) => [node.claimId, node]));
  const graphPathEdges = edges
    .filter((edge) => nodeIds.has(edge.fromClaimId) && nodeIds.has(edge.toClaimId))
    .map((edge) => {
      const fromNode = nodeByClaimId.get(edge.fromClaimId);
      const toNode = nodeByClaimId.get(edge.toClaimId);

      if (!fromNode || !toNode) {
        return null;
      }

      const shouldReverse = fromNode.depth > toNode.depth;
      const source = shouldReverse ? toNode : fromNode;
      const target = shouldReverse ? fromNode : toNode;

      return {
        id: `edge:${edge.id}`,
        edgeId: edge.id,
        fromNodeId: source.id,
        toNodeId: target.id,
        kind: edge.kind,
        status: edge.status,
        label: edge.label,
      };
    })
    .filter((edge): edge is BrainGraphPathEdge => Boolean(edge));

  return {
    layout: "top_down",
    generatedFrom: "claims_edges_moves",
    focusClaimId,
    nodes,
    edges: graphPathEdges,
    meta: {
      nodeCount: nodes.length,
      edgeCount: graphPathEdges.length,
      maxDepth: nodes.reduce((maxDepth, node) => Math.max(maxDepth, node.depth), 0),
    },
  };
}

function graphPathDepths(claims: CockpitClaim[], edges: CockpitEdge[], rootClaimId: EntityId | null): Map<EntityId, number> {
  const depths = new Map<EntityId, number>();
  const claimIds = new Set(claims.map((claim) => claim.id));
  const adjacency = new Map<EntityId, EntityId[]>();

  for (const edge of edges) {
    if (!claimIds.has(edge.fromClaimId) || !claimIds.has(edge.toClaimId)) {
      continue;
    }

    adjacency.set(edge.fromClaimId, [...(adjacency.get(edge.fromClaimId) ?? []), edge.toClaimId]);
    adjacency.set(edge.toClaimId, [...(adjacency.get(edge.toClaimId) ?? []), edge.fromClaimId]);
  }

  const queue: EntityId[] = [];

  if (rootClaimId && claimIds.has(rootClaimId)) {
    depths.set(rootClaimId, 0);
    queue.push(rootClaimId);
  }

  while (queue.length > 0) {
    const claimId = queue.shift();

    if (!claimId) {
      continue;
    }

    const nextDepth = (depths.get(claimId) ?? 0) + 1;

    for (const nextClaimId of adjacency.get(claimId) ?? []) {
      if (!depths.has(nextClaimId)) {
        depths.set(nextClaimId, nextDepth);
        queue.push(nextClaimId);
      }
    }
  }

  let disconnectedDepth = depths.size > 0 ? Math.max(...depths.values()) + 1 : 0;

  for (const claim of claims) {
    if (!depths.has(claim.id)) {
      depths.set(claim.id, disconnectedDepth);
      disconnectedDepth += 1;
    }
  }

  return depths;
}

function graphPathClaimSort(left: CockpitClaim, right: CockpitClaim, focusClaimId: EntityId | null): number {
  return (
    Number(right.id === focusClaimId) - Number(left.id === focusClaimId) ||
    right.moveIds.length - left.moveIds.length ||
    left.createdAt.localeCompare(right.createdAt)
  );
}

function graphPathRole(claim: CockpitClaim, edges: CockpitEdge[], rootClaimId: EntityId | null): string {
  if (claim.id === rootClaimId) {
    return "main_claim";
  }

  if (claim.kind === "concept") {
    return "concept";
  }

  if (claim.kind === "question") {
    return "question";
  }

  const claimEdges = edges.filter((edge) => edge.fromClaimId === claim.id || edge.toClaimId === claim.id);

  if (claimEdges.some((edge) => edge.kind === "challenges" || edge.kind === "contradicts")) {
    return "challenge";
  }

  if (claimEdges.some((edge) => edge.kind === "supports")) {
    return "support";
  }

  if (claimEdges.some((edge) => edge.kind === "depends_on")) {
    return claim.kind === "assumption" ? "assumption" : "requirement";
  }

  if (claimEdges.some((edge) => edge.kind === "teaches")) {
    return "concept";
  }

  return claim.kind;
}

async function loadActiveChallenge(
  db: PennyDatabase,
  sessionId: EntityId,
): Promise<SessionCockpitChallengeRound | null> {
  const [round] = await db
    .select()
    .from(challengeRounds)
    .where(and(eq(challengeRounds.sessionId, sessionId), eq(challengeRounds.status, "open")))
    .orderBy(desc(challengeRounds.createdAt))
    .limit(1);

  return round ? challengeRoundSlice(round) : null;
}

async function loadLatestArtifact(db: PennyDatabase, sessionId: EntityId): Promise<SessionCockpitArtifact | null> {
  const [artifact] = await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.sessionId, sessionId))
    .orderBy(desc(artifacts.createdAt))
    .limit(1);

  return artifact ? artifactSlice(artifact) : null;
}

function artifactSlice(artifact: ArtifactRow): SessionCockpitArtifact {
  return {
    id: artifact.id,
    sessionId: artifact.sessionId,
    kind: artifact.kind,
    title: artifact.title,
    summary: artifact.summary,
    payload: asRecord(artifact.payload),
    createdAt: artifact.createdAt.toISOString(),
  };
}

function challengeRoundSlice(round: ChallengeRoundRow): SessionCockpitChallengeRound {
  return {
    id: round.id,
    sessionId: round.sessionId,
    status: round.status,
    response: round.response,
    targetClaimId: round.targetClaimId,
    targetClaimVersionId: round.targetClaimVersionId,
    critiqueClaimId: round.critiqueClaimId,
    critiqueClaimVersionId: round.critiqueClaimVersionId,
    challengeEdgeId: round.challengeEdgeId,
    brainRunId: round.brainRunId,
    challengeMoveId: round.challengeMoveId,
    responseMoveId: round.responseMoveId,
    focusCompletedMoveId: round.focusCompletedMoveId,
    failureType: round.failureType,
    strength: round.strength,
    critique: round.critique,
    whyThis: round.whyThis,
    whatWouldResolveIt: round.whatWouldResolveIt,
    createdAt: round.createdAt.toISOString(),
    respondedAt: round.respondedAt?.toISOString() ?? null,
    updatedAt: round.updatedAt.toISOString(),
  };
}

function attachChallengeGraphRefs(
  challenge: SessionCockpitChallengeRound,
  graph: SessionGraphPayload,
): SessionCockpitActiveChallenge {
  return {
    ...challenge,
    targetClaim: graph.ideaMap.claims.find((claim) => claim.id === challenge.targetClaimId) ?? null,
    critiqueClaim: graph.ideaMap.claims.find((claim) => claim.id === challenge.critiqueClaimId) ?? null,
    challengeEdge: graph.ideaMap.edges.find((edge) => edge.id === challenge.challengeEdgeId) ?? null,
  };
}

function buildWorkStructure(
  graph: SessionGraphPayload,
  autopilot: ThinkingModeStateResponse,
  activeChallenge: SessionCockpitChallengeRound | null,
): WorkStructure {
  const text = structureInferenceText(graph);
  const structureType = inferWorkStructureType(text);
  const definitions = workStructureDefinitions(structureType);
  const activeClaimId =
    activeChallenge?.targetClaimId ??
    autopilot.selectedCandidate?.targetClaimId ??
    autopilot.focusState.focusedClaimId ??
    null;
  const activeEdgeId =
    activeChallenge?.challengeEdgeId ??
    autopilot.selectedCandidate?.targetEdgeId ??
    autopilot.focusState.focusedEdgeId ??
    null;
  const ranked = definitions
    .map((definition, index) =>
      rankWorkStructureStep(definition, index, {
        graph,
        autopilot,
        activeChallenge,
        activeClaimId,
        activeEdgeId,
      }),
    )
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .map((step, index) => stripWorkStructureRanking({ ...step, rank: index + 1 }));
  const activeStep = ranked.find((step) => step.status === "active") ?? ranked[0] ?? null;

  return {
    structureType,
    label: workStructureLabel(structureType),
    description: workStructureDescription(structureType),
    activeStepId: activeStep?.id ?? null,
    steps: ranked,
  };
}

function rankWorkStructureStep(
  definition: WorkStructureStepDefinition,
  order: number,
  context: {
    graph: SessionGraphPayload;
    autopilot: ThinkingModeStateResponse;
    activeChallenge: SessionCockpitChallengeRound | null;
    activeClaimId: EntityId | null;
    activeEdgeId: EntityId | null;
  },
): RankedWorkStructureStep {
  const claims = selectClaimsForStep(definition, context);
  const claimIds = claims.map((claim) => claim.id);
  const edgeIds = selectEdgesForStep(definition, context, claimIds);
  const matchesActiveFocus = stepMatchesActiveFocus(definition.id, context);
  const active =
    matchesActiveFocus &&
    (Boolean(context.activeClaimId && claimIds.includes(context.activeClaimId)) ||
      Boolean(context.activeEdgeId && edgeIds.includes(context.activeEdgeId)));
  const vulnerabilities = claims.map((claim) => claimFragility(claim, context.graph.ideaMap.edges));
  const maxClaimFragility = Math.max(0, ...vulnerabilities);
  const activeChallengeBonus =
    context.activeChallenge && (definition.id.includes("challenge") || definition.id.includes("counterargument")) ? 34 : 0;
  const selectedCandidateBonus = active ? 30 : 0;
  const fragility = clampScore(definition.baseFragility + maxClaimFragility + activeChallengeBonus + selectedCandidateBonus);
  const dependencyWeight = claims.reduce((total, claim) => total + claimDependencyWeight(claim, context.graph.ideaMap.edges), 0);
  const importance = clampScore(definition.baseImportance + dependencyWeight + edgeIds.length * 4 + (active ? 18 : 0));
  const status = workStructureStepStatus(active, fragility, claims, context.graph.moves);
  const score = fragility * 4 + importance * 2 + (active ? 180 : 0) - order * 5;

  return {
    id: definition.id,
    title: definition.title,
    purpose: definition.purpose,
    rank: order + 1,
    fragility,
    importance,
    status,
    claimIds,
    edgeIds,
    whyNow: whyThisStep(definition, claims, context, fragility, importance),
    detailChoices: definition.choices.map((choice) => ({
      ...choice,
      claimIds,
      edgeIds,
    })),
    order,
    score,
  };
}

function stripWorkStructureRanking(step: RankedWorkStructureStep): WorkStructureStep {
  return {
    id: step.id,
    title: step.title,
    purpose: step.purpose,
    rank: step.rank,
    fragility: step.fragility,
    importance: step.importance,
    status: step.status,
    claimIds: step.claimIds,
    edgeIds: step.edgeIds,
    whyNow: step.whyNow,
    detailChoices: step.detailChoices,
  };
}

function structureInferenceText(graph: SessionGraphPayload): string {
  return [
    graph.session.title ?? "",
    ...graph.sources.map((source) => source.rawText),
    ...graph.ideaMap.claims.map((claim) => claim.text),
  ]
    .join(" ")
    .toLowerCase();
}

function inferWorkStructureType(text: string): WorkStructureType {
  if (hasAny(text, ["essay", "expos", "thesis", "course", "paragraph", "argument", "counterargument"])) {
    return "essay";
  }

  if (hasAny(text, ["startup", "founder", "customer", "market", "revenue", "pricing", "product", "wedge"])) {
    return "startup";
  }

  if (hasAny(text, ["research", "study", "hypothesis", "dataset", "method", "experiment", "literature"])) {
    return "research";
  }

  if (hasAny(text, ["decision", "choose", "whether", "option", "tradeoff", "should i", "should we"])) {
    return "decision";
  }

  return "general";
}

function workStructureLabel(structureType: WorkStructureType): string {
  switch (structureType) {
    case "essay":
      return "Essay Work Order";
    case "startup":
      return "Startup Work Order";
    case "research":
      return "Research Work Order";
    case "decision":
      return "Decision Work Order";
    case "general":
      return "Thinking Work Order";
  }
}

function workStructureDescription(structureType: WorkStructureType): string {
  switch (structureType) {
    case "essay":
      return "A live order for turning the idea into a defensible essay argument.";
    case "startup":
      return "A live order for turning the idea into a testable startup thesis.";
    case "research":
      return "A live order for turning the idea into a rigorous research plan.";
    case "decision":
      return "A live order for turning the idea into a clear choice with tradeoffs.";
    case "general":
      return "A live order for making the idea sharper and less fragile.";
  }
}

function workStructureDefinitions(structureType: WorkStructureType): WorkStructureStepDefinition[] {
  switch (structureType) {
    case "essay":
      return [
        step("bound_topic", "Bound the topic", "Make the scope precise enough to argue.", ["bound", "broad", "define", "scope", "topic"], ["question", "assumption"], 78, 42, [
          choice("definition", "Definition choice", "Pick the term or boundary that must become explicit."),
          choice("scope", "Scope choice", "Decide what the essay will exclude so the argument stays workable."),
        ]),
        step("assignment_fit", "Confirm assignment fit", "Check that the project fits the course constraints.", ["assignment", "course", "expos", "program", "tolerates", "requires"], ["assumption"], 74, 38, [
          choice("constraint", "Constraint choice", "Name the assignment rule this step must satisfy."),
          choice("risk", "Risk choice", "Identify what would make the project unacceptable or too broad."),
        ]),
        step("specific_evidence", "Find specific evidence", "Ground the argument in concrete observations instead of generic critique.", ["evidence", "specific", "primary", "observations", "generic"], ["assumption", "belief"], 82, 48, [
          choice("source", "Source choice", "Choose the Harvard-specific material this step needs."),
          choice("gap", "Gap choice", "Name the missing observation that would change the argument."),
        ]),
        step("working_thesis", "Shape the working thesis", "Turn the scoped idea into a claim the essay can defend.", ["thesis", "claim", "argue", "viable", "project"], ["belief"], 70, 34, [
          choice("thesis", "Thesis choice", "State the strongest current version of the argument."),
          choice("stakes", "Stakes choice", "Name why this argument matters beyond the assignment."),
        ]),
        step("pressure_test", "Pressure-test the weak link", "Attack the most load-bearing fragile assumption before building around it.", ["fragile", "load-bearing", "risk", "assumption", "test"], ["assumption"], 90, 70, [
          choice("defend", "Defend choice", "Decide what evidence would defend the assumption."),
          choice("revise", "Revise choice", "Decide how the claim should narrow if the critique lands."),
        ]),
        step("counterargument", "Handle counterargument", "Keep the strongest objection visible until it is answered or absorbed.", ["counterargument", "challenge", "critique", "objection", "polemical"], ["belief", "question"], 84, 64, [
          choice("objection", "Objection choice", "Pick the counterargument that would most damage the essay."),
          choice("response", "Response choice", "Choose whether to defend, revise, or absorb the objection."),
        ]),
        step("essay_outline", "Convert to essay outline", "Only compile the argument after the fragile parts have been worked.", ["outline", "artifact", "conclusion", "paragraph"], ["belief", "assumption"], 52, 18, [
          choice("order", "Order choice", "Arrange the worked claims into the eventual essay sequence."),
          choice("brief", "Brief choice", "Summarize the current argument and remaining risks."),
        ]),
      ];
    case "startup":
      return [
        step("customer", "Identify the customer", "Name who has the painful situation.", ["customer", "user", "founder", "buyer", "segment"], ["assumption"], 82, 46, [
          choice("segment", "Segment choice", "Pick the narrowest customer segment worth testing."),
          choice("pain", "Pain choice", "Name the urgent pain in that segment."),
        ]),
        step("pain", "Validate the pain", "Separate admired ideas from urgent problems.", ["pain", "urgent", "problem", "workflow", "pay"], ["assumption"], 90, 66, [
          choice("evidence", "Evidence choice", "Choose what would prove the pain is real."),
          choice("failure", "Failure choice", "Name what would disprove the pain."),
        ]),
        step("wedge", "Clarify the wedge", "Make the first product surface smaller and testable.", ["wedge", "product", "feature", "mvp", "first"], ["belief", "assumption"], 76, 44, [
          choice("entry", "Entry choice", "Choose the first workflow Penny should own."),
          choice("limit", "Limit choice", "Name what this version will not do."),
        ]),
        step("business_model", "Check willingness to pay", "Test whether the urgency supports payment.", ["revenue", "pricing", "pay", "budget", "willingness"], ["assumption"], 88, 64, [
          choice("moment", "Moment choice", "Name the moment when payment would be natural."),
          choice("buyer", "Buyer choice", "Name who controls the budget."),
        ]),
        step("challenge", "Pressure-test the riskiest claim", "Attack the assumption that the rest of the startup depends on.", ["challenge", "risk", "fragile", "assumption"], ["assumption"], 92, 70, [
          choice("defend", "Defend choice", "Choose evidence that would defend the claim."),
          choice("revise", "Revise choice", "Narrow the claim if it overreaches."),
        ]),
        step("artifact", "Compile the current thesis", "Turn the worked state into an Idea Map and Challenge Brief.", ["artifact", "brief", "map", "summary"], ["belief"], 54, 18, [
          choice("map", "Map choice", "Choose the claims that belong in the current idea map."),
          choice("brief", "Brief choice", "Capture the strongest challenge and response."),
        ]),
      ];
    case "research":
      return [
        step("question", "Narrow the question", "Make the research question answerable.", ["question", "scope", "narrow", "hypothesis"], ["question"], 86, 56, [
          choice("scope", "Scope choice", "Pick the population, case, or time window."),
          choice("outcome", "Outcome choice", "Name the thing the research must explain."),
        ]),
        step("literature", "Locate the precedent", "Find what existing work already claims.", ["literature", "precedent", "prior", "study"], ["belief"], 70, 40, [
          choice("source", "Source choice", "Choose the body of work to compare against."),
          choice("gap", "Gap choice", "Name the gap this project might fill."),
        ]),
        step("method", "Choose the method", "Match the claim to evidence that can actually test it.", ["method", "data", "experiment", "interview", "measure"], ["assumption"], 84, 58, [
          choice("measure", "Measure choice", "Pick the observable signal."),
          choice("design", "Design choice", "Choose how the signal would be collected."),
        ]),
        step("challenge", "Pressure-test validity", "Attack confounds and causal overreach.", ["validity", "confound", "bias", "challenge"], ["assumption", "question"], 92, 70, [
          choice("confound", "Confound choice", "Name the rival explanation."),
          choice("revision", "Revision choice", "Narrow the research claim if needed."),
        ]),
        step("plan", "Compile the research plan", "Turn resolved pieces into a working plan.", ["plan", "outline", "artifact"], ["belief"], 52, 18, [
          choice("sequence", "Sequence choice", "Arrange question, method, evidence, and risk."),
          choice("risk", "Risk choice", "Keep unresolved validity risks visible."),
        ]),
      ];
    case "decision":
      return [
        step("options", "Clarify the options", "Name the real choices on the table.", ["option", "choose", "alternative", "decision"], ["belief", "question"], 82, 48, [
          choice("option", "Option choice", "Pick the option that needs definition."),
          choice("constraint", "Constraint choice", "Name any non-negotiable constraint."),
        ]),
        step("criteria", "Rank the criteria", "Decide what makes one option better.", ["criteria", "tradeoff", "value", "cost"], ["assumption"], 84, 54, [
          choice("criterion", "Criterion choice", "Choose the criterion that matters most."),
          choice("weight", "Weight choice", "Explain why it should outrank the others."),
        ]),
        step("evidence", "Test key assumptions", "Check the assumptions that would flip the decision.", ["evidence", "test", "assumption", "risk"], ["assumption"], 90, 68, [
          choice("test", "Test choice", "Choose the fact that would change the decision."),
          choice("threshold", "Threshold choice", "Name what result would be enough."),
        ]),
        step("tradeoff", "Handle the tradeoff", "Make the strongest downside explicit.", ["tradeoff", "downside", "risk", "challenge"], ["belief", "question"], 82, 62, [
          choice("downside", "Downside choice", "Pick the downside that needs a response."),
          choice("response", "Response choice", "Decide whether to accept, reduce, or avoid it."),
        ]),
        step("decision_brief", "Compile decision brief", "Summarize the choice, evidence, and remaining risk.", ["brief", "summary", "artifact"], ["belief"], 52, 18, [
          choice("recommendation", "Recommendation choice", "State the current best choice."),
          choice("risk", "Risk choice", "Keep the unresolved risk attached."),
        ]),
      ];
    case "general":
      return [
        step("clarify", "Clarify the claim", "Make the idea specific enough to work on.", ["claim", "clarify", "scope", "define"], ["belief", "question"], 82, 48, [
          choice("scope", "Scope choice", "Pick what needs to become more specific."),
          choice("definition", "Definition choice", "Name the term that needs a boundary."),
        ]),
        step("assumptions", "Find assumptions", "Expose what the idea depends on.", ["assumption", "depends", "because"], ["assumption"], 86, 58, [
          choice("dependency", "Dependency choice", "Pick the dependency that carries the most weight."),
          choice("fragility", "Fragility choice", "Name why it could fail."),
        ]),
        step("evidence", "Seek evidence", "Ground the idea in observations or sources.", ["evidence", "source", "example", "observation"], ["assumption", "belief"], 80, 46, [
          choice("source", "Source choice", "Choose the evidence this claim needs."),
          choice("gap", "Gap choice", "Name the missing fact."),
        ]),
        step("challenge", "Pressure-test the idea", "Attack the most fragile load-bearing point.", ["challenge", "risk", "counter", "fragile"], ["assumption", "question"], 92, 70, [
          choice("objection", "Objection choice", "Pick the strongest challenge."),
          choice("response", "Response choice", "Decide whether to defend, revise, or absorb it."),
        ]),
        step("artifact", "Compile the current state", "Turn the worked graph into a useful artifact.", ["artifact", "brief", "map", "summary"], ["belief"], 52, 18, [
          choice("map", "Map choice", "Choose the claims that should be carried forward."),
          choice("brief", "Brief choice", "Summarize changes and unresolved risks."),
        ]),
      ];
  }
}

function step(
  id: string,
  title: string,
  purpose: string,
  keywords: string[],
  preferredKinds: string[],
  baseImportance: number,
  baseFragility: number,
  choices: WorkStructureStepDefinition["choices"],
): WorkStructureStepDefinition {
  return {
    id,
    title,
    purpose,
    keywords,
    preferredKinds,
    baseImportance,
    baseFragility,
    choices,
  };
}

function choice(id: string, label: string, description: string) {
  return {
    id,
    label,
    description,
  };
}

function selectClaimsForStep(
  definition: WorkStructureStepDefinition,
  context: {
    graph: SessionGraphPayload;
    autopilot: ThinkingModeStateResponse;
    activeChallenge: SessionCockpitChallengeRound | null;
    activeClaimId: EntityId | null;
  },
): CockpitClaim[] {
  const claims = context.graph.ideaMap.claims;
  const matched = claims.filter((claim) => {
    const text = claim.text.toLowerCase();

    return (
      definition.preferredKinds.includes(claim.kind) ||
      definition.keywords.some((keyword) => text.includes(keyword))
    );
  });
  const activeClaims = stepMatchesActiveFocus(definition.id, context)
    ? claims.filter(
        (claim) =>
          claim.id === context.activeClaimId ||
          claim.id === context.activeChallenge?.targetClaimId ||
          claim.id === context.autopilot.selectedCandidate?.targetClaimId,
      )
    : [];
  const specialized = specializedClaimsForStep(definition.id, claims, context.graph.ideaMap.edges);
  const combined = uniqueClaims([...activeClaims, ...specialized, ...matched]);

  if (combined.length > 0) {
    return combined.slice(0, 5);
  }

  return claims.slice(0, 3);
}

function stepMatchesActiveFocus(
  stepId: string,
  context: {
    autopilot: ThinkingModeStateResponse;
    activeChallenge: SessionCockpitChallengeRound | null;
  },
): boolean {
  const action = context.activeChallenge ? "challenge" : context.autopilot.selectedCandidate?.action ?? null;

  switch (action) {
    case "challenge":
    case "resume_open_challenge":
      return hasAny(stepId, ["challenge", "pressure", "counterargument", "tradeoff", "validity"]);
    case "verify":
      return hasAny(stepId, ["evidence", "method", "assignment_fit", "business_model"]);
    case "learn":
      return hasAny(stepId, ["literature", "clarify", "question"]);
    case "clarify":
      return hasAny(stepId, ["bound", "clarify", "question", "options", "customer", "wedge"]);
    default:
      return false;
  }
}

function specializedClaimsForStep(stepId: string, claims: CockpitClaim[], edges: CockpitEdge[]): CockpitClaim[] {
  if (stepId.includes("pressure") || stepId === "challenge" || stepId.includes("evidence")) {
    return [...claims].sort((left, right) => claimFragility(right, edges) - claimFragility(left, edges)).slice(0, 3);
  }

  if (stepId.includes("counterargument") || stepId.includes("tradeoff")) {
    const challengedClaimIds = new Set(
      edges
        .filter((edge) => edge.kind === "challenges" || edge.kind === "contradicts")
        .flatMap((edge) => [edge.fromClaimId, edge.toClaimId]),
    );

    return claims.filter((claim) => challengedClaimIds.has(claim.id));
  }

  if (stepId.includes("outline") || stepId.includes("artifact") || stepId.includes("brief") || stepId.includes("plan")) {
    return claims.slice(0, 5);
  }

  return [];
}

function selectEdgesForStep(
  definition: WorkStructureStepDefinition,
  context: { graph: SessionGraphPayload; activeEdgeId: EntityId | null },
  claimIds: EntityId[],
): EntityId[] {
  const claimIdSet = new Set(claimIds);
  const edges = context.graph.ideaMap.edges.filter((edge) => {
    const touchesClaim = claimIdSet.has(edge.fromClaimId) || claimIdSet.has(edge.toClaimId);
    const matchesChallenge =
      definition.id.includes("challenge") || definition.id.includes("counterargument") || definition.id.includes("tradeoff");

    return touchesClaim && (!matchesChallenge || edge.kind === "challenges" || edge.kind === "contradicts");
  });
  const edgeIds = uniqueStrings(edges.map((edge) => edge.id)).sort(
    (left, right) => Number(right === context.activeEdgeId) - Number(left === context.activeEdgeId),
  );

  return edgeIds.slice(0, 6);
}

function claimFragility(claim: CockpitClaim, edges: CockpitEdge[]): number {
  const confidence = typeof claim.confidence === "number" ? claim.confidence : 60;
  const challenged = edges.some(
    (edge) =>
      (edge.kind === "challenges" || edge.kind === "contradicts") &&
      (edge.fromClaimId === claim.id || edge.toClaimId === claim.id),
  );
  const hasSupport = edges.some((edge) => edge.kind === "supports" && edge.toClaimId === claim.id);
  let value = 0;

  if (claim.kind === "assumption") {
    value += 28;
  }

  if (claim.kind === "question") {
    value += 18;
  }

  if (confidence < 65) {
    value += 65 - confidence;
  }

  if (confidence >= 80 && !hasSupport) {
    value += 20;
  }

  if (challenged) {
    value += 44;
  }

  if (claim.status === "rejected") {
    value -= 30;
  }

  if (claim.status === "resolved") {
    value -= 22;
  }

  return clampScore(value);
}

function claimDependencyWeight(claim: CockpitClaim, edges: CockpitEdge[]): number {
  return edges.filter((edge) => edge.fromClaimId === claim.id || edge.toClaimId === claim.id).length * 6;
}

function workStructureStepStatus(
  active: boolean,
  fragility: number,
  claims: CockpitClaim[],
  moves: SessionGraphPayload["moves"],
): WorkStructureStepStatus {
  if (active) {
    return "active";
  }

  if (claims.some((claim) => claim.status === "resolved") || fragility < 34) {
    return "resolved";
  }

  if (moves.length > 0 && fragility > 74) {
    return "stale";
  }

  return "not_started";
}

function whyThisStep(
  definition: WorkStructureStepDefinition,
  claims: CockpitClaim[],
  context: {
    autopilot: ThinkingModeStateResponse;
    activeChallenge: SessionCockpitChallengeRound | null;
    activeClaimId: EntityId | null;
  },
  fragility: number,
  importance: number,
): string {
  const activeClaim = claims.find((claim) => claim.id === context.activeClaimId);

  if (context.activeChallenge && claims.some((claim) => claim.id === context.activeChallenge?.targetClaimId)) {
    return context.activeChallenge.whyThis;
  }

  if (activeClaim && context.autopilot.selectedCandidate?.reason) {
    return context.autopilot.selectedCandidate.reason;
  }

  const fragileClaim = [...claims].sort((left, right) => (right.confidence ?? 60) - (left.confidence ?? 60))[0];

  if (fragility >= 70 && fragileClaim) {
    return `This is fragile because it depends on "${clipText(fragileClaim.text, 110)}".`;
  }

  if (importance >= 80) {
    return "This step is load-bearing for the current structure.";
  }

  return definition.purpose;
}

function uniqueClaims(claims: CockpitClaim[]): CockpitClaim[] {
  const seen = new Set<EntityId>();
  const unique: CockpitClaim[] = [];

  for (const claim of claims) {
    if (!seen.has(claim.id)) {
      seen.add(claim.id);
      unique.push(claim);
    }
  }

  return unique;
}

function hasAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function uniqueStrings(values: ReadonlyArray<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clipText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function brainIdForSessionAlias(sessionId: EntityId): EntityId {
  return sessionId;
}

async function parseJsonRequest<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
): Promise<{ ok: true; data: z.infer<Schema> } | { ok: false; response: Response }> {
  const bodyResult = await readJsonBody(request);

  if (!bodyResult.ok) {
    return {
      ok: false,
      response: invalidRequest("Request body must be valid JSON.", [bodyResult.message]),
    };
  }

  const parsed = schema.safeParse(bodyResult.body);

  if (!parsed.success) {
    return {
      ok: false,
      response: invalidRequest(
        "Request body failed validation.",
        parsed.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`),
      ),
    };
  }

  return {
    ok: true,
    data: parsed.data,
  };
}

async function readJsonBody(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; message: string }> {
  const text = await request.text();

  if (!text.trim()) {
    return { ok: true, body: {} };
  }

  try {
    return {
      ok: true,
      body: JSON.parse(text) as unknown,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function resolveService(options: SessionCockpitRouteOptions): SessionCockpitRouteService {
  if (options.service) {
    return options.service;
  }

  return new SessionCockpitService(options.db ?? createPennyDb(options.databaseUrl));
}

function sessionAdapterErrorResponse(error: unknown): Response {
  if (
    error instanceof ThinkingModeNotFoundError ||
    error instanceof BrainRepositoryNotFoundError ||
    error instanceof SessionGraphNotFoundError
  ) {
    return jsonResponse(
      {
        error: {
          code: "session_adapter_not_found",
          message: error.message,
        },
      },
      404,
    );
  }

  if (
    error instanceof ThinkingModeConflictError ||
    error instanceof BrainRepositoryConflictError ||
    error instanceof SessionGraphConflictError
  ) {
    return jsonResponse(
      {
        error: {
          code: "session_adapter_conflict",
          message: error.message,
        },
      },
      409,
    );
  }

  return jsonResponse(
    {
      error: {
        code: "session_adapter_error",
        message: error instanceof Error ? error.message : String(error),
      },
    },
    500,
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function methodNotAllowed(message: string, allow: string): Response {
  return jsonResponse(
    {
      error: {
        code: "method_not_allowed",
        message,
      },
    },
    405,
    { allow },
  );
}

function invalidRequest(message: string, issues: ReadonlyArray<string>): Response {
  return jsonResponse(
    {
      error: {
        code: "invalid_request",
        message,
        issues,
      },
    },
    400,
  );
}

function jsonResponse(payload: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}
