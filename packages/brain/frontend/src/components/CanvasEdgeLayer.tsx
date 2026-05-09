import React from "react";
import type { CanvasEdge, CanvasNode } from "../types/brain";

export interface PositionedCanvasNode extends CanvasNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CanvasEdgeLayerProps {
  edges: CanvasEdge[];
  nodes: PositionedCanvasNode[];
  selectedNodeId: string | null;
  recommendedPath: string[];
  width: number;
  height: number;
}

export function CanvasEdgeLayer({ edges, nodes, selectedNodeId, recommendedPath, width, height }: CanvasEdgeLayerProps) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const recommendedEdges = new Set(pathEdgeKeys(recommendedPath));

  return (
    <svg
      className="canvas-edge-layer"
      viewBox={`0 0 ${width} ${height}`}
      style={{ width, height }}
      role="presentation"
      aria-hidden="true"
    >
      <defs>
        <marker
          id="canvas-edge-arrow"
          markerWidth="10"
          markerHeight="10"
          refX="8"
          refY="5"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" />
        </marker>
      </defs>
      {edges.map((edge, index) => {
        const source = nodeById.get(edge.source);
        const target = nodeById.get(edge.target);

        if (!source || !target) {
          return null;
        }

        const active = selectedNodeId === source.id || selectedNodeId === target.id;
        const recommended = recommendedEdges.has(`${edge.source}->${edge.target}`);
        const route = edgeRoute(source, target, index, width, height);

        return (
          <g
            key={edge.id}
            className={`canvas-edge is-${edge.kind}${active ? " is-active" : ""}${recommended ? " is-recommended" : ""}`}
          >
            <path d={route.path} markerEnd="url(#canvas-edge-arrow)" />
            {edge.label ? (
              <text x={route.labelX} y={route.labelY} textAnchor="middle">
                {shortEdgeLabel(edge.label)}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function pathEdgeKeys(path: string[]): string[] {
  const keys: string[] = [];

  for (let index = 0; index < path.length - 1; index += 1) {
    keys.push(`${path[index]}->${path[index + 1]}`);
  }

  return keys;
}

function edgeRoute(
  source: PositionedCanvasNode,
  target: PositionedCanvasNode,
  index: number,
  width: number,
  height: number,
): { path: string; labelX: number; labelY: number } {
  const sourceCenterX = source.x + source.width / 2;
  const sourceCenterY = source.y + source.height / 2;
  const targetCenterX = target.x + target.width / 2;
  const targetCenterY = target.y + target.height / 2;
  const sourceIsLeft = sourceCenterX <= targetCenterX;
  const laneOffset = 44 + (index % 3) * 18;

  if (Math.abs(targetCenterY - sourceCenterY) < source.height * 0.72) {
    const sourceX = sourceIsLeft ? source.x + source.width : source.x;
    const targetX = sourceIsLeft ? target.x : target.x + target.width;
    const connectorDirection = sourceIsLeft ? 1 : -1;
    const minY = Math.min(source.y, target.y);
    const maxY = Math.max(source.y + source.height, target.y + target.height);
    const useTopLane = index % 2 === 0;
    const laneY = useTopLane ? Math.max(34, minY - laneOffset) : Math.min(height - 34, maxY + laneOffset);
    const sourceBendX = sourceX + connectorDirection * 54;
    const targetBendX = targetX - connectorDirection * 54;

    return {
      path: [
        `M ${sourceX} ${sourceCenterY}`,
        `C ${sourceBendX} ${sourceCenterY}, ${sourceBendX} ${laneY}, ${sourceBendX} ${laneY}`,
        `L ${targetBendX} ${laneY}`,
        `C ${targetBendX} ${laneY}, ${targetBendX} ${targetCenterY}, ${targetX} ${targetCenterY}`,
      ].join(" "),
      labelX: (sourceBendX + targetBendX) / 2,
      labelY: laneY - 9,
    };
  }

  const sourceX = sourceCenterX;
  const targetX = targetCenterX;
  const sourceY = sourceCenterY <= targetCenterY ? source.y + source.height : source.y;
  const targetY = sourceCenterY <= targetCenterY ? target.y : target.y + target.height;
  const useRightLane = sourceCenterX <= targetCenterX;
  const laneX = useRightLane
    ? Math.min(width - 40, Math.max(source.x + source.width, target.x + target.width) + laneOffset)
    : Math.max(40, Math.min(source.x, target.x) - laneOffset);

  return {
    path: [
      `M ${sourceX} ${sourceY}`,
      `C ${sourceX} ${(sourceY + targetY) / 2}, ${laneX} ${(sourceY + targetY) / 2}, ${laneX} ${(sourceY + targetY) / 2}`,
      `L ${laneX} ${targetY}`,
      `C ${laneX} ${targetY}, ${targetX} ${targetY}, ${targetX} ${targetY}`,
    ].join(" "),
    labelX: laneX,
    labelY: (sourceY + targetY) / 2 - 9,
  };
}

function shortEdgeLabel(label: string): string {
  return label.length > 28 ? `${label.slice(0, 25)}...` : label;
}
