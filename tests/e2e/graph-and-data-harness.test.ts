import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const brainGraphMapPath = new URL("../../apps/web/components/graph/brain-graph-map.tsx", import.meta.url);
const contextGraphViewPath = new URL("../../apps/web/components/graph/context-graph-view.tsx", import.meta.url);
const graphViewPath = new URL("../../apps/web/components/graph/graph-view.tsx", import.meta.url);
const graphCanvasPath = new URL("../../apps/web/components/graph/graph-canvas.tsx", import.meta.url);
const graphNodePath = new URL("../../apps/web/components/graph/graph-node.tsx", import.meta.url);
const mockGraphDataPath = new URL("../../apps/web/components/graph/mock-graph-data.ts", import.meta.url);
const miniMapPath = new URL("../../apps/web/components/graph/mini-map.tsx", import.meta.url);
const zoomControlsPath = new URL("../../apps/web/components/graph/zoom-controls.tsx", import.meta.url);
const graphIndexPath = new URL("../../apps/web/components/graph/index.ts", import.meta.url);
const hooksPath = new URL("../../apps/web/lib/hooks/use-workspace-view.ts", import.meta.url);
const graphTypesPath = new URL("../../apps/web/lib/types/graph.ts", import.meta.url);
const srcGraphToolbarPath = new URL("../../apps/web/src/components/graph/GraphToolbar.tsx", import.meta.url);
const srcLensToggleBarPath = new URL("../../apps/web/src/components/graph/LensToggleBar.tsx", import.meta.url);

test("graph e2e harness can target the graph surface without redesigning the shell", async () => {
  const [viewSource, nodeSource, miniMapSource, zoomSource, toolbarSource, lensSource, canvasSource, typeSource] = await Promise.all([
    readFile(graphViewPath, "utf8"),
    readFile(graphNodePath, "utf8"),
    readFile(miniMapPath, "utf8"),
    readFile(zoomControlsPath, "utf8"),
    readFile(srcGraphToolbarPath, "utf8"),
    readFile(srcLensToggleBarPath, "utf8"),
    readFile(graphCanvasPath, "utf8"),
    readFile(graphTypesPath, "utf8"),
  ]);

  assert.match(viewSource, /data-testid="penny-graph"/);
  assert.match(nodeSource, /data-testid="penny-graph-node"/);
  assert.match(miniMapSource, /data-testid="penny-graph-minimap"/);
  assert.match(miniMapSource, /Current graph viewport/);
  assert.match(zoomSource, /aria-label="Zoom in"/);
  assert.match(zoomSource, /aria-label="Zoom out"/);
  assert.match(zoomSource, /aria-label="Pan left"/);
  assert.match(zoomSource, /aria-label="Fit graph"/);
  assert.match(viewSource, /onWheel/);
  assert.match(viewSource, /onPointerMove/);
  assert.match(viewSource, /useWorkspaceState/);
  assert.match(viewSource, /setSelectedNodeId\(node\.id\)/);
  assert.match(viewSource, /const selectNode = useCallback|function selectNode/);
  assert.match(viewSource, /onSelectNode\?\.\(node\)/);
  assert.match(toolbarSource, /LensToggleBar/);
  assert.match(toolbarSource, /data-testid="penny-graph-focus-controls"/);
  assert.match(toolbarSource, /Focus selected node connections/);
  assert.match(viewSource, /focusSelectedNode/);
  assert.match(canvasSource, /focusNodeId/);
  assert.match(canvasSource, /activeLensIds/);
  assert.match(lensSource, /data-testid="penny-graph-lens-toggles"/);
  assert.match(lensSource, /Claims/);
  assert.match(lensSource, /Contradictions/);
  assert.match(lensSource, /Dependencies/);
  assert.match(lensSource, /Recent/);
  assert.match(typeSource, /type\?: GraphNodeType/);
  assert.match(typeSource, /confidence\?: number \| null/);
  assert.match(typeSource, /activityAt\?: string/);
  assert.match(typeSource, /type\?: GraphEdgeType/);
  assert.match(viewSource, /focusedCluster/);
});

test("graph primitives are exported as standalone QA targets", async () => {
  const [canvasSource, indexSource] = await Promise.all([readFile(graphCanvasPath, "utf8"), readFile(graphIndexPath, "utf8")]);

  assert.match(canvasSource, /function GraphCanvas/);
  assert.match(indexSource, /brain-graph-map/);
  assert.match(indexSource, /cluster-label/);
  assert.match(indexSource, /context-graph-view/);
  assert.match(indexSource, /graph-canvas/);
  assert.match(indexSource, /graph-edge/);
  assert.match(indexSource, /graph-legend/);
  assert.match(indexSource, /graph-node/);
  assert.match(indexSource, /mini-map/);
  assert.match(indexSource, /mock-graph-data/);
  assert.match(indexSource, /selected-node-halo/);
  assert.match(indexSource, /zoom-controls/);
});

test("graph contexts expose large Brain and compact side-panel variants", async () => {
  const [brainSource, contextSource, miniMapSource] = await Promise.all([
    readFile(brainGraphMapPath, "utf8"),
    readFile(contextGraphViewPath, "utf8"),
    readFile(miniMapPath, "utf8"),
  ]);

  assert.match(brainSource, /function BrainGraphMap/);
  assert.match(brainSource, /data-testid="penny-brain-graph-map"/);
  assert.match(brainSource, /height = 640/);
  assert.match(contextSource, /function ContextGraphView/);
  assert.match(contextSource, /data-testid="penny-context-graph"/);
  assert.match(contextSource, /scale: 0\.86/);
  assert.match(miniMapSource, /function SidePanelMiniMap/);
  assert.match(miniMapSource, /data-testid="penny-side-panel-minimap"/);
  assert.match(miniMapSource, /variant="inline"/);
});

test("graph e2e harness has mock data available before live projection wiring", async () => {
  const source = await readFile(mockGraphDataPath, "utf8");

  assert.match(source, /mockGraph/);
  assert.match(source, /mockGraphs/);
  assert.match(source, /mockBrainView/);
  assert.match(source, /mockChallengeView/);
  assert.match(source, /mockLearnView/);
});

test("data e2e harness has mode-aware hook entrypoints to stub in browser tests", async () => {
  const source = await readFile(hooksPath, "utf8");

  assert.match(source, /function useShellView/);
  assert.match(source, /function useBrainView/);
  assert.match(source, /function useChallengeView/);
  assert.match(source, /function useLearnView/);
  assert.match(source, /function useWorkspaceView/);
});
