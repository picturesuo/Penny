"use client";

import { useMemo, useState } from "react";

import type { GraphModel, GraphNode, GraphViewport } from "../../lib/types/graph";
import { GraphCanvas } from "./graph-canvas";
import { GraphLegend } from "./graph-legend";
import { createNodeLookup, positionGraphNodes } from "./graph-layout";
import { MiniMap } from "./mini-map";
import { graphSurfaceStyle, initialGraphViewport } from "./graph-style";
import { ZoomControls } from "./zoom-controls";

type GraphViewProps = {
  graph: GraphModel;
  selectedNodeId?: string | null;
  onSelectNode?: (node: GraphNode) => void;
  height?: number;
};

export function GraphView({ graph, selectedNodeId, onSelectNode, height = 460 }: GraphViewProps) {
  const [viewport, setViewport] = useState<GraphViewport>(initialGraphViewport);
  const nodes = useMemo(() => positionGraphNodes(graph.nodes), [graph.nodes]);
  const nodesById = useMemo(() => createNodeLookup(nodes), [nodes]);
  const activeNodeId = selectedNodeId ?? graph.selectedNodeId ?? null;
  const clusters = useMemo(() => Array.from(new Set(nodes.map((node) => node.cluster))), [nodes]);

  return (
    <section
      aria-label={graph.title}
      data-testid="penny-graph"
      style={{
        ...graphSurfaceStyle,
        height,
      }}
    >
      <GraphCanvas
        nodes={nodes}
        edges={graph.edges}
        nodesById={nodesById}
        viewport={viewport}
        selectedNodeId={activeNodeId}
        onSelectNode={onSelectNode}
      />
      <GraphLegend clusters={clusters} />
      <ZoomControls onViewportChange={setViewport} />
      <MiniMap nodes={nodes} edges={graph.edges} nodesById={nodesById} selectedNodeId={activeNodeId} />
    </section>
  );
}
