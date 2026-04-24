import type { GraphViewport } from "../../lib/types/graph";
import { graphControlButtonStyle, graphControlRailStyle, initialGraphViewport } from "./graph-style";

type ZoomControlsProps = {
  onViewportChange: (viewport: GraphViewport | ((current: GraphViewport) => GraphViewport)) => void;
};

function zoom(viewport: GraphViewport, delta: number): GraphViewport {
  const scale = Math.min(1.8, Math.max(0.58, Number((viewport.scale + delta).toFixed(2))));
  return {
    ...viewport,
    scale,
  };
}

export function ZoomControls({ onViewportChange }: ZoomControlsProps) {
  return (
    <div aria-label="Graph controls" data-testid="penny-graph-controls" style={graphControlRailStyle}>
      <button
        type="button"
        aria-label="Zoom in"
        title="Zoom in"
        style={graphControlButtonStyle}
        onClick={() => onViewportChange((current) => zoom(current, 0.12))}
      >
        +
      </button>
      <button
        type="button"
        aria-label="Zoom out"
        title="Zoom out"
        style={graphControlButtonStyle}
        onClick={() => onViewportChange((current) => zoom(current, -0.12))}
      >
        -
      </button>
      <button
        type="button"
        aria-label="Fit graph"
        title="Fit graph"
        style={{
          ...graphControlButtonStyle,
          width: 42,
        }}
        onClick={() => onViewportChange(initialGraphViewport)}
      >
        [ ]
      </button>
    </div>
  );
}
