import { prisma } from "@/db/prisma";
import { logger } from "@/lib/logger";
import { buildPennyLens } from "@/lib/penny-insights";
import { evaluateMetaCognitionTrigger, type MetaCognitionPromptSnapshot } from "@/lib/meta-cognition";
import {
  createThoughtMap,
  getThoughtMap,
  recordConfidenceOverride,
  recordDialecticRound,
  recordSteelMan,
  generateArtifactForMap,
} from "@/server/thought-map";
import {
  closeThinkingSession,
  createThinkingSession,
  getActiveThinkingSession,
} from "@/server/penny";
import { getCurrentAuthenticatedUserId } from "@/server/auth";
import type {
  ArtifactRecord,
  ArtifactTypeId,
  ClaimCaptureMetadata,
  DialecticRound,
  SteelMan,
  ThoughtMapEvent,
  ThoughtMapModel,
  ThoughtNodeModel,
  ThinkingSession,
} from "@/types/thought-map";
import type { SessionState } from "@/types/penny";
import type { CreateThoughtMapInput } from "@/types/thought-map";
import type { PennyShape } from "@/lib/penny-insights";

export type Map = ThoughtMapModel;
export type Claim = ThoughtNodeModel;
export type Move = ThoughtMapEvent;
export type Artifact = ArtifactRecord;
export type LearningPrompt = MetaCognitionPromptSnapshot;

export type CreateMapInput = CreateThoughtMapInput;
export type UpdateMapInput = {
  title?: string;
  rawThought?: string;
  status?: ThoughtMapModel["status"];
};

export type CreateClaimInput = {
  content: string;
  note?: string | null;
  parentId?: string | null;
  kind?: ThoughtNodeModel["kind"];
  nodeStatus?: ThoughtNodeModel["nodeStatus"];
  branchOrder?: number;
  structureKind?: ClaimCaptureMetadata["structureKind"];
};

export type UpdateClaimInput = {
  content?: string;
  note?: string | null;
  nodeStatus?: ThoughtNodeModel["nodeStatus"];
};

export type CreateRoundInput = {
  mapId: string;
  claimId?: string | null;
  round: string;
  roundIndex: number;
  title: string;
  critiqueStrength: string;
  critiqueType?: string | null;
  critiqueFailureTypes?: string[];
  critiqueMode?: "direct" | "socratic" | "red_team" | null;
  voiceLabel?: string | null;
  prompt: string;
  why: string;
  responsePath: "defend" | "revise" | "absorb";
  response: string;
  confidenceAtRoundEnd?: number | null;
};

export type RoundResponseInput = {
  userResponse: string;
  newConfidence: number;
  confidenceChangeReason?: string | null;
};

export type RecordMoveInput = {
  mapId: string;
  nodeId?: string | null;
  eventType: ThoughtMapEvent["eventType"];
  payload?: Record<string, unknown> | null;
};

export type CreateArtifactInput = {
  mapId: string;
  artifactTypeId: ArtifactTypeId;
  audience?: string | null;
  sectionOrder?: string[];
  narrativeGlue?: string | null;
  userId?: string;
};

export type StartSessionInput = {
  userId: string;
  data: {
    declaredIntention: string;
    intentionType: SessionState["intentionType"];
    scopedClaimIds?: string[];
    timeBudgetMinutes?: number | null;
    mapId?: string | null;
  };
};

export type CloseSessionInput = {
  sessionId: string;
  data: {
    skipClosingRitual?: boolean;
    questionsAnswered: Array<{ question: string; answer: string }>;
    openItemsNoted: string[];
    nextSessionIntention?: string | null;
    energyRating: SessionState["energyRating"];
    focusRating: SessionState["focusRating"];
    productivityRating: number | null;
  };
};

export type CreateLearningPromptInput = {
  mapId: string;
  nodeId?: string | null;
  shapes?: PennyShape[];
  userId?: string;
};

function mapNodeKindFromStructureKind(structureKind?: string): ThoughtNodeModel["kind"] {
  if (structureKind === "conditional") {
    return "assumption";
  }

  if (structureKind === "temporal") {
    return "why_it_matters";
  }

  return "core_claim";
}

async function ensureMapAccess(mapId: string, userId: string) {
  const map = await getThoughtMap(mapId, userId);
  if (!map) {
    throw new Error("Map not found");
  }
  return map;
}

export async function createMap(userId: string, data: CreateMapInput): Promise<Map> {
  const startedAt = Date.now();
  const map = await createThoughtMap(data, userId);
  logger.info("mvp_create_map", {
    userId,
    featureId: "server-mvp",
    durationMs: Date.now() - startedAt,
    data: { mapId: map.id },
  });
  return map;
}

export async function getMap(mapId: string, userId: string): Promise<Map | null> {
  return getThoughtMap(mapId, userId);
}

export async function getMapsForUser(userId: string, options?: { limit?: number }): Promise<Map[]> {
  const ids = await prisma.thoughtMap.findMany({
    where: { userId },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
    take: options?.limit,
  });

  const maps = await Promise.all(ids.map((entry) => getThoughtMap(entry.id, userId)));
  return maps.filter(Boolean) as Map[];
}

export async function updateMap(mapId: string, userId: string, data: UpdateMapInput): Promise<Map> {
  const startedAt = Date.now();
  await ensureMapAccess(mapId, userId);
  await prisma.thoughtMap.update({
    where: { id: mapId },
    data: {
      title: data.title,
      rawThought: data.rawThought,
      status: data.status,
    },
  });
  const updated = await ensureMapAccess(mapId, userId);
  logger.info("mvp_update_map", {
    userId,
    featureId: "server-mvp",
    durationMs: Date.now() - startedAt,
    data: { mapId },
  });
  return updated;
}

export async function archiveMap(mapId: string, userId: string): Promise<void> {
  const startedAt = Date.now();
  await ensureMapAccess(mapId, userId);
  await prisma.thoughtMap.update({
    where: { id: mapId },
    data: { status: "archived" },
  });
  logger.info("mvp_archive_map", {
    userId,
    featureId: "server-mvp",
    durationMs: Date.now() - startedAt,
    data: { mapId },
  });
}

export async function createClaim(userId: string, mapId: string, data: CreateClaimInput): Promise<Claim> {
  const startedAt = Date.now();
  const map = await ensureMapAccess(mapId, userId);
  const root = map.nodes.find((node) => node.kind === "root") ?? map.nodes[0] ?? null;
  if (!root) {
    throw new Error("Map root not found");
  }

  const created = await prisma.thoughtNode.create({
    data: {
      mapId,
      parentId: data.parentId ?? root.id,
      kind: data.kind ?? mapNodeKindFromStructureKind(data.structureKind),
      nodeStatus: data.nodeStatus ?? "active",
      content: data.content,
      note: data.note ?? null,
      branchOrder: data.branchOrder ?? map.nodes.length,
    },
  });

  logger.info("mvp_create_claim", {
    userId,
    featureId: "server-mvp",
    durationMs: Date.now() - startedAt,
    data: { mapId, claimId: created.id },
  });

  return created as Claim;
}

export async function getClaim(claimId: string, userId: string): Promise<Claim | null> {
  const maps = await getMapsForUser(userId);
  for (const map of maps) {
    const claim = map.nodes.find((node) => node.id === claimId);
    if (claim) {
      return claim;
    }
  }
  return null;
}

export async function getClaimsForMap(mapId: string, userId: string): Promise<Claim[]> {
  const map = await ensureMapAccess(mapId, userId);
  return map.nodes.filter((node) => node.kind !== "root");
}

export async function updateClaim(claimId: string, userId: string, data: UpdateClaimInput): Promise<Claim> {
  const startedAt = Date.now();
  const map = await getMapsForUser(userId);
  const owningMap = map.find((candidate) => candidate.nodes.some((node) => node.id === claimId));
  if (!owningMap) {
    throw new Error("Claim not found");
  }

  await prisma.thoughtNode.update({
    where: { id: claimId },
    data: {
      content: data.content,
      note: data.note,
      nodeStatus: data.nodeStatus,
    },
  });

  const updated = await getClaim(claimId, userId);
  if (!updated) {
    throw new Error("Claim not found after update");
  }

  logger.info("mvp_update_claim", {
    userId,
    featureId: "server-mvp",
    durationMs: Date.now() - startedAt,
    data: { claimId, mapId: owningMap.id },
  });
  return updated;
}

export async function updateConfidence(claimId: string, userId: string, confidence: number, reason: string | null): Promise<Claim> {
  const map = await getMapsForUser(userId);
  const owningMap = map.find((candidate) => candidate.nodes.some((node) => node.id === claimId));
  if (!owningMap) {
    throw new Error("Claim not found");
  }

  const mode = confidence >= 50 ? "hold" : "reduce";
  await recordConfidenceOverride({
    mapId: owningMap.id,
    sourceNodeId: claimId,
    targetNodeId: claimId,
    mode,
    reasoning: reason ?? "Updated confidence",
  });

  const updated = await getClaim(claimId, userId);
  if (!updated) {
    throw new Error("Claim not found after confidence update");
  }
  return updated;
}

export async function createSteelMan(claimId: string, userId: string, text: string): Promise<SteelMan> {
  const map = await getMapsForUser(userId);
  const owningMap = map.find((candidate) => candidate.nodes.some((node) => node.id === claimId));
  if (!owningMap) {
    throw new Error("Claim not found");
  }

  const result = await recordSteelMan({
    mapId: owningMap.id,
    claimId,
    steelManText: text,
    userId,
  });
  return result.steelMan;
}

export async function getSteelMan(claimId: string): Promise<SteelMan | null> {
  const userId = await getCurrentAuthenticatedUserId();
  const maps = await getMapsForUser(userId);
  for (const map of maps) {
    const steelMan = map.steelMans.find((item) => item.claimId === claimId);
    if (steelMan) {
      return steelMan;
    }
  }
  return null;
}

export async function updateSteelMan(steelManId: string, userId: string, text: string): Promise<SteelMan> {
  const maps = await getMapsForUser(userId);
  const owningMap = maps.find((candidate) => candidate.steelMans.some((steelMan) => steelMan.id === steelManId));
  if (!owningMap) {
    throw new Error("Steel man not found");
  }

  const steelMan = owningMap.steelMans.find((item) => item.id === steelManId);
  if (!steelMan) {
    throw new Error("Steel man not found");
  }

  const result = await recordSteelMan({
    mapId: owningMap.id,
    claimId: steelMan.claimId,
    steelManText: text,
    userId,
  });
  return result.steelMan;
}

export async function createDialecticRound(data: CreateRoundInput): Promise<DialecticRound> {
  const event = await recordDialecticRound({
    mapId: data.mapId,
    nodeId: data.claimId ?? null,
    round: data.round,
    roundIndex: data.roundIndex,
    title: data.title,
    critiqueStrength: data.critiqueStrength,
    critiqueType: data.critiqueType ?? null,
    critiqueFailureTypes: data.critiqueFailureTypes ?? [],
    critiqueMode: data.critiqueMode ?? null,
    voiceLabel: data.voiceLabel ?? null,
    prompt: data.prompt,
    why: data.why,
    responsePath: data.responsePath,
    response: data.response,
    confidenceAtRoundEnd: data.confidenceAtRoundEnd ?? null,
  });

  const round = event.payload?.dialecticRound;
  if (!round) {
    throw new Error("Dialectic round was not stored");
  }

  return round as DialecticRound;
}

export async function getDialecticRoundsForClaim(claimId: string): Promise<DialecticRound[]> {
  const events = await prisma.thoughtMapEvent.findMany({
    where: { nodeId: claimId, eventType: "dialectic_round" },
    orderBy: { createdAt: "asc" },
  });

  return events
    .map((event) => {
      const payload = event.payload && typeof event.payload === "object" ? (event.payload as Record<string, unknown>) : null;
      const round = payload?.dialecticRound && typeof payload.dialecticRound === "object" ? (payload.dialecticRound as DialecticRound) : null;
      return round;
    })
    .filter((round): round is DialecticRound => round !== null);
}

export async function submitRoundResponse(roundId: string, userId: string, data: RoundResponseInput): Promise<DialecticRound> {
  const event = await prisma.thoughtMapEvent.findUnique({ where: { id: roundId } });
  if (!event || event.eventType !== "dialectic_round") {
    throw new Error("Round not found");
  }
  const payload = event.payload && typeof event.payload === "object" ? (event.payload as Record<string, unknown>) : {};
  const existingRound = payload.dialecticRound && typeof payload.dialecticRound === "object" ? (payload.dialecticRound as Record<string, unknown>) : null;
  if (!existingRound) {
    throw new Error("Round payload missing");
  }

  const updatedRound = {
    ...existingRound,
    userResponse: data.userResponse,
    confidenceAtRoundEnd: data.newConfidence,
    closedAt: new Date().toISOString(),
    confidenceChangeReason: data.confidenceChangeReason ?? null,
  };

  await prisma.thoughtMapEvent.update({
    where: { id: roundId },
    data: {
      payload: JSON.stringify({
        ...payload,
        dialecticRound: updatedRound,
      }),
    },
  });

  logger.info("mvp_submit_round_response", {
    userId,
    featureId: "server-mvp",
    data: { roundId },
  });
  return updatedRound as unknown as DialecticRound;
}

export async function closeRound(roundId: string): Promise<DialecticRound> {
  const event = await prisma.thoughtMapEvent.findUnique({ where: { id: roundId } });
  if (!event || event.eventType !== "dialectic_round") {
    throw new Error("Round not found");
  }
  const payload = event.payload && typeof event.payload === "object" ? (event.payload as Record<string, unknown>) : {};
  const round = payload.dialecticRound && typeof payload.dialecticRound === "object" ? (payload.dialecticRound as Record<string, unknown>) : null;
  if (!round) {
    throw new Error("Round payload missing");
  }
  const updatedRound = { ...round, closedAt: new Date().toISOString() };
  await prisma.thoughtMapEvent.update({
    where: { id: roundId },
    data: { payload: JSON.stringify({ ...payload, dialecticRound: updatedRound }) },
  });
  return updatedRound as unknown as DialecticRound;
}

export async function recordMove(data: RecordMoveInput): Promise<Move> {
  const created = await prisma.thoughtMapEvent.create({
    data: {
      mapId: data.mapId,
      nodeId: data.nodeId ?? null,
      eventType: data.eventType,
      payload: data.payload ? JSON.stringify(data.payload) : null,
    },
  });
  return created as Move;
}

export async function getMovesForUser(userId: string, limit = 100): Promise<Move[]> {
  const maps = await prisma.thoughtMap.findMany({
    where: { userId },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
  });

  const events = await prisma.thoughtMapEvent.findMany({
    where: { mapId: { in: maps.map((map) => map.id) } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return events as Move[];
}

export async function getMovesForClaim(claimId: string): Promise<Move[]> {
  const events = await prisma.thoughtMapEvent.findMany({
    where: { nodeId: claimId },
    orderBy: { createdAt: "asc" },
  });
  return events as Move[];
}

export async function createArtifact(data: CreateArtifactInput): Promise<Artifact> {
  const result = await generateArtifactForMap({
    mapId: data.mapId,
    artifactTypeId: data.artifactTypeId,
    audience: data.audience ?? null,
    sectionOrder: data.sectionOrder,
    narrativeGlue: data.narrativeGlue ?? null,
    userId: data.userId,
  });
  return result.artifact;
}

export async function getArtifactsForMap(mapId: string, userId: string): Promise<Artifact[]> {
  const map = await ensureMapAccess(mapId, userId);
  return map.artifacts;
}

export async function getArtifact(artifactId: string, userId: string): Promise<Artifact | null> {
  const maps = await getMapsForUser(userId);
  for (const map of maps) {
    const artifact = map.artifacts.find((item) => item.id === artifactId);
    if (artifact) {
      return artifact;
    }
  }
  return null;
}

export async function startSession(userId: string, data: StartSessionInput["data"]): Promise<ThinkingSession> {
  return (await createThinkingSession({
    userId,
    mapId: data.mapId ?? null,
    declaredIntention: data.declaredIntention,
    intentionType: data.intentionType,
    scopedClaimIds: data.scopedClaimIds ?? [],
    timeBudgetMinutes: data.timeBudgetMinutes ?? null,
  })) as ThinkingSession;
}

export async function closeSession(sessionId: string, data: CloseSessionInput["data"]): Promise<ThinkingSession> {
  return (await closeThinkingSession({
    sessionId,
    skipClosingRitual: Boolean(data.skipClosingRitual),
    closingRitual: {
      questionsAnswered: data.questionsAnswered,
      openItemsNoted: data.openItemsNoted,
      nextSessionIntention: data.nextSessionIntention ?? null,
    },
    energyRating: data.energyRating,
    focusRating: data.focusRating,
    productivityRating: data.productivityRating,
  })) as ThinkingSession;
}

export async function getCurrentSession(userId: string): Promise<ThinkingSession | null> {
  return (await getActiveThinkingSession({ mapId: null, userId })) as ThinkingSession | null;
}

export async function createLearningPrompt(data: CreateLearningPromptInput): Promise<LearningPrompt> {
  const userId = data.userId ?? (await getCurrentAuthenticatedUserId());
  const map = await getMap(data.mapId, userId);
  if (!map) {
    throw new Error("Map not found");
  }

  const node = data.nodeId ? map.nodes.find((candidate) => candidate.id === data.nodeId) ?? null : null;
  const prompt = evaluateMetaCognitionTrigger({
    map,
    node,
    shapes: data.shapes ?? buildPennyLens(map).effectiveShapes,
  });

  if (!prompt) {
    throw new Error("Learning prompt not available");
  }

  return prompt;
}

export async function markLearningPromptEngaged(promptId: string): Promise<void> {
  logger.info("mvp_learning_prompt_engaged", {
    featureId: "server-mvp",
    data: { promptId },
  });
}
