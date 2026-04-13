import type { Prisma, ThoughtMap, ThoughtMapIntervention, ThoughtNode } from "@prisma/client";
import { prisma } from "@/db/prisma";
import { buildFounderBrief, getFounderBriefReadiness } from "@/lib/founder-brief";
import { buildThoughtMapActionResult, buildThoughtMapJudgment } from "@/lib/thought-map-judgment";
import {
  createRootNodeContent,
  createThoughtMapTitle,
  getDemoThoughtUserId,
} from "@/lib/thought-map";
import { generateActionNotes, generateInitialBranchNotes } from "@/lib/thought-map-generation";
import { cleanSentence } from "@/lib/penny";
import type {
  CognitiveIntervention,
  CreateThoughtMapInput,
  FounderBriefModel,
  GeneratedActionBundle,
  NodeAction,
  ThoughtMapModel,
  ThoughtMapEventType,
  ThoughtNodeModel,
} from "@/types/thought-map";

function mapNode(record: ThoughtNode): ThoughtNodeModel {
  return {
    id: record.id,
    mapId: record.mapId,
    parentId: record.parentId ?? null,
    kind: record.kind as ThoughtNodeModel["kind"],
    nodeStatus: record.nodeStatus as ThoughtNodeModel["nodeStatus"],
    actionOrigin: (record.actionOrigin as ThoughtNodeModel["actionOrigin"]) ?? null,
    supersedesNodeId: record.supersedesNodeId ?? null,
    content: record.content,
    note: record.note ?? null,
    branchOrder: record.branchOrder,
    scores: null,
    psychology: null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function buildThoughtMapModel(record: ThoughtMap & { nodes: ThoughtNode[] }): ThoughtMapModel {
  const founderBriefPayload = parseJson<Omit<FounderBriefModel, "generatedAt">>(record.founderBrief);
  const founderBrief =
    founderBriefPayload && record.founderBriefGeneratedAt
      ? {
          ...founderBriefPayload,
          generatedAt: record.founderBriefGeneratedAt,
        }
      : null;
  const mapped: ThoughtMapModel = {
    id: record.id,
    userId: record.userId,
    title: record.title,
    rawThought: record.rawThought,
    status: record.status,
    nodes: record.nodes.map(mapNode),
    founderBrief,
    founderBriefReadiness: {
      eligible: false,
      missingRequirements: ["assumption", "counter_argument", "research"],
    },
    graphSnapshot: null,
    recommendedNextMove: null,
    interventions: [],
    recommendedIntervention: null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };

  const judgedMap = {
    ...mapped,
    ...buildThoughtMapJudgment(mapped),
  };

  return {
    ...judgedMap,
    founderBrief,
    founderBriefReadiness: getFounderBriefReadiness(judgedMap),
  };
}

function interventionDedupeKey(intervention: Pick<CognitiveIntervention, "mapId" | "targetNodeId" | "type">) {
  return `${intervention.mapId}:${intervention.targetNodeId}:${intervention.type}`;
}

function serializeJson(value: Record<string, unknown> | null) {
  return value ? JSON.stringify(value) : null;
}

function parseJson<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function mapIntervention(record: ThoughtMapIntervention): CognitiveIntervention {
  const outcomeDelta = parseJson(record.outcomeDelta) as CognitiveIntervention["outcomeDelta"];

  return {
    id: record.id,
    mapId: record.mapId,
    targetNodeId: record.targetNodeId,
    type: record.type as CognitiveIntervention["type"],
    detector: record.detector as CognitiveIntervention["detector"],
    triggerReason: record.triggerReason,
    prompt: record.prompt,
    inputMode: record.inputMode as CognitiveIntervention["inputMode"],
    status: record.status as CognitiveIntervention["status"],
    outcomeDelta,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    shownAt: record.shownAt,
    completedAt: record.completedAt,
    dismissedAt: record.dismissedAt,
  };
}

function psychologyDelta(beforeMap: ThoughtMapModel | null, afterMap: ThoughtMapModel, targetNodeId: string) {
  const before = beforeMap?.nodes.find((node) => node.id === targetNodeId)?.psychology ?? null;
  const after =
    afterMap.nodes.find((node) => node.id === targetNodeId)?.psychology ??
    afterMap.nodes.find((node) => node.supersedesNodeId === targetNodeId)?.psychology ??
    null;

  if (!before || !after) {
    return null;
  }

  return {
    ambiguityScore: Number((after.ambiguityScore - before.ambiguityScore).toFixed(2)),
    comparisonCoverageScore: Number((after.comparisonCoverageScore - before.comparisonCoverageScore).toFixed(2)),
    falsificationCoverageScore: Number((after.falsificationCoverageScore - before.falsificationCoverageScore).toFixed(2)),
    actionabilityScore: Number((after.actionabilityScore - before.actionabilityScore).toFixed(2)),
  };
}

async function createThoughtMapEvent(
  tx: Prisma.TransactionClient,
  input: {
    mapId: string;
    nodeId?: string | null;
    interventionId?: string | null;
    eventType: ThoughtMapEventType;
    payload?: Record<string, unknown> | null;
  },
) {
  await tx.thoughtMapEvent.create({
    data: {
      mapId: input.mapId,
      nodeId: input.nodeId ?? null,
      interventionId: input.interventionId ?? null,
      eventType: input.eventType,
      payload: serializeJson(input.payload ?? null),
    },
  });
}

async function syncThoughtMapInterventions(params: {
  map: ThoughtMapModel;
  beforeMap?: ThoughtMapModel | null;
}) {
  const candidateInterventions = params.map.interventions;
  const candidateKeys = new Set(candidateInterventions.map((intervention) => interventionDedupeKey(intervention)));
  const candidateOrder = new Map(
    candidateInterventions.map((intervention, index) => [interventionDedupeKey(intervention), index]),
  );
  const existing = await prisma.thoughtMapIntervention.findMany({
    where: { mapId: params.map.id },
    orderBy: [{ shownAt: "desc" }],
  });
  const existingByKey = new Map(existing.map((record) => [record.dedupeKey, record]));

  await prisma.$transaction(async (tx) => {
    for (const candidate of candidateInterventions) {
      const dedupeKey = interventionDedupeKey(candidate);
      const existingRecord = existingByKey.get(dedupeKey);

      if (!existingRecord) {
        const created = await tx.thoughtMapIntervention.create({
          data: {
            dedupeKey,
            mapId: candidate.mapId,
            targetNodeId: candidate.targetNodeId,
            type: candidate.type,
            detector: candidate.detector,
            triggerReason: candidate.triggerReason,
            prompt: candidate.prompt,
            inputMode: candidate.inputMode,
            status: "open",
            shownAt: candidate.shownAt,
          },
        });

        await createThoughtMapEvent(tx, {
          mapId: candidate.mapId,
          nodeId: candidate.targetNodeId,
          interventionId: created.id,
          eventType: "intervention_shown",
          payload: {
            type: candidate.type,
            detector: candidate.detector,
          },
        });
        await createThoughtMapEvent(tx, {
          mapId: candidate.mapId,
          nodeId: candidate.targetNodeId,
          interventionId: created.id,
          eventType: "bias_detected",
          payload: {
            detector: candidate.detector,
          },
        });

        continue;
      }

      if (existingRecord.status !== "open") {
        await tx.thoughtMapIntervention.update({
          where: { id: existingRecord.id },
          data: {
            triggerReason: candidate.triggerReason,
            prompt: candidate.prompt,
            inputMode: candidate.inputMode,
            status: "open",
            outcomeDelta: null,
            completedAt: null,
            dismissedAt: null,
            shownAt: new Date(),
          },
        });

        await createThoughtMapEvent(tx, {
          mapId: candidate.mapId,
          nodeId: candidate.targetNodeId,
          interventionId: existingRecord.id,
          eventType: "intervention_shown",
          payload: {
            type: candidate.type,
            detector: candidate.detector,
          },
        });
        await createThoughtMapEvent(tx, {
          mapId: candidate.mapId,
          nodeId: candidate.targetNodeId,
          interventionId: existingRecord.id,
          eventType: "bias_detected",
          payload: {
            detector: candidate.detector,
          },
        });
      }
    }

    for (const record of existing) {
      if (record.status !== "open" || candidateKeys.has(record.dedupeKey)) {
        continue;
      }

      const outcomeDelta = psychologyDelta(params.beforeMap ?? null, params.map, record.targetNodeId);
      await tx.thoughtMapIntervention.update({
        where: { id: record.id },
        data: {
          status: "completed",
          completedAt: new Date(),
          outcomeDelta: serializeJson(outcomeDelta),
        },
      });

      await createThoughtMapEvent(tx, {
        mapId: record.mapId,
        nodeId: record.targetNodeId,
        interventionId: record.id,
        eventType: "intervention_completed",
        payload: outcomeDelta ?? {
          resolved: true,
        },
      });
      await createThoughtMapEvent(tx, {
        mapId: record.mapId,
        nodeId: record.targetNodeId,
        interventionId: record.id,
        eventType: "bias_resolved",
        payload: {
          detector: record.detector,
          outcomeDelta,
        },
      });
    }
  });

  const activeInterventions = await prisma.thoughtMapIntervention.findMany({
    where: {
      mapId: params.map.id,
      status: "open",
    },
    orderBy: [{ shownAt: "desc" }],
  });
  const interventions = activeInterventions
    .sort(
      (a, b) =>
        (candidateOrder.get(a.dedupeKey) ?? Number.MAX_SAFE_INTEGER) -
        (candidateOrder.get(b.dedupeKey) ?? Number.MAX_SAFE_INTEGER),
    )
    .map(mapIntervention);

  return {
    interventions,
    recommendedIntervention: interventions[0] ?? null,
  };
}

async function hydrateThoughtMap(record: ThoughtMap & { nodes: ThoughtNode[] }, beforeMap?: ThoughtMapModel | null) {
  const judgedMap = buildThoughtMapModel(record);
  const interventionState = await syncThoughtMapInterventions({
    map: judgedMap,
    beforeMap,
  });

  return {
    ...judgedMap,
    ...interventionState,
  };
}

export async function listThoughtMaps() {
  const maps = await prisma.thoughtMap.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      nodes: {
        orderBy: [{ branchOrder: "asc" }, { createdAt: "asc" }],
      },
    },
    take: 12,
  });

  return Promise.all(maps.map((map) => hydrateThoughtMap(map)));
}

export async function createThoughtMap(input: CreateThoughtMapInput) {
  const rawThought = cleanSentence(input.rawThought);
  const title = createThoughtMapTitle(rawThought);
  const seedNodes = generateInitialBranchNotes(rawThought);

  const created = await prisma.$transaction(async (tx) => {
    const map = await tx.thoughtMap.create({
      data: {
        userId: getDemoThoughtUserId(),
        title,
        rawThought,
      },
    });

    const root = await tx.thoughtNode.create({
      data: {
        mapId: map.id,
        kind: "root",
        nodeStatus: "active",
        content: createRootNodeContent(rawThought),
        branchOrder: 0,
      },
    });

    await tx.thoughtNode.createMany({
      data: seedNodes.map((node, index) => ({
        mapId: map.id,
        parentId: root.id,
        kind: node.kind,
        nodeStatus: "active",
        content: node.content,
        note: node.note,
        branchOrder: index + 1,
      })),
    });

    return tx.thoughtMap.findUniqueOrThrow({
      where: { id: map.id },
      include: {
        nodes: {
          orderBy: [{ branchOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    });
  });

  return hydrateThoughtMap(created);
}

export async function getThoughtMap(mapId: string) {
  const map = await prisma.thoughtMap.findUnique({
    where: { id: mapId },
    include: {
      nodes: {
        orderBy: [{ branchOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  return map ? hydrateThoughtMap(map) : null;
}

export async function applyNodeAction(params: {
  mapId: string;
  nodeId: string;
  action: NodeAction;
}): Promise<GeneratedActionBundle & { createdNodes: ThoughtNodeModel[]; updatedNodes: ThoughtNodeModel[] }> {
  const map = await getThoughtMap(params.mapId);

  if (!map) {
    throw new Error("Map not found");
  }

  const node = map.nodes.find((candidate) => candidate.id === params.nodeId);

  if (!node) {
    throw new Error("Node not found");
  }

  const generated = generateActionNotes({
    map,
    node,
    action: params.action,
  });
  const persistenceParentId = generated.execution.targetParentId ?? generated.parentNodeId;
  const weakNodeIds = generated.reasoning.graphAnalysis?.weakNodes.map((weakNode) => weakNode.nodeId) ?? [];
  const supersededNodeId =
    generated.execution.mode === "replace_weak_branch" &&
    generated.notes.some((note) => note.kind === generated.execution.targetNodeKind)
      ? generated.execution.supersededNodeId
      : null;

  const lastChildOrder =
    map.nodes
      .filter((candidate) => candidate.parentId === persistenceParentId)
      .reduce((max, candidate) => Math.max(max, candidate.branchOrder), 0) || 0;

  const result = await prisma.$transaction(async (tx) => {
    await tx.thoughtNode.updateMany({
      where: {
        mapId: map.id,
        nodeStatus: { not: "superseded" },
      },
      data: {
        nodeStatus: "active",
      },
    });

    if (weakNodeIds.length > 0) {
      await tx.thoughtNode.updateMany({
        where: {
          id: { in: weakNodeIds },
          nodeStatus: { not: "superseded" },
        },
        data: {
          nodeStatus: "weak",
        },
      });
    }

    if (supersededNodeId) {
      await tx.thoughtNode.update({
        where: { id: supersededNodeId },
        data: {
          nodeStatus: "superseded",
        },
      });
    }

    const inserts = [];

    for (const [index, note] of generated.notes.entries()) {
      const created = await tx.thoughtNode.create({
        data: {
          mapId: map.id,
          parentId: persistenceParentId,
          kind: note.kind,
          nodeStatus: "active",
          actionOrigin: params.action,
          supersedesNodeId:
            generated.execution.mode === "replace_weak_branch" &&
            supersededNodeId &&
            note.kind === generated.execution.targetNodeKind
              ? supersededNodeId
              : null,
          content: note.content,
          note: note.note,
          branchOrder: lastChildOrder + index + 1,
        },
      });

      inserts.push(mapNode(created));
    }

    const updatedNodes = await tx.thoughtNode.findMany({
      where: {
        id: {
          in: Array.from(
            new Set([
              ...weakNodeIds,
              ...(supersededNodeId ? [supersededNodeId] : []),
            ]),
          ),
        },
      },
      orderBy: [{ branchOrder: "asc" }, { createdAt: "asc" }],
    });

    return {
      createdNodes: inserts,
      updatedNodes: updatedNodes.map(mapNode),
    };
  });

  const updatedRecord = await prisma.thoughtMap.findUnique({
    where: { id: params.mapId },
    include: {
      nodes: {
        orderBy: [{ branchOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!updatedRecord) {
    throw new Error("Map not found after update");
  }

  const updatedMap = await hydrateThoughtMap(updatedRecord, map);

  const actionResult = buildThoughtMapActionResult({
    action: params.action,
    beforeMap: map,
    afterMap: updatedMap,
    targetNodeId: generated.execution.targetNodeId,
    createdNodeIds: result.createdNodes.map((createdNode) => createdNode.id),
    updatedNodeIds: result.updatedNodes.map((updatedNode) => updatedNode.id),
  });
  const createdNodeIds = new Set(result.createdNodes.map((createdNode) => createdNode.id));
  const updatedNodeIds = new Set(result.updatedNodes.map((updatedNode) => updatedNode.id));
  const createdNodes = updatedMap.nodes.filter((updatedNode) => createdNodeIds.has(updatedNode.id));
  const updatedNodes = updatedMap.nodes.filter((updatedNode) => updatedNodeIds.has(updatedNode.id));

  return {
    ...generated,
    actionResult,
    execution: {
      ...generated.execution,
      supersededNodeId,
    },
    createdNodes,
    updatedNodes,
    graphSnapshot: updatedMap.graphSnapshot,
    interventions: updatedMap.interventions,
    recommendedIntervention: updatedMap.recommendedIntervention,
    recommendedNextMove: updatedMap.recommendedNextMove,
  };
}

export async function applyRecommendedNextMove(mapId: string) {
  const map = await getThoughtMap(mapId);

  if (!map) {
    throw new Error("Map not found");
  }

  if (!map.recommendedNextMove) {
    throw new Error("Recommended next move unavailable");
  }

  return applyNodeAction({
    mapId,
    nodeId: map.recommendedNextMove.targetNodeId,
    action: map.recommendedNextMove.action,
  });
}

export async function generateFounderBrief(mapId: string) {
  const map = await getThoughtMap(mapId);

  if (!map) {
    throw new Error("Map not found");
  }

  if (!map.founderBriefReadiness.eligible) {
    throw new Error("Founder brief unavailable: map not ready");
  }

  const founderBrief = buildFounderBrief(map);
  const { generatedAt, ...storedFounderBrief } = founderBrief;
  const updatedRecord = await prisma.thoughtMap.update({
    where: { id: mapId },
    data: {
      founderBrief: serializeJson(storedFounderBrief),
      founderBriefGeneratedAt: generatedAt,
    },
    include: {
      nodes: {
        orderBy: [{ branchOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  return hydrateThoughtMap(updatedRecord, map);
}

export async function dismissThoughtMapIntervention(params: { mapId: string; interventionId: string }) {
  const intervention = await prisma.thoughtMapIntervention.findFirst({
    where: {
      id: params.interventionId,
      mapId: params.mapId,
    },
  });

  if (!intervention) {
    throw new Error("Intervention not found");
  }

  if (intervention.status === "dismissed") {
    return mapIntervention(intervention);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const dismissed = await tx.thoughtMapIntervention.update({
      where: { id: intervention.id },
      data: {
        status: "dismissed",
        dismissedAt: new Date(),
      },
    });

    await createThoughtMapEvent(tx, {
      mapId: intervention.mapId,
      nodeId: intervention.targetNodeId,
      interventionId: intervention.id,
      eventType: "intervention_dismissed",
      payload: {
        type: intervention.type,
        detector: intervention.detector,
      },
    });

    return dismissed;
  });

  return mapIntervention(updated);
}
