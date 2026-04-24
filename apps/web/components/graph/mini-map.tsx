import type { CSSProperties, PointerEvent } from "react";

import type { GraphEdge, GraphModel, GraphViewport } from "../../lib/types/graph";
import { createNodeLookup, positionGraphNodes, type PositionedGraphNode } from "./graph-layout";
import { graphClusterColors, graphMiniMapStyle, graphViewBox, graphViewBoxValue } from "./graph-style";

type MiniMapProps = {
  nodes: PositionedGraphNode[];
  edges: GraphEdge[];
  selectedNodeId?: string | null;
  nodesById: Map<string, PositionedGraphNode>;
  viewport?: GraphViewport;
  onViewportChange?: (viewport: GraphViewport | ((current: GraphViewport) => GraphViewport)) => void;
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

function viewportRect(viewport: GraphViewport | undefined) {
  if (!viewport) {
    return null;
  }

  return {
    x: (graphViewBox.x - viewport.translateX) / viewport.scale,
    y: (graphViewBox.y - viewport.translateY) / viewport.scale,
    width: graphViewBox.width / viewport.scale,
    height: graphViewBox.height / viewport.scale,
  };
}

export function MiniMap({ nodes, edges, selectedNodeId, nodesById, viewport, onViewportChange, variant = "floating", style }: MiniMapProps) {
  const baseStyle = variant === "inline" ? inlineMiniMapStyle : graphMiniMapStyle;
  const rect = viewportRect(viewport);

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    if (!onViewportChange || !viewport) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const x = graphViewBox.x + ((event.clientX - bounds.left) / bounds.width) * graphViewBox.width;
    const y = graphViewBox.y + ((event.clientY - bounds.top) / bounds.height) * graphViewBox.height;

    onViewportChange((current) => ({
      ...current,
      translateX: -(x * current.scale),
      translateY: -(y * current.scale),
    }));
  }

  return (
    <svg
      aria-label="Graph mini map"
      data-testid="penny-graph-minimap"
      style={{
        ...baseStyle,
        cursor: onViewportChange ? "crosshair" : undefined,
        ...style,
      }}
      viewBox={graphViewBoxValue}
      onPointerDown={handlePointerDown}
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
      {rect ? (
        <rect
          aria-label="Current graph viewport"
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          fill="rgba(47, 107, 85, 0.08)"
          stroke="rgba(47, 107, 85, 0.72)"
          strokeWidth="5"
          rx="10"
        />
      ) : null}
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
