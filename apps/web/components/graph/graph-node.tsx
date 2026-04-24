import type { KeyboardEvent } from "react";

import type { GraphNode as GraphNodeModel } from "../../lib/types/graph";
import { formatConfidence, getGraphNodeRadius, type PositionedGraphNode } from "./graph-layout";
import { graphClusterColors } from "./graph-style";
import { SelectedNodeHalo } from "./selected-node-halo";

type GraphNodeProps = {
  node: PositionedGraphNode;
  selected?: boolean;
  onSelectNode?: (node: GraphNodeModel) => void;
};

function displayLabel(label: string) {
  return label.length > 32 ? `${label.slice(0, 31)}...` : label;
}

export function GraphNode({ node, selected = false, onSelectNode }: GraphNodeProps) {
  const palette = graphClusterColors[node.cluster];
  const radius = getGraphNodeRadius(node, selected);
  const confidence = formatConfidence(node.confidenceBps);

  function handleKeyDown(event: KeyboardEvent<SVGGElement>) {
    if (!onSelectNode) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectNode(node);
    }
  }

  return (
    <g
      transform={`translate(${node.x} ${node.y})`}
      role={onSelectNode ? "button" : "img"}
      aria-label={node.label}
      tabIndex={onSelectNode ? 0 : undefined}
      data-testid="penny-graph-node"
      data-selected={selected}
      style={{ cursor: onSelectNode ? "pointer" : "default" }}
      onClick={() => onSelectNode?.(node)}
      onKeyDown={handleKeyDown}
    >
      {selected ? <SelectedNodeHalo radius={radius} /> : null}
      <circle
        r={radius}
        fill={palette.fill}
        stroke={selected ? "#17201b" : palette.stroke}
        strokeWidth={selected ? 2.4 : 1.2}
      />
      <circle r={Math.max(5, radius * 0.25)} fill={palette.stroke} opacity={selected ? 0.95 : 0.62} />
      <text x={0} y={radius + 18} textAnchor="middle" fill="#17201b" fontSize="12" fontWeight={selected ? 700 : 560}>
        {displayLabel(node.label)}
      </text>
      {confidence ? (
        <text x={0} y={radius + 33} textAnchor="middle" fill="#637069" fontSize="10">
          {confidence}
        </text>
      ) : null}
    </g>
  );
}
