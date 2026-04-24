import { memo, type KeyboardEvent } from "react";

import type { GraphNode as GraphNodeModel } from "../../lib/types/graph";
import { ConfidenceChip } from "../confidence/ConfidenceChip";
import { getGraphNodeCluster, getGraphNodeRadius, type PositionedGraphNode } from "./graph-layout";
import { graphClusterColors } from "./graph-style";
import { SelectedNodeHalo } from "./selected-node-halo";

type GraphNodeProps = {
  node: PositionedGraphNode;
  connected?: boolean;
  muted?: boolean;
  selected?: boolean;
  onSelectNode?: (node: GraphNodeModel) => void;
};

function displayLabel(label: string) {
  return label.length > 32 ? `${label.slice(0, 31)}...` : label;
}

export const GraphNode = memo(function GraphNode({ connected = false, muted = false, node, selected = false, onSelectNode }: GraphNodeProps) {
  const palette = graphClusterColors[getGraphNodeCluster(node)];
  const radius = getGraphNodeRadius(node, selected);
  const confidenceBps = typeof node.confidenceBps === "number" ? node.confidenceBps : typeof node.confidence === "number" ? node.confidence * 100 : null;
  const hasContradictionMarker = node.status === "contradiction" || (typeof confidenceBps === "number" && confidenceBps < 6000);

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
      data-connected={connected}
      className="penny-graph-node-group"
      style={{ cursor: onSelectNode ? "pointer" : "default", opacity: muted ? 0.36 : 1 }}
      onClick={() => onSelectNode?.(node)}
      onKeyDown={handleKeyDown}
    >
      {selected ? <SelectedNodeHalo radius={radius} /> : null}
      <circle
        className="penny-graph-node-shell"
        r={radius}
        fill={palette.fill}
        stroke={selected ? palette.accent : palette.stroke}
        strokeWidth={selected ? 2.1 : connected ? 1.65 : 1.05}
      />
      <circle
        className="penny-graph-node-core"
        r={Math.max(5, radius * 0.25)}
        fill={palette.accent}
        opacity={selected ? 0.76 : 0.48}
      />
      <text
        className="penny-graph-node-label"
        x={0}
        y={radius + 18}
        textAnchor="middle"
        fill="#243029"
        fontSize="12"
        fontWeight={selected ? 680 : 540}
      >
        {displayLabel(node.label)}
      </text>
      <foreignObject x="-62" y={radius + 22} width="124" height="28">
        <div className="penny-graph-node-confidence">
          <ConfidenceChip scale="basis-points" showLabel={false} value={confidenceBps} />
        </div>
      </foreignObject>
      {hasContradictionMarker ? (
        <g transform={`translate(${radius * 0.72} ${-radius * 0.72})`} aria-label="Contradiction marker">
          <circle r="7" fill="#a23b32" stroke="#fffdf7" strokeWidth="2" />
          <text y="3.5" textAnchor="middle" fill="#fffdf7" fontSize="10" fontWeight="900">
            !
          </text>
        </g>
      ) : null}
    </g>
  );
});
