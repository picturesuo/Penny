import assert from "node:assert/strict";
import test from "node:test";

import {
  mockBrainGraph,
  mockChallengeGraph,
  mockGraph,
  mockGraphs,
  mockLearnGraph,
} from "../../../apps/web/components/graph/mock-graph-data";

test("mock graph data exercises the full visual cluster set before live wiring", () => {
  const clusters = new Set(mockGraph.nodes.map((node) => node.cluster));

  assert.equal(mockGraph.selectedNodeId, "mock-claim-distribution");
  assert.deepEqual([...clusters].sort(), ["challenge", "claim", "critique", "event", "learn", "map"]);
  assert.ok(mockGraph.edges.some((edge) => edge.source === "mock-round-distribution" && edge.target === "mock-critique-distribution"));
  assert.ok(mockGraph.edges.some((edge) => edge.source === "mock-claim-distribution" && edge.target === "mock-learn-placeholder"));
});

test("mock projection adapters produce mode-specific graph fixtures", () => {
  assert.equal(mockGraphs.brain, mockBrainGraph);
  assert.equal(mockGraphs.challenge, mockChallengeGraph);
  assert.equal(mockGraphs.learn, mockLearnGraph);

  assert.equal(mockBrainGraph.selectedNodeId, "mock-claim-distribution");
  assert.ok(mockChallengeGraph.nodes.some((node) => node.kind === "response" && node.status === "responded"));
  assert.ok(mockLearnGraph.nodes.some((node) => node.kind === "learn" && node.status === "placeholder"));
});
