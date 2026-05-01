import assert from "node:assert/strict";
import test from "node:test";
import {
  assertP1CanvasPayload,
  createMockP1HybridRetrievalProvider,
  type P1CanvasPayload,
  type P1HybridRetrievalMatch,
} from "./p1-integration-contracts.ts";

test("Wave 8 Canvas contract accepts a mocked Brain graph payload", () => {
  const payload = assertP1CanvasPayload(mockCanvasPayload());

  assert.equal(payload.sourceOfTruth, "brain_graph_projection");
  assert.equal(payload.nodes[0]?.kind, "claim");
  assert.equal(payload.nodes[1]?.kind, "question");
  assert.equal(payload.edges[0]?.kind, "depends_on");
  assert.equal(payload.selectedNodeId, "node-market-risk");
});

test("Wave 8 Canvas contract rejects edges that invent frontend-only graph nodes", () => {
  assert.throws(
    () =>
      assertP1CanvasPayload({
        ...mockCanvasPayload(),
        edges: [
          {
            id: "edge-dangling",
            kind: "supports",
            fromNodeId: "node-market-risk",
            toNodeId: "node-invented-by-ui",
            refs: { sessionId: "session-yc-demo" },
          },
        ],
      }),
    /connect existing nodes/,
  );
});

test("Wave 7 hybrid retrieval mock returns Brain-grounded context for Learn and Verify", async () => {
  const provider = createMockP1HybridRetrievalProvider([
    mockRetrievalMatch("claim-market-risk", "claim", 92),
    mockRetrievalMatch("source-yc-note", "source", 84),
  ]);
  const result = await provider.retrieve({
    query: "founders pay for structured thinking",
    mode: "learn",
    scope: {
      userId: "demo-user",
      workspaceId: "demo-workspace",
      projectId: "yc-demo",
      sphereId: "work",
    },
    sessionId: "session-yc-demo",
    limit: 1,
  });

  assert.equal(provider.name, "p1-hybrid-retrieval-mock");
  assert.equal(result.strategy, "mock");
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0]?.refs.claimId, "claim-market-risk");
  assert.match(result.contextSummary, /Pre-seed founders/);
});

function mockCanvasPayload(): P1CanvasPayload {
  return {
    sourceOfTruth: "brain_graph_projection",
    sessionId: "session-yc-demo",
    nodes: [
      {
        id: "node-market-risk",
        kind: "claim",
        label: "Pre-seed founders will pay for structured thinking before traction.",
        x: 160,
        y: 96,
        width: 280,
        height: 96,
        confidence: 46,
        status: "exploratory",
        refs: {
          sessionId: "session-yc-demo",
          claimId: "claim-market-risk",
        },
      },
      {
        id: "node-pricing-question",
        kind: "question",
        label: "What evidence would prove urgent willingness to pay?",
        x: 520,
        y: 96,
        width: 260,
        height: 88,
        refs: {
          sessionId: "session-yc-demo",
          claimId: "claim-pricing-question",
        },
      },
    ],
    edges: [
      {
        id: "edge-pricing-depends-on-market",
        kind: "depends_on",
        fromNodeId: "node-pricing-question",
        toNodeId: "node-market-risk",
        label: "tests",
        refs: {
          sessionId: "session-yc-demo",
          claimId: "claim-pricing-question",
        },
      },
    ],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1,
    },
    selectedNodeId: "node-market-risk",
    meta: {
      generatedAt: "2026-05-01T12:00:00.000Z",
      graphHash: "graph:yc-demo",
    },
  };
}

function mockRetrievalMatch(
  id: string,
  kind: P1HybridRetrievalMatch["kind"],
  score: number,
): P1HybridRetrievalMatch {
  return {
    id,
    kind,
    title: kind === "claim" ? "Market risk claim" : "YC source note",
    snippet:
      kind === "claim"
        ? "Pre-seed founders will pay for structured thinking before traction."
        : "Founder interviews should test urgent willingness to pay before a broad productivity pitch.",
    score,
    refs: {
      sessionId: "session-yc-demo",
      ...(kind === "claim" ? { claimId: "claim-market-risk" } : { sourceId: "source-yc-note" }),
    },
    retrieval: {
      lexicalScore: kind === "claim" ? 52 : 34,
      vectorScore: kind === "claim" ? 0.91 : 0.72,
      reasonCodes: ["same_session_graph_context", "semantic_match"],
    },
  };
}
