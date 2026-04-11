import type { ThoughtMap, ThoughtNode } from "@prisma/client";
import { prisma } from "@/db/prisma";
import {
  createRootNodeContent,
  createThoughtMapTitle,
  getDemoThoughtUserId,
} from "@/lib/thought-map";
import { generateActionNotes, generateInitialBranchNotes } from "@/lib/thought-map-generation";
import { cleanSentence } from "@/lib/penny";
import type {
  CreateThoughtMapInput,
  GeneratedActionBundle,
  NodeAction,
  ThoughtMapModel,
  ThoughtNodeKind,
  ThoughtNodeModel,
} from "@/types/thought-map";

function mapNode(record: ThoughtNode): ThoughtNodeModel {
  return {
    id: record.id,
    mapId: record.mapId,
    parentId: record.parentId ?? null,
    kind: record.kind as ThoughtNodeKind,
    nodeStatus: record.nodeStatus as ThoughtNodeModel["nodeStatus"],
    actionOrigin: (record.actionOrigin as ThoughtNodeModel["actionOrigin"]) ?? null,
    supersedesNodeId: record.supersedesNodeId ?? null,
    content: record.content,
    note: record.note ?? null,
    branchOrder: record.branchOrder,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function mapThoughtMap(record: ThoughtMap & { nodes: ThoughtNode[] }): ThoughtMapModel {
  return {
    id: record.id,
    userId: record.userId,
    title: record.title,
    rawThought: record.rawThought,
    status: record.status,
    nodes: record.nodes.map(mapNode),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
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

  return mapThoughtMap(created);
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

  return map ? mapThoughtMap(map) : null;
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

    if (generated.execution.supersededNodeId) {
      await tx.thoughtNode.update({
        where: { id: generated.execution.supersededNodeId },
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
            generated.execution.supersededNodeId &&
            note.kind === generated.execution.targetNodeKind
              ? generated.execution.supersededNodeId
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
              ...(generated.execution.supersededNodeId ? [generated.execution.supersededNodeId] : []),
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

  return {
    ...generated,
    createdNodes: result.createdNodes,
    updatedNodes: result.updatedNodes,
  };
}
