import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const stylePath = new URL("../../../apps/web/components/graph/graph-style.ts", import.meta.url);
const edgePath = new URL("../../../apps/web/components/graph/graph-edge.tsx", import.meta.url);
const canvasPath = new URL("../../../apps/web/components/graph/graph-canvas.tsx", import.meta.url);
const haloPath = new URL("../../../apps/web/components/graph/selected-node-halo.tsx", import.meta.url);

test("graph styling keeps the reference-inspired light clustered presentation", async () => {
  const source = await readFile(stylePath, "utf8");

  assert.match(source, /linear-gradient\(180deg, #fdfefb 0%, #f7faf4 100%\)/);
  assert.match(source, /map: \{ fill: "#edf5ee"/);
  assert.match(source, /claim: \{ fill: "#edf4f7"/);
  assert.match(source, /critique: \{ fill: "#f3eff6"/);
});

test("graph styling keeps lines and selected states gentle", async () => {
  const [edgeSource, canvasSource, haloSource] = await Promise.all([
    readFile(edgePath, "utf8"),
    readFile(canvasPath, "utf8"),
    readFile(haloPath, "utf8"),
  ]);

  assert.match(edgeSource, /rgba\(23, 32, 27, 0\.16\)/);
  assert.match(edgeSource, /rgba\(71, 106, 85, 0\.48\)/);
  assert.match(canvasSource, /\.penny-graph-node-group:hover/);
  assert.match(canvasSource, /transition: stroke 160ms ease/);
  assert.match(haloSource, /rgba\(71, 106, 85, 0\.055\)/);
});
