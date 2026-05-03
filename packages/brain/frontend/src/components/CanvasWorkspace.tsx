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
const canvasPadding = 150;

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
  const canvasSize = useMemo(() => canvasContentSize(nodes), [nodes]);
  const recommendedPath = canvasData.recommendedPath ?? [];
  const recommendedNodes = recommendedPath
    .map((nodeId) => nodes.find((node) => node.id === nodeId))
    .filter((node): node is PositionedCanvasNode => Boolean(node));
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0] ?? null;
  const isEmpty = loadState !== "loading" && nodes.length === 0;
  const selectedActions = selectedNode?.actions?.length ? selectedNode.actions : defaultCanvasActions;

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

      {recommendedNodes.length > 0 ? (
        <div className="canvas-path-strip" aria-label="Recommended path">
          <span>Recommended path</span>
          <ol>
            {recommendedNodes.map((node, index) => (
              <li key={node.id}>
                <button type="button" className={node.id === selectedNode?.id ? "is-selected" : ""} onClick={() => setSelectedNodeId(node.id)}>
                  <small>{index + 1}</small>
                  <strong>{node.title}</strong>
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="canvas-stage">
        <div className="canvas-board" aria-label="Thinking canvas">
          {isEmpty ? (
            <div className="canvas-empty-state">
              <strong>{loadState === "error" ? "Canvas unavailable" : "Canvas starts after the first saved idea"}</strong>
              <p>
                {loadState === "error"
                  ? loadError ?? "The session canvas could not be loaded."
                  : "Save an idea to Brain, then Canvas will show claims, assumptions, questions, and the recommended path."}
              </p>
            </div>
          ) : (
            <>
              <CanvasEdgeLayer
                edges={canvasData.edges}
                nodes={nodes}
                selectedNodeId={selectedNode?.id ?? null}
                recommendedPath={recommendedPath}
                width={canvasSize.width}
                height={canvasSize.height}
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

        <aside className="canvas-context-panel" aria-label="Selected node">
          <span>Selected node</span>
          {selectedNode ? (
            <>
              <strong>{selectedNode.title}</strong>
              <p>{selectedNode.summary ?? "No summary is attached to this node yet."}</p>
              <dl>
                <div>
                  <dt>Kind</dt>
                  <dd>{selectedNode.kind}</dd>
                </div>
                {selectedNode.status ? (
                  <div>
                    <dt>Status</dt>
                    <dd>{selectedNode.status}</dd>
                  </div>
                ) : null}
              </dl>
              <div className="canvas-context-actions">
                {selectedActions.map((action) => (
                  <button
                    key={action}
                    type="button"
                    disabled={disabled}
                    title={canvasActionTitle(action)}
                    onClick={() => onNodeAction(action, selectedNode)}
                  >
                    {canvasActionLabel(action)}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p>Select a graph node to open Learn, Check, Verify, Save, or Related actions.</p>
          )}
        </aside>
      </div>
    </section>
  );
}

const defaultCanvasActions: CanvasNodeAction[] = ["learn", "check", "verify", "save", "related"];

function canvasActionLabel(action: CanvasNodeAction): string {
  switch (action) {
    case "learn":
      return "Open in Learn";
    case "check":
      return "Check";
    case "verify":
      return "Verify";
    case "save":
      return "Save";
    case "related":
      return "Related";
  }
}

function canvasActionTitle(action: CanvasNodeAction): string {
  switch (action) {
    case "learn":
      return "Open Learn with this node as context";
    case "check":
      return "Open Check focused on this node";
    case "verify":
      return "Run Verify for this node";
    case "save":
      return "Save this node to Brain";
    case "related":
      return "Find related Brain context";
  }
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
  const laneOffset = row % 2 === 0 ? 0 : 138;

  return {
    x: 104 + column * 340 + laneOffset,
    y: 112 + row * 248 + (column % 2) * 46,
  };
}

function canvasContentSize(nodes: PositionedCanvasNode[]): { width: number; height: number } {
  if (nodes.length === 0) {
    return { width: 1080, height: 620 };
  }

  return {
    width: Math.max(1080, Math.ceil(Math.max(...nodes.map((node) => node.x + node.width)) + canvasPadding)),
    height: Math.max(620, Math.ceil(Math.max(...nodes.map((node) => node.y + node.height)) + canvasPadding)),
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
