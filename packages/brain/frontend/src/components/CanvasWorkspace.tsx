import React, { useEffect, useMemo, useState } from "react";
import { fetchSessionCanvas } from "../api/brainClient";
import type { CanvasNode, CanvasNodeAction, SessionCanvasData } from "../types/brain";
import { CanvasEdgeLayer, type PositionedCanvasNode } from "./CanvasEdgeLayer";
import { CanvasNodeCard } from "./CanvasNodeCard";

interface CanvasWorkspaceProps {
  sessionId: string | null;
  focusedClaimId: string | null;
  disabled?: boolean;
  initialCanvasData?: SessionCanvasData;
  onNodeAction: (action: CanvasNodeAction, node: CanvasNode) => void;
}

const emptyCanvas: SessionCanvasData = {
  nodes: [],
  edges: [],
};

const nodeWidth = 236;
const nodeHeight = 132;

export function CanvasWorkspace({
  sessionId,
  focusedClaimId,
  disabled = false,
  initialCanvasData,
  onNodeAction,
}: CanvasWorkspaceProps) {
  const [canvasData, setCanvasData] = useState<SessionCanvasData>(initialCanvasData ?? emptyCanvas);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    selectedNodeFrom(initialCanvasData ?? emptyCanvas, focusedClaimId),
  );
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">(
    initialCanvasData ? "ready" : "idle",
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialCanvasData) {
      return;
    }

    setCanvasData(initialCanvasData);
    setSelectedNodeId(selectedNodeFrom(initialCanvasData, focusedClaimId));
    setLoadState("ready");
    setLoadError(null);
  }, [focusedClaimId, initialCanvasData]);

  useEffect(() => {
    if (!sessionId || initialCanvasData) {
      if (!sessionId && !initialCanvasData) {
        setCanvasData(emptyCanvas);
        setSelectedNodeId(null);
        setLoadState("idle");
        setLoadError(null);
      }
      return;
    }

    let cancelled = false;
    setLoadState("loading");
    setLoadError(null);

    fetchSessionCanvas(sessionId)
      .then((response) => {
        if (cancelled) {
          return;
        }

        setCanvasData(response.data);
        setSelectedNodeId(selectedNodeFrom(response.data, focusedClaimId));
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setCanvasData(emptyCanvas);
        setSelectedNodeId(null);
        setLoadState("error");
        setLoadError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
    };
  }, [focusedClaimId, initialCanvasData, sessionId]);

  const nodes = useMemo(() => layoutCanvasNodes(canvasData.nodes), [canvasData.nodes]);
  const recommendedPath = canvasData.recommendedPath ?? [];
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0] ?? null;
  const isEmpty = loadState !== "loading" && nodes.length === 0;

  return (
    <section className="canvas-workspace" aria-label="Canvas workspace">
      <header className="canvas-toolbar">
        <div>
          <span className="section-label">CANVAS</span>
          <h2>Thinking graph</h2>
        </div>
        <div className="canvas-toolbar-meta" aria-label="Canvas status">
          <span>{canvasStatusLabel(loadState)}</span>
          <span>{nodes.length} nodes</span>
          <span>{canvasData.edges.length} edges</span>
          {recommendedPath.length > 0 ? <span>{recommendedPath.length} path steps</span> : null}
        </div>
      </header>

      <div className="canvas-board" aria-label="Thinking canvas">
        {isEmpty ? (
          <div className="canvas-empty-state">
            <strong>{loadState === "error" ? "Canvas unavailable" : "No canvas nodes yet"}</strong>
            <p>
              {loadState === "error"
                ? loadError ?? "The session canvas could not be loaded."
                : "Penny will show backend graph nodes here after the session has canvas data."}
            </p>
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>
    </section>
  );
}

function selectedNodeFrom(canvas: SessionCanvasData, focusedClaimId: string | null): string | null {
  if (focusedClaimId) {
    const focused = canvas.nodes.find((node) => node.refs?.claimId === focusedClaimId || node.id === `claim:${focusedClaimId}`);

    if (focused) {
      return focused.id;
    }
  }

  return canvas.selectedNodeId ?? canvas.nodes[0]?.id ?? null;
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

function canvasStatusLabel(loadState: "idle" | "loading" | "ready" | "error"): string {
  switch (loadState) {
    case "loading":
      return "Loading canvas";
    case "ready":
      return "Session canvas";
    case "error":
      return "Canvas error";
    default:
      return "No session";
  }
}
