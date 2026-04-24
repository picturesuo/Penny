import type { GraphEdge } from "../../lib/types/graph";
import type { PositionedGraphNode } from "./graph-layout";
import { graphClusterColors, graphMiniMapStyle, graphViewBoxValue } from "./graph-style";

type MiniMapProps = {
  nodes: PositionedGraphNode[];
  edges: GraphEdge[];
  selectedNodeId?: string | null;
  nodesById: Map<string, PositionedGraphNode>;
};

export function MiniMap({ nodes, edges, selectedNodeId, nodesById }: MiniMapProps) {
  return (
    <svg
      aria-label="Graph mini map"
      data-testid="penny-graph-minimap"
      style={graphMiniMapStyle}
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
