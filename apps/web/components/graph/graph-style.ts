import type { CSSProperties } from "react";

import type { GraphCluster, GraphViewport } from "../../lib/types/graph";

export const graphViewBox = {
  x: -520,
  y: -310,
  width: 1040,
  height: 620,
} as const;

export const graphViewBoxValue = `${graphViewBox.x} ${graphViewBox.y} ${graphViewBox.width} ${graphViewBox.height}`;

export const initialGraphViewport: GraphViewport = {
  scale: 1,
  translateX: 0,
  translateY: 0,
};

export const graphClusterColors: Record<GraphCluster, { fill: string; stroke: string; accent: string }> = {
  map: { fill: "#edf5ee", stroke: "#6e8a77", accent: "#476a55" },
  claim: { fill: "#edf4f7", stroke: "#6d8796", accent: "#42677a" },
  challenge: { fill: "#f6eee8", stroke: "#b28a6c", accent: "#8d6045" },
  critique: { fill: "#f3eff6", stroke: "#8d7c99", accent: "#695a78" },
  learn: { fill: "#f1f4e7", stroke: "#858b5a", accent: "#656b3f" },
  event: { fill: "#f7f0ea", stroke: "#aa846b", accent: "#89654d" },
  context: { fill: "#f0f4f0", stroke: "#7c8a81", accent: "#606d65" },
};

export const graphSurfaceStyle: CSSProperties = {
  position: "relative",
  minHeight: 360,
  overflow: "hidden",
  border: "1px solid rgba(23, 32, 27, 0.08)",
  borderRadius: 8,
  background:
    "radial-gradient(circle at 18% 18%, rgba(47, 107, 85, 0.035), transparent 30%), linear-gradient(180deg, #fdfefb 0%, #f7faf4 100%)",
};

export const graphControlRailStyle: CSSProperties = {
  position: "absolute",
  left: 14,
  bottom: 14,
  display: "flex",
  gap: 6,
  padding: 4,
  border: "1px solid rgba(23, 32, 27, 0.08)",
  borderRadius: 8,
  background: "rgba(253, 254, 251, 0.88)",
  boxShadow: "0 10px 26px rgba(23, 32, 27, 0.055)",
};

export const graphControlButtonStyle: CSSProperties = {
  width: 34,
  height: 34,
  border: "1px solid rgba(23, 32, 27, 0.1)",
  borderRadius: 6,
  background: "#fffffc",
  color: "#17201b",
  cursor: "pointer",
  fontWeight: 700,
};

export const graphMiniMapStyle: CSSProperties = {
  position: "absolute",
  right: 14,
  bottom: 14,
  width: 148,
  height: 96,
  border: "1px solid rgba(23, 32, 27, 0.1)",
  borderRadius: 8,
  background: "rgba(253, 254, 251, 0.9)",
  boxShadow: "0 10px 26px rgba(23, 32, 27, 0.055)",
};
