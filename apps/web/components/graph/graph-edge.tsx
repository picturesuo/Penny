import { memo } from "react";

import type { GraphEdge as GraphEdgeModel } from "../../lib/types/graph";
import type { PositionedGraphNode } from "./graph-layout";

type GraphEdgeProps = {
  edge: GraphEdgeModel;
  source: PositionedGraphNode;
  target: PositionedGraphNode;
  active?: boolean;
  emphasized?: boolean;
  muted?: boolean;
};

function edgeStroke(edge: GraphEdgeModel, emphasized: boolean) {
  if (edge.status === "contradiction") {
    return emphasized ? "rgba(162, 59, 50, 0.72)" : "rgba(162, 59, 50, 0.42)";
  }

  if (edge.status === "dependency") {
    return emphasized ? "rgba(66, 111, 140, 0.62)" : "rgba(66, 111, 140, 0.34)";
  }

  return emphasized ? "rgba(71, 106, 85, 0.48)" : "rgba(23, 32, 27, 0.16)";
}

export const GraphEdge = memo(function GraphEdge({ active = false, edge, source, target, emphasized = false, muted = false }: GraphEdgeProps) {
  return (
    <g className="penny-graph-edge-group" opacity={muted ? 0.24 : 1}>
      <line
        className="penny-graph-edge"
        x1={source.x}
        y1={source.y}
        x2={target.x}
        y2={target.y}
        stroke={edgeStroke(edge, emphasized || active)}
        strokeDasharray={edge.status === "contradiction" ? "7 7" : undefined}
        strokeWidth={(edge.strength ?? 1) * (emphasized || active ? 1.28 : 0.86)}
        strokeLinecap="round"
      />
      {active && edge.label ? (
        <text
          x={(source.x + target.x) / 2}
          y={(source.y + target.y) / 2 - 8}
          fill="#4d5b52"
          fontSize="10"
          fontWeight="700"
          textAnchor="middle"
        >
          {edge.label}
        </text>
      ) : null}
    </g>
  );
});
