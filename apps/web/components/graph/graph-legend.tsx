import type { CSSProperties } from "react";

import type { GraphCluster } from "../../lib/types/graph";
import { graphClusterColors } from "./graph-style";

type GraphLegendProps = {
  clusters: GraphCluster[];
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
  color: "#68756e",
  fontSize: 12,
  fontWeight: 650,
};

function labelForCluster(cluster: GraphCluster) {
  return cluster.charAt(0).toUpperCase() + cluster.slice(1);
}

export function GraphLegend({ clusters }: GraphLegendProps) {
  if (!clusters.length) {
    return null;
  }

  return (
    <div aria-label="Graph legend" data-testid="penny-graph-legend" style={legendStyle}>
      {clusters.map((cluster) => {
        const palette = graphClusterColors[cluster];

        return (
          <span key={cluster} style={itemStyle}>
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
          </span>
        );
      })}
    </div>
  );
}
