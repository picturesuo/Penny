"use client";

import { useMemo, useState, type PointerEvent, type WheelEvent } from "react";

import { useWorkspaceState } from "../../lib/state/workspace-state";
import type { GraphCluster, GraphModel, GraphNode, GraphViewport } from "../../lib/types/graph";
import { GraphToolbar } from "../../src/components/graph/GraphToolbar";
import { MiniMap } from "../../src/components/graph/MiniMap";
import { GraphCanvas, type GraphLensId } from "./graph-canvas";
import { createNodeLookup, getGraphNodeCluster, positionGraphNodes } from "./graph-layout";
import { graphSurfaceStyle, graphViewBox, initialGraphViewport } from "./graph-style";

type GraphViewProps = {
  graph: GraphModel;
  selectedNodeId?: string | null;
  onSelectNode?: (node: GraphNode) => void;
  height?: number;
};

export function GraphView({ graph, selectedNodeId, onSelectNode, height = 460 }: GraphViewProps) {
  const { selectedNodeId: storedSelectedNodeId, setSelectedNodeId } = useWorkspaceState();
  const [viewport, setViewport] = useState<GraphViewport>(initialGraphViewport);
  const [focusedCluster, setFocusedCluster] = useState<GraphCluster | null>(null);
  const [focusSelectedNode, setFocusSelectedNode] = useState(false);
  const [activeLensIds, setActiveLensIds] = useState<Set<GraphLensId>>(() => new Set(["claims", "contradictions", "dependencies", "recent"]));
  const [panStart, setPanStart] = useState<{ pointerId: number; x: number; y: number; viewport: GraphViewport } | null>(null);
  const nodes = useMemo(() => positionGraphNodes(graph.nodes), [graph.nodes]);
  const nodesById = useMemo(() => createNodeLookup(nodes), [nodes]);
  const hasControlledSelection = selectedNodeId !== undefined;
  const activeNodeId = hasControlledSelection ? selectedNodeId : storedSelectedNodeId ?? graph.selectedNodeId ?? null;
  const clusters = useMemo(() => Array.from(new Set(nodes.map((node) => getGraphNodeCluster(node)))), [nodes]);

  if (nodes.length === 0) {
    return (
      <section
        aria-label={`${graph.title} empty state`}
        data-testid="penny-graph"
        style={{
          ...graphSurfaceStyle,
          display: "grid",
          minHeight: height,
          placeItems: "center",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 360, padding: 24 }}>
          <p className="penny-kicker">Graph</p>
          <h2 style={{ color: "var(--penny-ink)", margin: 0 }}>No graph nodes yet</h2>
          <p style={{ color: "var(--penny-muted)", lineHeight: 1.55, margin: "10px 0 0" }}>
            Capture a thought or create a claim to give this map something to render.
          </p>
        </div>
      </section>
    );
  }

  function selectNode(node: GraphNode) {
    setSelectedNodeId(node.id);
    onSelectNode?.(node);
  }

  function toggleLens(lensId: GraphLensId) {
    setActiveLensIds((current) => {
      const next = new Set(current);

      if (next.has(lensId)) {
        next.delete(lensId);
      } else {
        next.add(lensId);
      }

      return next;
    });
  }

  function focusCluster(cluster: GraphCluster | null) {
    setFocusedCluster(cluster);

    if (!cluster) {
      setViewport(initialGraphViewport);
      return;
    }

    const clusterNodes = nodes.filter((node) => getGraphNodeCluster(node) === cluster);

    if (clusterNodes.length === 0) {
      return;
    }

    const centerX = clusterNodes.reduce((sum, node) => sum + node.x, 0) / clusterNodes.length;
    const centerY = clusterNodes.reduce((sum, node) => sum + node.y, 0) / clusterNodes.length;
    const scale = clusterNodes.length > 2 ? 1.14 : 1.24;

    setViewport({
      scale,
      translateX: -(centerX * scale),
      translateY: -(centerY * scale),
    });
  }

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    const target = event.target as Element;

    if (target.closest(".penny-graph-node-group, button, [data-testid='penny-graph-minimap']")) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setPanStart({ pointerId: event.pointerId, x: event.clientX, y: event.clientY, viewport });
  }

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    if (!panStart || panStart.pointerId !== event.pointerId) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const dx = ((event.clientX - panStart.x) / bounds.width) * graphViewBox.width;
    const dy = ((event.clientY - panStart.y) / bounds.height) * graphViewBox.height;

    setViewport({
      ...panStart.viewport,
      translateX: panStart.viewport.translateX + dx,
      translateY: panStart.viewport.translateY + dy,
    });
  }

  function handlePointerUp(event: PointerEvent<HTMLElement>) {
    if (panStart?.pointerId === event.pointerId) {
      setPanStart(null);
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleWheel(event: WheelEvent<HTMLElement>) {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.08 : 0.08;

    setViewport((current) => ({
      ...current,
      scale: Math.min(1.8, Math.max(0.58, Number((current.scale + delta).toFixed(2)))),
    }));
  }

  return (
    <section
      aria-label={graph.title}
      data-testid="penny-graph"
      style={{
        ...graphSurfaceStyle,
        cursor: panStart ? "grabbing" : "grab",
        height,
        maxWidth: "100%",
        touchAction: "pan-x pan-y",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
    >
      <GraphCanvas
        nodes={nodes}
        edges={graph.edges}
        nodesById={nodesById}
        viewport={viewport}
        activeLensIds={activeLensIds}
        selectedNodeId={activeNodeId}
        focusNodeId={focusSelectedNode ? activeNodeId : null}
        focusedCluster={focusedCluster}
        onSelectNode={selectNode}
      />
      <GraphToolbar
        clusters={clusters}
        focusSelectedNode={focusSelectedNode}
        focusedCluster={focusedCluster}
        onFocusCluster={focusCluster}
        onToggleFocusSelectedNode={() => setFocusSelectedNode((current) => !current)}
        onViewportChange={setViewport}
        lensToggles={[
          { id: "claims", label: "Claims", pressed: activeLensIds.has("claims"), onToggle: () => toggleLens("claims") },
          {
            id: "contradictions",
            label: "Contradictions",
            pressed: activeLensIds.has("contradictions"),
            onToggle: () => toggleLens("contradictions"),
          },
          {
            id: "dependencies",
            label: "Dependencies",
            pressed: activeLensIds.has("dependencies"),
            onToggle: () => toggleLens("dependencies"),
          },
          { id: "recent", label: "Recent", pressed: activeLensIds.has("recent"), onToggle: () => toggleLens("recent") },
        ]}
        selectedNodeId={activeNodeId}
      />
      <MiniMap
        nodes={nodes}
        edges={graph.edges}
        nodesById={nodesById}
        selectedNodeId={activeNodeId}
        viewport={viewport}
        onViewportChange={setViewport}
      />
    </section>
  );
}
