import assert from "node:assert/strict";
import test from "node:test";
import {
  cosineSimilarity,
  createDeterministicEmbeddingProvider,
  createEmbeddingProvider,
  deterministicEmbedding,
} from "./embedding-provider.ts";

test("EmbeddingProvider uses deterministic mock fallback without an API key", async () => {
  const provider = createEmbeddingProvider({ dimensions: 12 });
  const first = await provider.embed(["cognitive load", "cognitive load"]);
  const second = await provider.embed(["cognitive load"]);

  assert.equal(provider.kind, "deterministic_mock");
  assert.equal(provider.name, "deterministic_mock_embedding_provider");
  assert.equal(first[0]?.length, 12);
  assert.deepEqual(first[0], first[1]);
  assert.deepEqual(first[0], second[0]);
  assert.equal(cosineSimilarity(first[0] ?? [], second[0] ?? []), 1);
});

test("EmbeddingProvider wraps an external embedding client when an API key and client are provided", async () => {
  const seen: string[][] = [];
  const provider = createEmbeddingProvider({
    apiKey: "test-key",
    dimensions: 3,
    async embed(texts) {
      seen.push([...texts]);

      return [
        [2, 0, 0],
        [0, 4, 0],
      ];
    },
  });
  const vectors = await provider.embed(["first", "second"]);

  assert.equal(provider.kind, "external");
  assert.deepEqual(seen, [["first", "second"]]);
  assert.deepEqual(vectors, [
    [1, 0, 0],
    [0, 1, 0],
  ]);
});

test("deterministicEmbedding keeps related terms closer than unrelated text", () => {
  const query = deterministicEmbedding("working memory load", 32);
  const related = deterministicEmbedding("memory load working capacity", 32);
  const unrelated = deterministicEmbedding("founder pricing revenue", 32);

  assert.ok(cosineSimilarity(query, related) > cosineSimilarity(query, unrelated));
});
