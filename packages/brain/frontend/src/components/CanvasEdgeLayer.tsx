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
}

export function CanvasEdgeLayer({ edges, nodes, selectedNodeId, recommendedPath }: CanvasEdgeLayerProps) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const recommendedEdges = new Set(pathEdgeKeys(recommendedPath));

  return (
    <svg className="canvas-edge-layer" viewBox="0 0 1080 620" role="presentation" aria-hidden="true">
      {edges.map((edge) => {
        const source = nodeById.get(edge.source);
        const target = nodeById.get(edge.target);

        if (!source || !target) {
          return null;
        }

        const active = selectedNodeId === source.id || selectedNodeId === target.id;
        const recommended = recommendedEdges.has(`${edge.source}->${edge.target}`);
        const sourceX = source.x + source.width;
        const sourceY = source.y + source.height / 2;
        const targetX = target.x;
        const targetY = target.y + target.height / 2;
        const controlGap = Math.max(90, Math.abs(targetX - sourceX) / 2);
        const path = `M ${sourceX} ${sourceY} C ${sourceX + controlGap} ${sourceY}, ${targetX - controlGap} ${targetY}, ${targetX} ${targetY}`;

        return (
          <g
            key={edge.id}
            className={`canvas-edge is-${edge.kind}${active ? " is-active" : ""}${recommended ? " is-recommended" : ""}`}
          >
            <path d={path} />
            {edge.label ? (
              <text x={(sourceX + targetX) / 2} y={(sourceY + targetY) / 2 - 8}>
                {edge.label}
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
