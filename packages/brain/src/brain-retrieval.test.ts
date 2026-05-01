import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBrainRetrievalDocument,
  formatBrainRetrievalContext,
  retrieveBrainContext,
  type BrainVectorProvider,
} from "./brain-retrieval.ts";

test("hybrid Brain retrieval ranks durable Brain rows for Learn and Verify context", async () => {
  const context = await retrieveBrainContext(
    [
      buildBrainRetrievalDocument({
        id: uuidAt(1),
        kind: "claim",
        title: "belief: founders will pay",
        text: "Pre-seed founders will pay for structured thinking before traction.",
        sessionId: uuidAt(100),
        claimId: uuidAt(101),
        sourceId: uuidAt(201),
        updatedAt: "2026-05-01T10:00:00.000Z",
        tags: ["belief", "market_risk"],
      }),
      buildBrainRetrievalDocument({
        id: uuidAt(2),
        kind: "source",
        title: "raw idea",
        text: "A spatial brain for founders preparing fundraising decisions.",
        sessionId: uuidAt(100),
        claimId: null,
        sourceId: uuidAt(202),
        updatedAt: "2026-05-01T09:00:00.000Z",
        tags: ["raw_idea"],
      }),
      buildBrainRetrievalDocument({
        id: uuidAt(3),
        kind: "artifact",
        title: "Challenge Brief",
        text: "The current risk is whether founders pay before traction instead of only using free AI chat.",
        sessionId: uuidAt(100),
        claimId: null,
        sourceId: null,
        updatedAt: "2026-05-01T11:00:00.000Z",
        tags: ["challenge_brief"],
      }),
    ],
    {
      mode: "verify",
      query: "Will founders pay for this before traction?",
      sessionId: uuidAt(100),
      currentClaimId: uuidAt(101),
      limit: 3,
    },
  );

  assert.equal(context.sourceOfTruth, "brain_rows_hybrid_retrieval");
  assert.equal(context.strategy, "hybrid_lexical_vector");
  assert.equal(context.vectorProvider, "deterministic_mock");
  assert.equal(context.matches[0]?.kind, "claim");
  assert.equal(context.matches[0]?.claimId, uuidAt(101));
  assert.ok((context.matches[0]?.lexicalScore ?? 0) > 0);
  assert.ok((context.matches[0]?.vectorScore ?? 0) > 0);
  assert.ok(context.matches[0]?.reasons.includes("current_claim"));
  assert.match(context.summary, /Found 3 relevant Brain rows/);
});

test("Brain retrieval accepts an external vector provider stub without changing the contract", async () => {
  const provider: BrainVectorProvider = {
    async embed(texts) {
      return texts.map((text) => (text.includes("pricing") || text.includes("pay") ? [1, 0, 0] : [0, 1, 0]));
    },
  };
  const context = await retrieveBrainContext(
    [
      buildBrainRetrievalDocument({
        id: uuidAt(4),
        kind: "brain_object",
        title: "Pricing memo",
        text: "Founders compare pricing against the cost of a bad strategy decision.",
        sessionId: uuidAt(100),
        claimId: uuidAt(101),
        sourceId: null,
        updatedAt: "2026-05-01T12:00:00.000Z",
        tags: ["brain_object"],
      }),
    ],
    {
      mode: "learn",
      query: "pay",
      sessionId: uuidAt(100),
      currentClaimId: uuidAt(101),
    },
    { vectorProvider: provider },
  );

  assert.equal(context.vectorContract, "BrainVectorProvider");
  assert.equal(context.vectorProvider, "external_provider");
  assert.equal(context.matches[0]?.kind, "brain_object");
  assert.ok((context.matches[0]?.vectorScore ?? 0) > 0.9);
});

test("formatted Brain retrieval context is prompt-safe and labels internal memory", async () => {
  const context = await retrieveBrainContext(
    [
      buildBrainRetrievalDocument({
        id: uuidAt(5),
        kind: "recent",
        title: "Recent Learn output",
        text: "The user learned that willingness to pay is different from usage intent.",
        sessionId: uuidAt(100),
        claimId: uuidAt(101),
        sourceId: null,
        updatedAt: "2026-05-01T12:10:00.000Z",
        tags: ["recent"],
      }),
    ],
    { mode: "learn", query: "willingness to pay", sessionId: uuidAt(100), currentClaimId: uuidAt(101) },
  );
  const formatted = formatBrainRetrievalContext(context);

  assert.match(formatted, /Brain retrieval context/);
  assert.match(formatted, /sourceOfTruth: brain_rows_hybrid_retrieval/);
  assert.match(formatted, /Recent Learn output/);
  assert.match(formatted, /vectorProvider: deterministic_mock/);
});

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
