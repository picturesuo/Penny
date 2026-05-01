import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBrainContextSummary,
  createNoopVectorRetrievalProvider,
  rankHybridRetrievalDocuments,
  type BrainRetrievalDocument,
  type VectorRetrievalProvider,
} from "./hybrid-retrieval.ts";

test("rankHybridRetrievalDocuments keeps Brain retrieval lexical and graph-native without vector infra", () => {
  const matches = rankHybridRetrievalDocuments(documents(), {
    query: "founders pay structured thinking",
    mode: "learn",
    sessionId: "session-yc",
    limit: 3,
  });

  assert.equal(matches[0]?.id, "claim:market-risk");
  assert.equal(matches[0]?.kind, "claim");
  assert.equal(matches[0]?.vectorScore, null);
  assert.ok(matches[0]?.lexicalScore && matches[0].lexicalScore > 0);
  assert.ok(matches[0]?.graphScore && matches[0].graphScore > 0);
  assert.ok(matches[0]?.reasons.includes("lexical_overlap"));
  assert.ok(matches[0]?.reasons.includes("same_session_graph_context"));
});

test("rankHybridRetrievalDocuments blends typed vector matches with lexical Brain rows", () => {
  const matches = rankHybridRetrievalDocuments(
    documents(),
    {
      query: "founder workflow risk",
      mode: "verify",
      sessionId: "session-yc",
      limit: 2,
    },
    [
      {
        documentId: "brain_object:pricing-brief",
        score: 0.98,
        reason: "embedding_nearest_neighbor",
      },
    ],
  );

  assert.equal(matches[0]?.id, "brain_object:pricing-brief");
  assert.equal(matches[0]?.vectorScore, 98);
  assert.ok(matches[0]?.reasons.includes("embedding_nearest_neighbor"));
  assert.equal(matches[1]?.id, "claim:market-risk");
});

test("buildBrainContextSummary returns cited Brain refs for Learn and Verify prompts", () => {
  const [match] = rankHybridRetrievalDocuments(documents(), {
    query: "founders pay structured thinking",
    mode: "learn",
    sessionId: "session-yc",
    limit: 1,
  });

  assert.ok(match);

  const summary = buildBrainContextSummary([match]);

  assert.match(summary, /\[claim\] Market risk/);
  assert.match(summary, /claim:market-risk/);
  assert.match(summary, /session:session-yc/);
});

test("createNoopVectorRetrievalProvider documents the vector lane stub contract", async () => {
  const provider: VectorRetrievalProvider = createNoopVectorRetrievalProvider("terminal-vector-stub");
  const matches = await provider.search({
    query: "pricing risk",
    mode: "learn",
    scope: {
      userId: "user-1",
      workspaceId: "workspace-1",
      projectId: "project-1",
      sphereId: "work",
    },
    sessionId: "session-yc",
    restrictToSession: false,
    includeKinds: ["claim", "brain_object"],
    limit: 5,
  });

  assert.equal(provider.name, "terminal-vector-stub");
  assert.deepEqual(matches, []);
});

function documents(): BrainRetrievalDocument[] {
  const now = new Date();

  return [
    {
      id: "claim:market-risk",
      kind: "claim",
      title: "Market risk",
      text: "Pre-seed founders will pay for structured thinking before traction.",
      sessionId: "session-yc",
      claimId: "market-risk",
      sourceId: "source-yc",
      moveId: null,
      artifactId: null,
      updatedAt: now,
      scope: scope(),
    },
    {
      id: "brain_object:pricing-brief",
      kind: "brain_object",
      title: "Pricing brief",
      text: "A prior Brain object about willingness-to-pay interviews and founder workflow risk.",
      sessionId: "session-prior",
      claimId: null,
      sourceId: null,
      moveId: null,
      artifactId: null,
      updatedAt: now,
      scope: scope(),
    },
    {
      id: "source:technical-note",
      kind: "source",
      title: "Technical note",
      text: "Latency budgets for graph rendering and local canvas layout.",
      sessionId: "session-canvas",
      claimId: null,
      sourceId: "technical-note",
      moveId: null,
      artifactId: null,
      updatedAt: now,
      scope: scope(),
    },
  ];
}

function scope() {
  return {
    userId: "user-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    sphereId: "work",
  };
}
