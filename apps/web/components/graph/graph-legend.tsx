import type { CSSProperties } from "react";

import type { GraphCluster } from "../../lib/types/graph";
import { graphClusterColors } from "./graph-style";

type GraphLegendProps = {
  clusters: GraphCluster[];
  focusedCluster?: GraphCluster | null;
  onFocusCluster?: (cluster: GraphCluster | null) => void;
};

const legendStyle: CSSProperties = {
  position: "absolute",
  top: 14,
  left: 14,
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  maxWidth: "calc(100% - 28px)",
  padding: "7px 8px",
  border: "1px solid rgba(23, 32, 27, 0.08)",
  borderRadius: 8,
  background: "rgba(253, 254, 251, 0.82)",
  boxShadow: "0 10px 26px rgba(23, 32, 27, 0.045)",
};

const itemStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: 0,
  borderRadius: 6,
  background: "transparent",
  color: "#68756e",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 650,
  padding: "3px 5px",
};

function labelForCluster(cluster: GraphCluster) {
  return cluster.charAt(0).toUpperCase() + cluster.slice(1);
}

export function GraphLegend({ clusters, focusedCluster = null, onFocusCluster }: GraphLegendProps) {
  if (!clusters.length) {
    return null;
  }

  return (
    <div aria-label="Graph legend" data-testid="penny-graph-legend" style={legendStyle}>
      {clusters.map((cluster) => {
        const palette = graphClusterColors[cluster];

        return (
          <button
            key={cluster}
            type="button"
            aria-pressed={focusedCluster === cluster}
            title={`Focus ${labelForCluster(cluster)} cluster`}
            style={{
              ...itemStyle,
              background: focusedCluster === cluster ? "rgba(47, 107, 85, 0.1)" : "transparent",
              color: focusedCluster === cluster ? "#174c3b" : itemStyle.color,
            }}
            onClick={() => onFocusCluster?.(focusedCluster === cluster ? null : cluster)}
          >
            <span
              aria-hidden="true"
              style={{
                width: 9,
                height: 9,
                borderRadius: 99,
                background: palette.fill,
                border: `1px solid ${palette.stroke}`,
              }}
            />
            {labelForCluster(cluster)}
          </button>
        );
      })}
    </div>
  );
}
