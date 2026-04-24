import type { GraphEdge as GraphEdgeModel } from "../../lib/types/graph";
import type { PositionedGraphNode } from "./graph-layout";

type GraphEdgeProps = {
  edge: GraphEdgeModel;
  source: PositionedGraphNode;
  target: PositionedGraphNode;
  emphasized?: boolean;
};

export function GraphEdge({ edge, source, target, emphasized = false }: GraphEdgeProps) {
  return (
    <line
      x1={source.x}
      y1={source.y}
      x2={target.x}
      y2={target.y}
      stroke={emphasized ? "rgba(47, 107, 85, 0.62)" : "rgba(23, 32, 27, 0.2)"}
      strokeWidth={(edge.strength ?? 1) * (emphasized ? 1.35 : 1)}
      strokeLinecap="round"
    />
  );
}
