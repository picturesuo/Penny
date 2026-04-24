import type { GraphCluster, GraphNode, GraphNodeKind } from "../../lib/types/graph";

export type PositionedGraphNode = GraphNode & {
  cluster: GraphCluster;
  kind: GraphNodeKind;
  x: number;
  y: number;
};

function fallbackPosition(index: number, total: number) {
  if (total <= 1) {
    return { x: 0, y: 0 };
  }

  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  const radius = 190 + Math.min(total, 8) * 10;

  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius * 0.68,
  };
}

export function positionGraphNodes(nodes: GraphNode[]): PositionedGraphNode[] {
  return nodes.map((node, index) => {
    if (typeof node.x === "number" && typeof node.y === "number") {
      return {
        ...node,
        cluster: getGraphNodeCluster(node),
        kind: getGraphNodeKind(node),
        x: node.x,
        y: node.y,
      };
    }

    return {
      ...node,
      cluster: getGraphNodeCluster(node),
      kind: getGraphNodeKind(node),
      ...fallbackPosition(index, nodes.length),
    };
  });
}

export function createNodeLookup(nodes: PositionedGraphNode[]) {
  return new Map(nodes.map((node) => [node.id, node]));
}

export function getGraphNodeKind(node: GraphNode): GraphNodeKind {
  if (node.kind) {
    return node.kind;
  }

  if (node.type === "map") {
    return "map";
  }

  if (node.type === "claim" || node.type === "thought") {
    return "claim";
  }

  if (node.type === "session") {
    return "event";
  }

  return "context";
}

export function getGraphNodeCluster(node: GraphNode): GraphCluster {
  if (node.cluster) {
    return node.cluster;
  }

  if (node.type === "map") {
    return "map";
  }

  if (node.type === "claim" || node.type === "thought") {
    return "claim";
  }

  if (node.type === "session") {
    return "event";
  }

  return "context";
}

export function getGraphNodeRadius(node: GraphNode, selected: boolean) {
  const kind = getGraphNodeKind(node);

  if (kind === "map") {
    return selected ? 31 : 27;
  }

  if (kind === "claim") {
    return selected ? 25 : 22;
  }

  return selected ? 21 : 18;
}

export function formatConfidence(value: number | null | undefined) {
  if (typeof value !== "number") {
    return null;
  }

  return `${Math.round(value / 100)}%`;
}
