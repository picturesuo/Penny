import assert from "node:assert/strict";
import test from "node:test";

import { createBrainGraph, createChallengeGraph, createLearnGraph } from "../../../apps/web/components/graph/graph-adapters";
import type { BrainView, ChallengeView, LearnView } from "../../../apps/web/lib/types/workspace";

const shellContext = {
  mode: "brain",
  mapId: "map-1",
  claimId: "claim-2",
  breadcrumb: [
    { kind: "map" as const, id: "map-1", label: "Investor memo" },
    { kind: "claim" as const, id: "claim-2", label: "Distribution is the moat" },
  ],
  breadcrumbItems: [
    { kind: "map" as const, id: "map-1", label: "Investor memo" },
    { kind: "claim" as const, id: "claim-2", label: "Distribution is the moat" },
  ],
};

test("brain graph adapter creates an airy map-to-claims graph", () => {
  const view: BrainView = {
    currentContext: { mode: "brain", mapId: "map-1", claimId: "claim-2" },
    workspaceContext: { mode: "brain", mapId: "map-1", claimId: "claim-2" },
    mapSummary: { id: "map-1", title: "Investor memo", claimCount: 2 },
    claims: [
      { id: "claim-1", mapId: "map-1", body: "Retention is improving", confidenceBps: 6800 },
      { id: "claim-2", mapId: "map-1", body: "Distribution is the moat", confidenceBps: 7400 },
    ],
    selectedClaim: { id: "claim-2", mapId: "map-1", body: "Distribution is the moat", confidenceBps: 7400 },
    recentEvents: [],
  };

  const graph = createBrainGraph(view);

  assert.equal(graph.nodes.length, 3);
  assert.equal(graph.edges.length, 2);
  assert.equal(graph.selectedNodeId, "claim-2");
  assert.equal(graph.nodes.find((node) => node.id === "map-1")?.cluster, "map");
  assert.equal(graph.nodes.find((node) => node.id === "claim-2")?.status, "selected");
});

test("challenge graph adapter includes critique and response state nodes", () => {
  const view: ChallengeView = {
    shellContext,
    currentContext: shellContext,
    workspaceContext: shellContext,
    activeClaim: { id: "claim-2", mapId: "map-1", body: "Distribution is the moat", confidenceBps: 7400 },
    selectedClaim: { id: "claim-2", mapId: "map-1", body: "Distribution is the moat", confidenceBps: 7400 },
    activeChallengeRound: {
      id: "round-1",
      mapId: "map-1",
      claimId: "claim-2",
      status: "responded",
      createdAt: "2026-04-24T00:00:00.000Z",
      updatedAt: "2026-04-24T00:02:00.000Z",
    },
    latestChallengeRound: null,
    critiqueState: {
      status: "ready",
      critiqueId: "critique-1",
      body: "What would prove this wrong?",
    },
    critiqueStatus: "ready",
    responseState: { status: "responded", responsePayload: { response: "I would watch churn." } },
    responseStatus: "responded",
    responsePayload: { response: "I would watch churn." },
  };

  const graph = createChallengeGraph(view);

  assert.ok(graph.nodes.some((node) => node.kind === "critique" && node.status === "ready"));
  assert.ok(graph.nodes.some((node) => node.kind === "response" && node.status === "responded"));
  assert.ok(graph.edges.some((edge) => edge.source === "round-1" && edge.target === "critique-1"));
});

test("learn graph adapter keeps placeholder state connected to the selected claim", () => {
  const view: LearnView = {
    shellContext,
    workspaceContext: shellContext,
    selectedMapId: "map-1",
    selectedClaimId: "claim-2",
    selectedClaim: { id: "claim-2", mapId: "map-1", body: "Distribution is the moat", confidenceBps: 7400 },
    learnState: { status: "placeholder", message: "Learn mode coming soon" },
    status: "placeholder",
    message: "Learn mode coming soon",
  };

  const graph = createLearnGraph(view);

  assert.ok(graph.nodes.some((node) => node.kind === "learn" && node.status === "placeholder"));
  assert.ok(graph.edges.some((edge) => edge.source === "claim-2" && edge.target === "learn-placeholder"));
});
