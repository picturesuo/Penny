import React from "react";
import { useEffect, useMemo, useState } from "react";
import { fetchSessionCanvas } from "../api/brainClient";
import type { BrainData, CanvasNode, CanvasNodeAction, SessionCanvasData } from "../types/brain";
import { CanvasEdgeLayer, type PositionedCanvasNode } from "./CanvasEdgeLayer";
import { CanvasNodeCard } from "./CanvasNodeCard";

interface CanvasWorkspaceProps {
  sessionId: string | null;
  data: BrainData | null;
  focusedClaimId: string | null;
  disabled?: boolean;
  initialCanvasData?: SessionCanvasData;
  onNodeAction: (action: CanvasNodeAction, node: CanvasNode) => void;
}

const nodeWidth = 236;
const nodeHeight = 132;

export function CanvasWorkspace({
  sessionId,
  data,
  focusedClaimId,
  disabled = false,
  initialCanvasData,
  onNodeAction,
}: CanvasWorkspaceProps) {
  const fallbackCanvas = useMemo(
    () => initialCanvasData ?? buildMockCanvasData(sessionId, data, focusedClaimId),
    [data, focusedClaimId, initialCanvasData, sessionId],
  );
  const [canvasData, setCanvasData] = useState<SessionCanvasData>(fallbackCanvas);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    fallbackCanvas.selectedNodeId ?? fallbackCanvas.nodes[0]?.id ?? null,
  );
  const [loadState, setLoadState] = useState<"stub" | "loading" | "ready">("stub");

  useEffect(() => {
    setCanvasData(fallbackCanvas);
    setSelectedNodeId(fallbackCanvas.selectedNodeId ?? fallbackCanvas.nodes[0]?.id ?? null);
  }, [fallbackCanvas]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    let cancelled = false;
    setLoadState("loading");

    fetchSessionCanvas(sessionId)
      .then((response) => {
        if (cancelled) {
          return;
        }

        const nextCanvas = response.nodes.length > 0 ? response : fallbackCanvas;
        setCanvasData(nextCanvas);
        setSelectedNodeId(nextCanvas.selectedNodeId ?? nextCanvas.nodes[0]?.id ?? null);
        setLoadState("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setCanvasData(fallbackCanvas);
          setLoadState("stub");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fallbackCanvas, sessionId]);

  const nodes = useMemo(() => layoutCanvasNodes(canvasData.nodes), [canvasData.nodes]);
  const recommendedPath = canvasData.recommendedPath ?? [];
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0] ?? null;

  return (
    <section className="canvas-workspace" aria-label="Canvas workspace">
      <header className="canvas-toolbar">
        <div>
          <span className="section-label">CANVAS</span>
          <h2>Thinking graph</h2>
        </div>
        <div className="canvas-toolbar-meta" aria-label="Canvas status">
          <span>{loadState === "ready" ? "Session canvas" : loadState === "loading" ? "Loading canvas" : "Mock canvas"}</span>
          <span>{nodes.length} nodes</span>
          <span>{canvasData.edges.length} edges</span>
        </div>
      </header>

      <div className="canvas-board" aria-label="Miro-style thinking canvas">
        <CanvasEdgeLayer
          edges={canvasData.edges}
          nodes={nodes}
          selectedNodeId={selectedNode?.id ?? null}
          recommendedPath={recommendedPath}
        />
        {nodes.map((node) => (
          <CanvasNodeCard
            key={node.id}
            node={node}
            selected={node.id === selectedNode?.id}
            recommended={recommendedPath.includes(node.id)}
            onSelect={setSelectedNodeId}
            onAction={disabled ? () => undefined : onNodeAction}
          />
        ))}
      </div>
    </section>
  );
}

export function buildMockCanvasData(
  sessionId: string | null,
  data: BrainData | null,
  focusedClaimId: string | null = null,
): SessionCanvasData {
  const claims = data?.ideaMap?.claims ?? [];
  const edges = data?.ideaMap?.edges ?? [];

  if (claims.length > 0) {
    const nodeIdsByClaimId = new Map(claims.map((claim) => [claim.id, `claim:${claim.id}`]));
    const nodes = claims.slice(0, 8).map((claim, index) => ({
      id: nodeIdsByClaimId.get(claim.id) ?? `claim:${claim.id}`,
      kind: claim.kind,
      title: claim.kind === "belief" ? "Claim" : claim.kind,
      summary: claim.text,
      status: claim.status,
      confidence: typeof claim.confidence === "number" ? claim.confidence : null,
      refs: { claimId: claim.id },
      ...gridPosition(index),
    }));
    const canvasEdges = edges
      .map((edge) => ({
        id: `edge:${edge.id}`,
        source: nodeIdsByClaimId.get(edge.fromClaimId) ?? "",
        target: nodeIdsByClaimId.get(edge.toClaimId) ?? "",
        kind: edge.kind,
        label: edge.label ?? edge.kind,
      }))
      .filter((edge) => edge.source && edge.target);
    const selectedNodeId = focusedClaimId ? nodeIdsByClaimId.get(focusedClaimId) : nodes[0]?.id;

    return {
      nodes,
      edges: canvasEdges,
      recommendedPath: nodes.slice(0, 4).map((node) => node.id),
      ...(selectedNodeId ? { selectedNodeId } : {}),
    };
  }

  return {
    selectedNodeId: "canvas-seed",
    recommendedPath: ["canvas-seed", "canvas-assumption", "canvas-verify", "canvas-brief"],
    nodes: [
      {
        id: "canvas-seed",
        kind: "claim",
        title: "Dropped idea",
        summary: data?.source?.rawText ?? "Drop an idea in Learn to turn it into a canvas.",
        status: sessionId ? "open" : "draft",
        confidence: 60,
        x: 120,
        y: 130,
        refs: {},
      },
      {
        id: "canvas-assumption",
        kind: "assumption",
        title: "Hidden assumption",
        summary: "Penny will place the load-bearing assumption here after the graph is persisted.",
        status: "exploratory",
        confidence: 54,
        x: 430,
        y: 95,
        refs: {},
      },
      {
        id: "canvas-verify",
        kind: "question",
        title: "Evidence to verify",
        summary: "Verify turns the riskiest factual claim into source-grounded evidence.",
        status: "open",
        confidence: null,
        x: 430,
        y: 310,
        refs: {},
      },
      {
        id: "canvas-brief",
        kind: "artifact",
        title: "Challenge Brief",
        summary: "The first useful artifact appears after Check and response.",
        status: "draft",
        confidence: null,
        x: 760,
        y: 210,
        refs: {},
      },
    ],
    edges: [
      { id: "canvas-edge-seed-assumption", source: "canvas-seed", target: "canvas-assumption", kind: "depends_on", label: "depends on" },
      { id: "canvas-edge-assumption-verify", source: "canvas-assumption", target: "canvas-verify", kind: "questions", label: "needs evidence" },
      { id: "canvas-edge-verify-brief", source: "canvas-verify", target: "canvas-brief", kind: "supports", label: "feeds" },
    ],
  };
}

function layoutCanvasNodes(nodes: CanvasNode[]): PositionedCanvasNode[] {
  return nodes.map((node, index) => ({
    ...node,
    ...gridPosition(index),
    ...(typeof node.x === "number" ? { x: node.x } : {}),
    ...(typeof node.y === "number" ? { y: node.y } : {}),
    width: nodeWidth,
    height: nodeHeight,
  }));
}

function gridPosition(index: number): { x: number; y: number } {
  const column = index % 4;
  const row = Math.floor(index / 4);
  const laneOffset = row % 2 === 0 ? 0 : 96;

  return {
    x: 92 + column * 270 + laneOffset,
    y: 90 + row * 190 + (column % 2) * 34,
  };
}
