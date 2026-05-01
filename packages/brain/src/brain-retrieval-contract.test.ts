import assert from "node:assert/strict";
import test from "node:test";
import {
  BrainRetrievalContextSchema,
  emptyBrainRetrievalContext,
  formatBrainRetrievalContext,
  type BrainRetrievalContext,
} from "./brain-retrieval-contract.ts";

test("Brain retrieval contract validates hybrid vector context for Learn callers", () => {
  const context: BrainRetrievalContext = {
    sourceOfTruth: "brain_rows_hybrid_retrieval",
    mode: "learn",
    query: "founder pricing",
    strategy: "hybrid_lexical_vector",
    vectorContract: "BrainVectorProvider",
    vectorProvider: "deterministic_mock",
    matchCount: 1,
    matches: [
      {
        id: "brain-retrieval:claim:001",
        kind: "claim",
        title: "Founder WTP note",
        text: "Founders may like structured thinking but resist paying before traction.",
        sessionId: "00000000-0000-4000-8000-000000000101",
        claimId: "00000000-0000-4000-8000-000000000102",
        sourceId: "00000000-0000-4000-8000-000000000103",
        score: 0.92,
        lexicalScore: 0.8,
        vectorScore: 0.7,
        recencyScore: 0.5,
        graphScore: 0.3,
        matchedTerms: ["founder", "pricing"],
        reasons: ["lexical_overlap", "vector_similarity"],
      },
    ],
    summary: "Retrieved one related Brain claim.",
  };

  const parsed = BrainRetrievalContextSchema.parse(context);
  const formatted = formatBrainRetrievalContext(parsed);

  assert.equal(parsed.sourceOfTruth, "brain_rows_hybrid_retrieval");
  assert.equal(parsed.vectorContract, "BrainVectorProvider");
  assert.match(formatted, /hybrid_lexical_vector/);
  assert.match(formatted, /Founder WTP note/);
});

test("empty Brain retrieval context is explicit and format-safe", () => {
  const context = emptyBrainRetrievalContext({
    mode: "learn",
    query: "new idea",
  });

  assert.equal(context.matchCount, 0);
  assert.equal(context.matches.length, 0);
  assert.equal(formatBrainRetrievalContext(context), "Brain retrieval context: none.");
});
