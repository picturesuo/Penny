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

function pan(viewport: GraphViewport, translateX: number, translateY: number): GraphViewport {
  return {
    ...viewport,
    translateX: viewport.translateX + translateX,
    translateY: viewport.translateY + translateY,
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
        aria-label="Pan left"
        title="Pan left"
        style={graphControlButtonStyle}
        onClick={() => onViewportChange((current) => pan(current, 54, 0))}
      >
        &lt;
      </button>
      <button
        type="button"
        aria-label="Pan right"
        title="Pan right"
        style={graphControlButtonStyle}
        onClick={() => onViewportChange((current) => pan(current, -54, 0))}
      >
        &gt;
      </button>
      <button
        type="button"
        aria-label="Pan up"
        title="Pan up"
        style={graphControlButtonStyle}
        onClick={() => onViewportChange((current) => pan(current, 0, 42))}
      >
        ^
      </button>
      <button
        type="button"
        aria-label="Pan down"
        title="Pan down"
        style={graphControlButtonStyle}
        onClick={() => onViewportChange((current) => pan(current, 0, -42))}
      >
        v
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
