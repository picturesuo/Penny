import type { CSSProperties } from "react";

import type { GraphEdge, GraphModel } from "../../lib/types/graph";
import { createNodeLookup, positionGraphNodes, type PositionedGraphNode } from "./graph-layout";
import { graphClusterColors, graphMiniMapStyle, graphViewBoxValue } from "./graph-style";

type MiniMapProps = {
  nodes: PositionedGraphNode[];
  edges: GraphEdge[];
  selectedNodeId?: string | null;
  nodesById: Map<string, PositionedGraphNode>;
  variant?: "floating" | "inline";
  style?: CSSProperties;
};

const inlineMiniMapStyle: CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
  minHeight: 112,
  border: "1px solid rgba(23, 32, 27, 0.1)",
  borderRadius: 8,
  background: "rgba(253, 254, 251, 0.9)",
};

export function MiniMap({ nodes, edges, selectedNodeId, nodesById, variant = "floating", style }: MiniMapProps) {
  const baseStyle = variant === "inline" ? inlineMiniMapStyle : graphMiniMapStyle;

  return (
    <svg
      aria-label="Graph mini map"
      data-testid="penny-graph-minimap"
      style={{
        ...baseStyle,
        ...style,
      }}
      viewBox={graphViewBoxValue}
    >
      {edges.map((edge) => {
        const source = nodesById.get(edge.source);
        const target = nodesById.get(edge.target);

        if (!source || !target) {
          return null;
        }

        return (
          <line
            key={edge.id}
            x1={source.x}
            y1={source.y}
            x2={target.x}
            y2={target.y}
            stroke="rgba(23, 32, 27, 0.14)"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        );
      })}
      {nodes.map((node) => {
        const selected = node.id === selectedNodeId;
        const palette = graphClusterColors[node.cluster];

        return (
          <circle
            key={node.id}
            cx={node.x}
            cy={node.y}
            r={selected ? 17 : 12}
            fill={palette.fill}
            stroke={selected ? palette.accent : palette.stroke}
            strokeWidth={selected ? 4.6 : 2.4}
          />
        );
      })}
    </svg>
  );
}

type SidePanelMiniMapProps = {
  graph: Pick<GraphModel, "nodes" | "edges" | "selectedNodeId">;
  selectedNodeId?: string | null;
  height?: number;
};

export function SidePanelMiniMap({ graph, selectedNodeId, height = 138 }: SidePanelMiniMapProps) {
  const nodes = positionGraphNodes(graph.nodes);
  const nodesById = createNodeLookup(nodes);

  return (
    <div data-testid="penny-side-panel-minimap" style={{ height }}>
      <MiniMap
        nodes={nodes}
        edges={graph.edges}
        nodesById={nodesById}
        selectedNodeId={selectedNodeId ?? graph.selectedNodeId ?? null}
        variant="inline"
      />
    </div>
  );
}
