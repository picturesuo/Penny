"use client";

import { useMemo, useState, type CSSProperties } from "react";

import type { GraphCluster, GraphModel, GraphNode, GraphViewport } from "../../lib/types/graph";

type GraphViewProps = {
  graph: GraphModel;
  selectedNodeId?: string | null;
  onSelectNode?: (node: GraphNode) => void;
  height?: number;
};

type PositionedNode = GraphNode & {
  x: number;
  y: number;
};

const colors: Record<GraphCluster, { fill: string; stroke: string }> = {
  map: { fill: "#e6efe6", stroke: "#55735f" },
  claim: { fill: "#e7eef2", stroke: "#526f82" },
  challenge: { fill: "#f1e8df", stroke: "#9a6947" },
  critique: { fill: "#eee9f1", stroke: "#71627f" },
  learn: { fill: "#edf0df", stroke: "#6f7445" },
  event: { fill: "#f3ece5", stroke: "#9b765b" },
  context: { fill: "#edf0ed", stroke: "#69736c" },
};

const initialViewport: GraphViewport = {
  scale: 1,
  translateX: 0,
  translateY: 0,
};

const surfaceStyle: CSSProperties = {
  position: "relative",
  minHeight: 360,
  overflow: "hidden",
  border: "1px solid rgba(23, 32, 27, 0.1)",
  borderRadius: 8,
  background: "#fbfcf7",
};

const controlRailStyle: CSSProperties = {
  position: "absolute",
  left: 14,
  bottom: 14,
  display: "flex",
  gap: 6,
  padding: 4,
  border: "1px solid rgba(23, 32, 27, 0.1)",
  borderRadius: 8,
  background: "rgba(251, 252, 247, 0.9)",
  boxShadow: "0 10px 28px rgba(23, 32, 27, 0.08)",
};

const controlButtonStyle: CSSProperties = {
  width: 34,
  height: 34,
  border: "1px solid rgba(23, 32, 27, 0.12)",
  borderRadius: 6,
  background: "#ffffff",
  color: "#17201b",
  cursor: "pointer",
  fontWeight: 700,
};

const miniMapStyle: CSSProperties = {
  position: "absolute",
  right: 14,
  bottom: 14,
  width: 148,
  height: 96,
  border: "1px solid rgba(23, 32, 27, 0.12)",
  borderRadius: 8,
  background: "rgba(251, 252, 247, 0.92)",
  boxShadow: "0 10px 28px rgba(23, 32, 27, 0.08)",
};

function fallbackPosition(index: number, total: number) {
  if (total <= 1) {
    return { x: 0, y: 0 };
  }

  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  const radius = 190 + Math.min(total, 8) * 10;

  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius * 0.68,
  };
}

function positionNodes(nodes: GraphNode[]): PositionedNode[] {
  return nodes.map((node, index) => {
    if (typeof node.x === "number" && typeof node.y === "number") {
      return {
        ...node,
        x: node.x,
        y: node.y,
      };
    }

    return {
      ...node,
      ...fallbackPosition(index, nodes.length),
    };
  });
}

function getNodeRadius(node: GraphNode, selected: boolean) {
  if (node.kind === "map") {
    return selected ? 31 : 27;
  }

  if (node.kind === "claim") {
    return selected ? 25 : 22;
  }

  return selected ? 21 : 18;
}

function nodeById(nodes: PositionedNode[]) {
  return new Map(nodes.map((node) => [node.id, node]));
}

function zoom(viewport: GraphViewport, delta: number): GraphViewport {
  const scale = Math.min(1.8, Math.max(0.58, Number((viewport.scale + delta).toFixed(2))));
  return {
    ...viewport,
    scale,
  };
}

function confidenceLabel(value: number | null | undefined) {
  if (typeof value !== "number") {
    return null;
  }

  return `${Math.round(value / 100)}%`;
}

export function GraphView({ graph, selectedNodeId, onSelectNode, height = 460 }: GraphViewProps) {
  const [viewport, setViewport] = useState<GraphViewport>(initialViewport);
  const nodes = useMemo(() => positionNodes(graph.nodes), [graph.nodes]);
  const nodesById = useMemo(() => nodeById(nodes), [nodes]);
  const activeNodeId = selectedNodeId ?? graph.selectedNodeId ?? null;
  const viewTransform = `translate(${viewport.translateX} ${viewport.translateY}) scale(${viewport.scale})`;

  return (
    <section
      aria-label={graph.title}
      data-testid="penny-graph"
      style={{
        ...surfaceStyle,
        height,
      }}
    >
      <svg aria-label="Graph canvas" width="100%" height="100%" viewBox="-520 -310 1040 620">
        <defs>
          <filter id="penny-graph-selected" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#17201b" floodOpacity="0.13" />
          </filter>
        </defs>
        <g transform={viewTransform}>
          {graph.edges.map((edge) => {
            const source = nodesById.get(edge.source);
            const target = nodesById.get(edge.target);

            if (!source || !target) {
              return null;
            }

            const emphasized = source.id === activeNodeId || target.id === activeNodeId;

            return (
              <line
                key={edge.id}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={emphasized ? "rgba(47, 107, 85, 0.62)" : "rgba(23, 32, 27, 0.2)"}
                strokeWidth={(edge.strength ?? 1) * (emphasized ? 1.35 : 1)}
                strokeLinecap="round"
              />
            );
          })}

          {nodes.map((node) => {
            const selected = node.id === activeNodeId;
            const palette = colors[node.cluster];
            const radius = getNodeRadius(node, selected);
            const confidence = confidenceLabel(node.confidenceBps);

            return (
              <g
                key={node.id}
                transform={`translate(${node.x} ${node.y})`}
                filter={selected ? "url(#penny-graph-selected)" : undefined}
                role={onSelectNode ? "button" : "img"}
                aria-label={node.label}
                tabIndex={onSelectNode ? 0 : undefined}
                data-testid="penny-graph-node"
                data-selected={selected}
                style={{ cursor: onSelectNode ? "pointer" : "default" }}
                onClick={() => onSelectNode?.(node)}
                onKeyDown={(event) => {
                  if (!onSelectNode) {
                    return;
                  }

                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectNode(node);
                  }
                }}
              >
                <circle
                  r={radius}
                  fill={palette.fill}
                  stroke={selected ? "#17201b" : palette.stroke}
                  strokeWidth={selected ? 2.4 : 1.2}
                />
                <circle r={Math.max(5, radius * 0.25)} fill={palette.stroke} opacity={selected ? 0.95 : 0.62} />
                <text
                  x={0}
                  y={radius + 18}
                  textAnchor="middle"
                  fill="#17201b"
                  fontSize="12"
                  fontWeight={selected ? 700 : 560}
                >
                  {node.label.length > 32 ? `${node.label.slice(0, 31)}...` : node.label}
                </text>
                {confidence ? (
                  <text x={0} y={radius + 33} textAnchor="middle" fill="#637069" fontSize="10">
                    {confidence}
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>

      <div aria-label="Graph controls" style={controlRailStyle}>
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in"
          style={controlButtonStyle}
          onClick={() => setViewport((current) => zoom(current, 0.12))}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          style={controlButtonStyle}
          onClick={() => setViewport((current) => zoom(current, -0.12))}
        >
          -
        </button>
        <button
          type="button"
          aria-label="Fit graph"
          title="Fit graph"
          style={{
            ...controlButtonStyle,
            width: 42,
          }}
          onClick={() => setViewport(initialViewport)}
        >
          [ ]
        </button>
      </div>

      <svg
        aria-label="Graph mini map"
        data-testid="penny-graph-minimap"
        style={miniMapStyle}
        viewBox="-520 -310 1040 620"
      >
        {graph.edges.map((edge) => {
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
              stroke="rgba(23, 32, 27, 0.2)"
              strokeWidth="3"
              strokeLinecap="round"
            />
          );
        })}
        {nodes.map((node) => {
          const selected = node.id === activeNodeId;
          const palette = colors[node.cluster];

          return (
            <circle
              key={node.id}
              cx={node.x}
              cy={node.y}
              r={selected ? 17 : 12}
              fill={palette.fill}
              stroke={selected ? "#17201b" : palette.stroke}
              strokeWidth={selected ? 6 : 3}
            />
          );
        })}
      </svg>
    </section>
  );
}
