"use client";

import { useMemo, useState, type PointerEvent, type WheelEvent } from "react";

import type { GraphCluster, GraphModel, GraphNode, GraphViewport } from "../../lib/types/graph";
import { GraphToolbar } from "../../src/components/graph/GraphToolbar";
import { MiniMap } from "../../src/components/graph/MiniMap";
import { GraphCanvas } from "./graph-canvas";
import { createNodeLookup, positionGraphNodes } from "./graph-layout";
import { graphSurfaceStyle, graphViewBox, initialGraphViewport } from "./graph-style";

type GraphViewProps = {
  graph: GraphModel;
  selectedNodeId?: string | null;
  onSelectNode?: (node: GraphNode) => void;
  height?: number;
};

export function GraphView({ graph, selectedNodeId, onSelectNode, height = 460 }: GraphViewProps) {
  const [localSelectedNodeId, setLocalSelectedNodeId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<GraphViewport>(initialGraphViewport);
  const [focusedCluster, setFocusedCluster] = useState<GraphCluster | null>(null);
  const [focusSelectedNode, setFocusSelectedNode] = useState(false);
  const [panStart, setPanStart] = useState<{ pointerId: number; x: number; y: number; viewport: GraphViewport } | null>(null);
  const nodes = useMemo(() => positionGraphNodes(graph.nodes), [graph.nodes]);
  const nodesById = useMemo(() => createNodeLookup(nodes), [nodes]);
  const hasControlledSelection = selectedNodeId !== undefined;
  const activeNodeId = hasControlledSelection ? selectedNodeId : localSelectedNodeId ?? graph.selectedNodeId ?? null;
  const clusters = useMemo(() => Array.from(new Set(nodes.map((node) => node.cluster))), [nodes]);

  function selectNode(node: GraphNode) {
    setLocalSelectedNodeId(node.id);
    onSelectNode?.(node);
  }

  function focusCluster(cluster: GraphCluster | null) {
    setFocusedCluster(cluster);

    if (!cluster) {
      setViewport(initialGraphViewport);
      return;
    }

    const clusterNodes = nodes.filter((node) => node.cluster === cluster);

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
        touchAction: "none",
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
