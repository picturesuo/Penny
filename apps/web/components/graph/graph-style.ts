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

export const graphClusterColors: Record<GraphCluster, { fill: string; stroke: string }> = {
  map: { fill: "#e6efe6", stroke: "#55735f" },
  claim: { fill: "#e7eef2", stroke: "#526f82" },
  challenge: { fill: "#f1e8df", stroke: "#9a6947" },
  critique: { fill: "#eee9f1", stroke: "#71627f" },
  learn: { fill: "#edf0df", stroke: "#6f7445" },
  event: { fill: "#f3ece5", stroke: "#9b765b" },
  context: { fill: "#edf0ed", stroke: "#69736c" },
};

export const graphSurfaceStyle: CSSProperties = {
  position: "relative",
  minHeight: 360,
  overflow: "hidden",
  border: "1px solid rgba(23, 32, 27, 0.1)",
  borderRadius: 8,
  background: "#fbfcf7",
};

export const graphControlRailStyle: CSSProperties = {
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

export const graphControlButtonStyle: CSSProperties = {
  width: 34,
  height: 34,
  border: "1px solid rgba(23, 32, 27, 0.12)",
  borderRadius: 6,
  background: "#ffffff",
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
  border: "1px solid rgba(23, 32, 27, 0.12)",
  borderRadius: 8,
  background: "rgba(251, 252, 247, 0.92)",
  boxShadow: "0 10px 28px rgba(23, 32, 27, 0.08)",
};
