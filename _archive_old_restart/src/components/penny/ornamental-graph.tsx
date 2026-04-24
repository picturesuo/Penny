import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

type OrnamentalGraphVariant = "cluster" | "brain-map" | "mini-map" | "concept-map" | "cascade";

type NodeSpec = {
  x: number;
  y: number;
  r: number;
  tone: "accent" | "muted" | "soft";
};

type EdgeSpec = {
  from: number;
  to: number;
};

type GraphSpec = {
  viewBox: string;
  nodes: NodeSpec[];
  edges: EdgeSpec[];
};

const GRAPH_SPECS: Record<OrnamentalGraphVariant, GraphSpec> = {
  cluster: {
    viewBox: "0 0 84 56",
    nodes: [
      { x: 15, y: 31, r: 4.5, tone: "muted" },
      { x: 32, y: 14, r: 3.5, tone: "soft" },
      { x: 44, y: 28, r: 5.5, tone: "accent" },
      { x: 63, y: 16, r: 3.5, tone: "soft" },
      { x: 68, y: 40, r: 4, tone: "muted" },
      { x: 28, y: 43, r: 3.5, tone: "soft" },
    ],
    edges: [
      { from: 0, to: 2 },
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 2, to: 4 },
      { from: 2, to: 5 },
    ],
  },
  "brain-map": {
    viewBox: "0 0 220 128",
    nodes: [
      { x: 110, y: 28, r: 8, tone: "accent" },
      { x: 52, y: 74, r: 5, tone: "muted" },
      { x: 110, y: 96, r: 5, tone: "soft" },
      { x: 168, y: 72, r: 5.5, tone: "muted" },
      { x: 34, y: 30, r: 4, tone: "soft" },
      { x: 184, y: 30, r: 4, tone: "soft" },
    ],
    edges: [
      { from: 0, to: 1 },
      { from: 0, to: 2 },
      { from: 0, to: 3 },
      { from: 4, to: 0 },
      { from: 5, to: 0 },
    ],
  },
  "mini-map": {
    viewBox: "0 0 132 88",
    nodes: [
      { x: 18, y: 46, r: 4, tone: "muted" },
      { x: 42, y: 18, r: 3.5, tone: "soft" },
      { x: 64, y: 42, r: 6.5, tone: "accent" },
      { x: 92, y: 24, r: 4, tone: "soft" },
      { x: 108, y: 58, r: 4, tone: "muted" },
      { x: 40, y: 68, r: 3.5, tone: "soft" },
    ],
    edges: [
      { from: 0, to: 2 },
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 2, to: 4 },
      { from: 2, to: 5 },
    ],
  },
  "concept-map": {
    viewBox: "0 0 220 140",
    nodes: [
      { x: 110, y: 26, r: 5, tone: "muted" },
      { x: 110, y: 68, r: 9, tone: "accent" },
      { x: 58, y: 114, r: 5.5, tone: "soft" },
      { x: 162, y: 112, r: 5.5, tone: "soft" },
      { x: 30, y: 72, r: 3.5, tone: "muted" },
      { x: 190, y: 74, r: 3.5, tone: "muted" },
    ],
    edges: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 1, to: 3 },
      { from: 4, to: 1 },
      { from: 1, to: 5 },
    ],
  },
  cascade: {
    viewBox: "0 0 220 108",
    nodes: [
      { x: 34, y: 54, r: 6.5, tone: "muted" },
      { x: 98, y: 38, r: 5.5, tone: "soft" },
      { x: 122, y: 66, r: 8, tone: "accent" },
      { x: 178, y: 30, r: 4.5, tone: "soft" },
      { x: 186, y: 78, r: 4.5, tone: "muted" },
    ],
    edges: [
      { from: 0, to: 1 },
      { from: 0, to: 2 },
      { from: 1, to: 3 },
      { from: 2, to: 4 },
    ],
  },
};

type OrnamentalGraphProps = {
  variant?: OrnamentalGraphVariant;
  className?: string;
  accent?: string;
};

export function OrnamentalGraph({
  variant = "cluster",
  className,
  accent = "var(--brain)",
}: OrnamentalGraphProps) {
  const spec = GRAPH_SPECS[variant];

  return (
    <svg
      viewBox={spec.viewBox}
      fill="none"
      aria-hidden="true"
      className={cn("block w-full text-[var(--muted-ink)]", className)}
      style={
        {
          "--ornamental-accent": accent,
        } as CSSProperties
      }
    >
      <defs>
        <radialGradient id={`ornamental-glow-${variant}`} cx="50%" cy="50%" r="65%">
          <stop offset="0%" stopColor="color-mix(in srgb, var(--ornamental-accent) 24%, white 76%)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>

      <rect x="0" y="0" width="100%" height="100%" rx="18" fill="url(#ornamental-glow-${variant})" opacity="0.35" />

      {spec.edges.map((edge, index) => {
        const from = spec.nodes[edge.from];
        const to = spec.nodes[edge.to];

        return (
          <line
            key={`${edge.from}-${edge.to}-${index}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke="rgba(45, 36, 31, 0.12)"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        );
      })}

      {spec.nodes.map((node, index) => (
        <g key={`${variant}-node-${index}`}>
          <circle
            cx={node.x}
            cy={node.y}
            r={node.r + (node.tone === "accent" ? 7 : 5)}
            fill={node.tone === "accent" ? "color-mix(in srgb, var(--ornamental-accent) 16%, white 84%)" : "rgba(255,255,255,0.42)"}
          />
          <circle
            cx={node.x}
            cy={node.y}
            r={node.r}
            fill={
              node.tone === "accent"
                ? "var(--ornamental-accent)"
                : node.tone === "soft"
                  ? "rgba(123, 109, 99, 0.2)"
                  : "rgba(123, 109, 99, 0.36)"
            }
          />
        </g>
      ))}
    </svg>
  );
}
