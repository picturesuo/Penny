"use client";

import { useMemo } from "react";

import type { GraphModel, GraphNode } from "../../lib/types/graph";
import { GraphCanvas } from "./graph-canvas";
import { createNodeLookup, positionGraphNodes } from "./graph-layout";
import { graphSurfaceStyle, initialGraphViewport } from "./graph-style";

type ContextGraphViewProps = {
  graph: GraphModel;
  selectedNodeId?: string | null;
  onSelectNode?: (node: GraphNode) => void;
  height?: number;
};

export function ContextGraphView({ graph, selectedNodeId, onSelectNode, height = 260 }: ContextGraphViewProps) {
  const nodes = useMemo(() => positionGraphNodes(graph.nodes), [graph.nodes]);
  const nodesById = useMemo(() => createNodeLookup(nodes), [nodes]);
  const activeNodeId = selectedNodeId ?? graph.selectedNodeId ?? null;

  return (
    <section
      aria-label="Context graph"
      data-testid="penny-context-graph"
      style={{
        ...graphSurfaceStyle,
        height,
        minHeight: 220,
      }}
    >
      <GraphCanvas
        nodes={nodes}
        edges={graph.edges}
        nodesById={nodesById}
        viewport={{
          ...initialGraphViewport,
          scale: 0.86,
        }}
        selectedNodeId={activeNodeId}
        onSelectNode={onSelectNode}
      />
    </section>
  );
}
