import { memo, useMemo } from "react";

import type { GraphCluster, GraphEdge as GraphEdgeModel, GraphNode as GraphNodeModel, GraphViewport } from "../../lib/types/graph";
import { ClusterLabel } from "./cluster-label";
import { GraphEdge } from "./graph-edge";
import { getGraphNodeCluster, getGraphNodeKind, type PositionedGraphNode } from "./graph-layout";
import { GraphNode } from "./graph-node";
import { graphViewBoxValue } from "./graph-style";

export type GraphLensId = "claims" | "contradictions" | "dependencies" | "recent";

type GraphCanvasProps = {
  nodes: PositionedGraphNode[];
  edges: GraphEdgeModel[];
  nodesById: Map<string, PositionedGraphNode>;
  viewport: GraphViewport;
  activeLensIds?: Set<GraphLensId>;
  selectedNodeId?: string | null;
  focusNodeId?: string | null;
  focusedCluster?: GraphCluster | null;
  onSelectNode?: (node: GraphNodeModel) => void;
};

const defaultActiveLensIds = new Set<GraphLensId>(["claims", "contradictions", "dependencies", "recent"]);

function confidenceValue(node: PositionedGraphNode) {
  if (typeof node.confidence === "number") {
    return node.confidence;
  }

  if (typeof node.confidenceBps === "number") {
    return Math.round(node.confidenceBps / 100);
  }

  return null;
}

function isClaimNode(node: PositionedGraphNode) {
  return node.type === "claim" || node.type === "thought" || getGraphNodeKind(node) === "claim";
}

function isContradictionNode(node: PositionedGraphNode) {
  const confidence = confidenceValue(node);
  return node.status === "contradiction" || (typeof confidence === "number" && confidence < 60);
}

function isRecentNode(node: PositionedGraphNode) {
  return Boolean(node.activityAt);
}

function isDependencyEdge(edge: GraphEdgeModel) {
  return edge.type === "depends_on" || edge.status === "dependency";
}

function isContradictionEdge(edge: GraphEdgeModel) {
  return edge.type === "contradicts" || edge.status === "contradiction";
}

function isClaimEdge(edge: GraphEdgeModel, nodesById: Map<string, PositionedGraphNode>) {
  const source = nodesById.get(edge.source);
  const target = nodesById.get(edge.target);
  return Boolean((source && isClaimNode(source)) || (target && isClaimNode(target)));
}

function isRecentEdge(edge: GraphEdgeModel, nodesById: Map<string, PositionedGraphNode>) {
  const source = nodesById.get(edge.source);
  const target = nodesById.get(edge.target);
  return Boolean((source && isRecentNode(source)) || (target && isRecentNode(target)));
}

export const GraphCanvas = memo(function GraphCanvas({
  nodes,
  edges,
  nodesById,
  viewport,
  activeLensIds = defaultActiveLensIds,
  selectedNodeId,
  focusNodeId = null,
  focusedCluster = null,
  onSelectNode,
}: GraphCanvasProps) {
  const viewTransform = `translate(${viewport.translateX} ${viewport.translateY}) scale(${viewport.scale})`;
  const clusters = useMemo(() => Array.from(new Set(nodes.map((node) => getGraphNodeCluster(node)))), [nodes]);
  const activeEdgeIds = useMemo(() => {
    if (!selectedNodeId) {
      return new Set<string>();
    }

    return new Set(edges.filter((edge) => edge.source === selectedNodeId || edge.target === selectedNodeId).map((edge) => edge.id));
  }, [edges, selectedNodeId]);
  const focusEdgeIds = useMemo(() => {
    if (!focusNodeId) {
      return new Set<string>();
    }

    return new Set(edges.filter((edge) => edge.source === focusNodeId || edge.target === focusNodeId).map((edge) => edge.id));
  }, [edges, focusNodeId]);
  const connectedNodeIds = useMemo(() => {
    const ids = new Set<string>();

    if (!selectedNodeId) {
      return ids;
    }

    ids.add(selectedNodeId);
    edges.forEach((edge) => {
      if (edge.source === selectedNodeId || edge.target === selectedNodeId) {
        ids.add(edge.source);
        ids.add(edge.target);
      }
    });

    return ids;
  }, [edges, selectedNodeId]);
  const focusedNodeIds = useMemo(() => {
    const ids = new Set<string>();

    if (!focusNodeId) {
      return ids;
    }

    ids.add(focusNodeId);
    edges.forEach((edge) => {
      if (edge.source === focusNodeId || edge.target === focusNodeId) {
        ids.add(edge.source);
        ids.add(edge.target);
      }
    });

    return ids;
  }, [edges, focusNodeId]);

  return (
    <svg aria-label="Graph canvas" width="100%" height="100%" viewBox={graphViewBoxValue}>
      <style>
        {`
          .penny-graph-edge,
          .penny-graph-edge-group {
            transition: opacity 160ms ease, stroke 160ms ease, stroke-opacity 160ms ease, stroke-width 160ms ease;
          }

          .penny-graph-node-group .penny-graph-node-shell,
          .penny-graph-node-group .penny-graph-node-core,
          .penny-graph-node-group .penny-graph-node-label {
            transform-box: fill-box;
            transform-origin: center;
            transition: stroke 160ms ease, stroke-width var(--motion-standard), opacity var(--motion-standard), transform var(--motion-standard);
          }

          .penny-graph-node-group:hover .penny-graph-node-shell,
          .penny-graph-node-group:focus-visible .penny-graph-node-shell {
            stroke-width: 2;
            opacity: 0.98;
            transform: scale(1.025);
          }

          .penny-graph-node-group:hover .penny-graph-node-core,
          .penny-graph-node-group:focus-visible .penny-graph-node-core {
            opacity: 0.86;
            transform: scale(1.04);
          }

          .penny-graph-node-group:focus-visible {
            outline: none;
          }
        `}
      </style>
      <g transform={viewTransform}>
        {clusters.map((cluster) => (
          <ClusterLabel key={cluster} cluster={cluster} nodes={nodes} />
        ))}
        {edges.map((edge) => {
          const source = nodesById.get(edge.source);
          const target = nodesById.get(edge.target);

          if (!source || !target) {
            return null;
          }

          const active = activeEdgeIds.has(edge.id);
          const emphasized = source.id === selectedNodeId || target.id === selectedNodeId;
          const muted = Boolean(
            (focusNodeId && !focusEdgeIds.has(edge.id)) ||
              (focusedCluster && getGraphNodeCluster(source) !== focusedCluster && getGraphNodeCluster(target) !== focusedCluster) ||
              (!activeLensIds.has("claims") && isClaimEdge(edge, nodesById)) ||
              (!activeLensIds.has("contradictions") && isContradictionEdge(edge)) ||
              (!activeLensIds.has("dependencies") && isDependencyEdge(edge)) ||
              (!activeLensIds.has("recent") && isRecentEdge(edge, nodesById)),
          );

          return <GraphEdge key={edge.id} active={active} edge={edge} source={source} target={target} emphasized={emphasized} muted={muted} />;
        })}
        {nodes.map((node) => (
          <GraphNode
            connected={connectedNodeIds.has(node.id) && node.id !== selectedNodeId}
            key={node.id}
            muted={Boolean(
              (focusNodeId && !focusedNodeIds.has(node.id)) ||
                (focusedCluster && getGraphNodeCluster(node) !== focusedCluster) ||
                (!activeLensIds.has("claims") && isClaimNode(node)) ||
                (!activeLensIds.has("contradictions") && isContradictionNode(node)) ||
                (!activeLensIds.has("recent") && isRecentNode(node)),
            )}
            node={node}
            selected={node.id === selectedNodeId}
            onSelectNode={onSelectNode}
          />
        ))}
      </g>
    </svg>
  );
});
