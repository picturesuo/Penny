import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const graphViewPath = new URL("../../apps/web/components/graph/graph-view.tsx", import.meta.url);
const hooksPath = new URL("../../apps/web/lib/hooks/use-workspace-view.ts", import.meta.url);

test("graph e2e harness can target the graph surface without redesigning the shell", async () => {
  const source = await readFile(graphViewPath, "utf8");

  assert.match(source, /data-testid="penny-graph"/);
  assert.match(source, /data-testid="penny-graph-node"/);
  assert.match(source, /data-testid="penny-graph-minimap"/);
  assert.match(source, /aria-label="Zoom in"/);
  assert.match(source, /aria-label="Zoom out"/);
  assert.match(source, /aria-label="Fit graph"/);
});

test("data e2e harness has mode-aware hook entrypoints to stub in browser tests", async () => {
  const source = await readFile(hooksPath, "utf8");

  assert.match(source, /function useShellView/);
  assert.match(source, /function useBrainView/);
  assert.match(source, /function useChallengeView/);
  assert.match(source, /function useLearnView/);
  assert.match(source, /function useWorkspaceView/);
});
