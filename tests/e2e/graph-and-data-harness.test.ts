import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const graphViewPath = new URL("../../apps/web/components/graph/graph-view.tsx", import.meta.url);
const graphCanvasPath = new URL("../../apps/web/components/graph/graph-canvas.tsx", import.meta.url);
const graphNodePath = new URL("../../apps/web/components/graph/graph-node.tsx", import.meta.url);
const miniMapPath = new URL("../../apps/web/components/graph/mini-map.tsx", import.meta.url);
const zoomControlsPath = new URL("../../apps/web/components/graph/zoom-controls.tsx", import.meta.url);
const graphIndexPath = new URL("../../apps/web/components/graph/index.ts", import.meta.url);
const hooksPath = new URL("../../apps/web/lib/hooks/use-workspace-view.ts", import.meta.url);

test("graph e2e harness can target the graph surface without redesigning the shell", async () => {
  const [viewSource, nodeSource, miniMapSource, zoomSource] = await Promise.all([
    readFile(graphViewPath, "utf8"),
    readFile(graphNodePath, "utf8"),
    readFile(miniMapPath, "utf8"),
    readFile(zoomControlsPath, "utf8"),
  ]);

  assert.match(viewSource, /data-testid="penny-graph"/);
  assert.match(nodeSource, /data-testid="penny-graph-node"/);
  assert.match(miniMapSource, /data-testid="penny-graph-minimap"/);
  assert.match(zoomSource, /aria-label="Zoom in"/);
  assert.match(zoomSource, /aria-label="Zoom out"/);
  assert.match(zoomSource, /aria-label="Fit graph"/);
});

test("graph primitives are exported as standalone QA targets", async () => {
  const [canvasSource, indexSource] = await Promise.all([readFile(graphCanvasPath, "utf8"), readFile(graphIndexPath, "utf8")]);

  assert.match(canvasSource, /function GraphCanvas/);
  assert.match(indexSource, /cluster-label/);
  assert.match(indexSource, /graph-canvas/);
  assert.match(indexSource, /graph-edge/);
  assert.match(indexSource, /graph-legend/);
  assert.match(indexSource, /graph-node/);
  assert.match(indexSource, /mini-map/);
  assert.match(indexSource, /selected-node-halo/);
  assert.match(indexSource, /zoom-controls/);
});

test("data e2e harness has mode-aware hook entrypoints to stub in browser tests", async () => {
  const source = await readFile(hooksPath, "utf8");

  assert.match(source, /function useShellView/);
  assert.match(source, /function useBrainView/);
  assert.match(source, /function useChallengeView/);
  assert.match(source, /function useLearnView/);
  assert.match(source, /function useWorkspaceView/);
});
