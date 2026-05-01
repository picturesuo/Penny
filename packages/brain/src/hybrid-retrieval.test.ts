import assert from "node:assert/strict";
import test from "node:test";
import { createDeterministicEmbeddingProvider } from "./embedding-provider.ts";
import {
  planHybridRetrieval,
  type HybridRetrievalCandidate,
  type HybridRetrievalRepository,
  type HybridSearchResult,
} from "./hybrid-retrieval.ts";

test("planHybridRetrieval merges graph, lexical, Terminal 1 semantic, recency, and scope signals", async () => {
  const repository: HybridRetrievalRepository = {
    async scopedCandidates() {
      return [
        candidate({
          id: "claim-version-1",
          type: "claim",
          title: "assumption: cognitive load is the bottleneck",
          text: "Cognitive load is the first bottleneck to test.",
          sessionId: uuidAt(100),
          projectId: uuidAt(200),
          claimId: uuidAt(101),
          updatedAt: "2026-05-01T10:00:00.000Z",
        }),
        candidate({
          id: "source-1",
          type: "source",
          title: "Local citation row",
          text: "Worked examples can reduce unnecessary cognitive load.",
          sessionId: uuidAt(100),
          projectId: uuidAt(200),
          sourceId: uuidAt(501),
          updatedAt: "2026-04-30T10:00:00.000Z",
        }),
        candidate({
          id: "shape-1",
          type: "note",
          title: "Shape: evidence checking",
          text: "The user often needs source-backed checks before raising confidence.",
          sessionId: uuidAt(100),
          projectId: uuidAt(200),
          updatedAt: "2026-04-29T10:00:00.000Z",
        }),
      ];
    },
    async graphNeighbors() {
      return [
        candidate({
          id: "neighbor-version-1",
          type: "claim",
          title: "Neighbor assumption: worked examples",
          text: "Worked examples reduce load for novice learners.",
          sessionId: uuidAt(100),
          projectId: uuidAt(200),
          claimId: uuidAt(102),
          updatedAt: "2026-04-28T10:00:00.000Z",
          graphDistance: 1,
          scoreBreakdown: { graph: 1 },
        }),
      ];
    },
    async lexicalSearch() {
      return [
        result({
          id: "claim-version-1",
          type: "claim",
          title: "assumption: cognitive load is the bottleneck",
          text: "Cognitive load is the first bottleneck to test.",
          score: 1,
          scoreBreakdown: { lexical: 1 },
          sessionId: uuidAt(100),
          projectId: uuidAt(200),
          claimId: uuidAt(101),
        }),
      ];
    },
    async terminal1SemanticSearch(request) {
      assert.equal(request.limit, 4);

      return [
        result({
          id: "source-1",
          type: "source",
          title: "Local citation row",
          text: "Worked examples can reduce unnecessary cognitive load.",
          score: 0.95,
          scoreBreakdown: { semantic: 0.95 },
          sessionId: uuidAt(100),
          projectId: uuidAt(200),
          sourceId: uuidAt(501),
        }),
      ];
    },
  };
  const context = await planHybridRetrieval(
    {
      mode: "verify",
      query: "verify cognitive load with source evidence",
      sessionId: uuidAt(100),
      projectId: uuidAt(200),
      currentClaimId: uuidAt(101),
      limit: 4,
    },
    repository,
    { embeddingProvider: createDeterministicEmbeddingProvider(16) },
  );

  assert.equal(context.sourceOfTruth, "brain_rows_hybrid_retrieval");
  assert.equal(context.planner, "graph_lexical_semantic_recency_scope");
  assert.equal(context.terminal1SemanticAvailable, true);
  assert.equal(context.embeddingProvider, "deterministic_mock");
  assert.ok(context.results.length >= 3);
  assert.equal(context.results.find((item) => item.id === "source-1")?.scoreBreakdown?.semantic, 0.95);
  assert.equal(context.results.find((item) => item.id === "claim-version-1")?.scoreBreakdown?.lexical, 1);
  assert.equal(context.results.find((item) => item.id === "neighbor-version-1")?.scoreBreakdown?.graph, 1);
  assert.ok((context.results.find((item) => item.id === "claim-version-1")?.scoreBreakdown?.recency ?? 0) > 0);
});

test("planHybridRetrieval falls back to deterministic semantic search when Terminal 1 is absent", async () => {
  const repository: HybridRetrievalRepository = {
    async scopedCandidates() {
      return [
        candidate({
          id: "working-memory",
          type: "brain_object",
          title: "Working memory",
          text: "Working memory limits how much load the user can keep active.",
          objectId: uuidAt(301),
          updatedAt: "2026-05-01T10:00:00.000Z",
        }),
        candidate({
          id: "pricing",
          type: "brain_object",
          title: "Pricing note",
          text: "Founders compare pricing and revenue before a purchase.",
          objectId: uuidAt(302),
          updatedAt: "2026-04-20T10:00:00.000Z",
        }),
      ];
    },
  };
  const context = await planHybridRetrieval(
    {
      mode: "learn",
      query: "working memory load",
      limit: 2,
    },
    repository,
    { embeddingProvider: createDeterministicEmbeddingProvider(32) },
  );

  assert.equal(context.terminal1SemanticAvailable, false);
  assert.equal(context.results[0]?.id, "working-memory");
  assert.ok((context.results[0]?.scoreBreakdown?.semantic ?? 0) > 0);
  assert.ok((context.results[0]?.scoreBreakdown?.lexical ?? 0) > 0);
});

function candidate(input: Omit<HybridRetrievalCandidate, "score"> & { score?: number }): HybridRetrievalCandidate {
  return {
    score: input.score ?? 0,
    ...input,
  };
}

function result(input: HybridSearchResult): HybridSearchResult {
  return input;
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
