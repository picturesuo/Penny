"use client";

import type { CSSProperties } from "react";

import type { GraphModel, GraphNode } from "../../lib/types/graph";
import { GraphView } from "./graph-view";

type BrainGraphMapProps = {
  graph: GraphModel;
  selectedNodeId?: string | null;
  onSelectNode?: (node: GraphNode) => void;
  height?: number;
  style?: CSSProperties;
};

const brainMapStyle: CSSProperties = {
  width: "100%",
  minHeight: 560,
};

export function BrainGraphMap({ graph, selectedNodeId, onSelectNode, height = 640, style }: BrainGraphMapProps) {
  return (
    <section
      aria-label="Brain map graph"
      data-testid="penny-brain-graph-map"
      style={{
        ...brainMapStyle,
        ...style,
      }}
    >
      <GraphView graph={graph} selectedNodeId={selectedNodeId} onSelectNode={onSelectNode} height={height} />
    </section>
  );
}
