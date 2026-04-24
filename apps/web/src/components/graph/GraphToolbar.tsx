import type { GraphCluster, GraphViewport } from "../../../lib/types/graph";
import { GraphLegend } from "../../../components/graph/graph-legend";
import { ZoomControls } from "../../../components/graph/zoom-controls";
import { LensToggleBar, type LensToggle } from "./LensToggleBar";

type GraphToolbarProps = {
  clusters?: GraphCluster[];
  focusSelectedNode?: boolean;
  focusedCluster?: GraphCluster | null;
  lensToggles?: LensToggle[];
  onFocusCluster?: (cluster: GraphCluster | null) => void;
  onToggleFocusSelectedNode?: () => void;
  onViewportChange: (viewport: GraphViewport | ((current: GraphViewport) => GraphViewport)) => void;
  selectedNodeId?: string | null;
};

const focusRailStyle = {
  position: "absolute",
  left: "50%",
  top: 14,
  transform: "translateX(-50%)",
  display: "flex",
  gap: 6,
  padding: 4,
  border: "1px solid rgba(23, 32, 27, 0.08)",
  borderRadius: 8,
  background: "rgba(253, 254, 251, 0.88)",
  boxShadow: "0 10px 26px rgba(23, 32, 27, 0.055)",
} as const;

const focusButtonStyle = {
  minHeight: 30,
  border: "1px solid rgba(23, 32, 27, 0.1)",
  borderRadius: 6,
  padding: "0 10px",
  background: "#fffffc",
  color: "#17201b",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 750,
} as const;

export function GraphToolbar({
  clusters = [],
  focusSelectedNode = false,
  focusedCluster = null,
  lensToggles,
  onFocusCluster,
  onToggleFocusSelectedNode,
  onViewportChange,
  selectedNodeId,
}: GraphToolbarProps) {
  return (
    <>
      <GraphLegend clusters={clusters} focusedCluster={focusedCluster} onFocusCluster={onFocusCluster} />
      <div aria-label="Graph focus controls" data-testid="penny-graph-focus-controls" style={focusRailStyle}>
        <button
          type="button"
          aria-label="Focus selected node connections"
          aria-pressed={focusSelectedNode}
          disabled={!selectedNodeId}
          title="Focus selected node connections"
          style={{
            ...focusButtonStyle,
            background: focusSelectedNode ? "rgba(47, 107, 85, 0.12)" : focusButtonStyle.background,
            color: focusSelectedNode ? "#174c3b" : focusButtonStyle.color,
            cursor: selectedNodeId ? "pointer" : "not-allowed",
            opacity: selectedNodeId ? 1 : 0.58,
          }}
          onClick={onToggleFocusSelectedNode}
        >
          Focus
        </button>
      </div>
      <ZoomControls onViewportChange={onViewportChange} />
      <LensToggleBar toggles={lensToggles} />
    </>
  );
}
