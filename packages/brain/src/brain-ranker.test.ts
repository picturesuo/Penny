import assert from "node:assert/strict";
import test from "node:test";
import { rankBrainForCreate } from "./brain-ranker.ts";
import type { RetrievalResult } from "./brain-memory-route.ts";
import type { MemoryRef, SourceRef } from "./create-route.ts";

test("Brain Ranker returns next-best move plus five plain-language Create candidates", () => {
  const result = rankBrainForCreate({
    rawIdea: "Build a memory-grounded Create flow with source-backed cards and prompt export.",
    memoryRefs: [
      memory("memory-preference", "Preference: small reversible builds", "I prefer small reversible builds with explicit source provenance."),
      memory("memory-reject", "Rejected direction: generic chatbot sidebars", "I reject generic chatbot sidebars and fake connector claims."),
    ],
    sourceRefs: sourceRefs(),
    retrievalResults: [
      retrieval("memory-preference", "preference", 0.96, "user_confirmed"),
      retrieval("memory-reject", "rejected_direction", 0.84, "grounded"),
    ],
    now: "2026-05-20T12:00:00.000Z",
  });

  assert.equal(result.sourceOfTruth, "private_brain_ranker_progress_engine");
  assert.equal(result.contextLight, false);
  assert.equal(result.nextBestMove.grounded, true);
  assert.match(result.nextBestMove.title, /Advance through/i);
  assert.deepEqual(
    result.rankedCandidates.map((candidate) => candidate.lens),
    ["Personal", "Practical", "Valuable", "Critical", "Weird"],
  );
  assert.ok(result.rankedCandidates.every((candidate) => candidate.topReason));
  assert.ok(result.rankedCandidates.every((candidate) => candidate.memoryCount >= 1));
  assert.ok(result.rankedCandidates.every((candidate) => candidate.sourceCount >= 1));
  assert.ok(!("scores" in result.rankedCandidates[0]!));
  assert.ok(!("rawScores" in result.rankedCandidates[0]!));
  assert.match(result.rankedCandidates.find((candidate) => candidate.lens === "Critical")?.topReason ?? "", /generic|rejected|fake|chatbot/i);
});

test("Brain Ranker weights explicit confirmed memory above implicit memory", () => {
  const result = rankBrainForCreate({
    rawIdea: "Build source-backed Create cards with acceptance tests.",
    memoryRefs: [
      memory("memory-implicit", "Preference: source-backed cards", "The user may like source-backed cards for Create."),
      memory("memory-confirmed", "Preference: source-backed cards confirmed", "I prefer source-backed cards and acceptance tests."),
    ],
    sourceRefs: sourceRefs(),
    retrievalResults: [
      retrieval("memory-implicit", "preference", 0.62, "inferred"),
      retrieval("memory-confirmed", "preference", 0.95, "user_confirmed"),
    ],
    now: "2026-05-20T12:00:00.000Z",
  });
  const personal = result.rankedCandidates.find((candidate) => candidate.lens === "Personal");

  assert.equal(personal?.memoryRefs[0]?.id, "memory-confirmed");
  assert.ok(personal?.reasons.some((reason) => /User-confirmed memory/i.test(reason)));
});

test("Brain Ranker labels context-light runs without inventing memory", () => {
  const result = rankBrainForCreate({
    rawIdea: "Build a planning tool for rough notes.",
    memoryRefs: [],
    sourceRefs: [
      {
        id: "source-rough",
        label: "Rough idea",
        kind: "rough_idea",
        excerpt: "Build a planning tool for rough notes.",
      },
    ],
    now: "2026-05-20T12:00:00.000Z",
  });

  assert.equal(result.contextLight, true);
  assert.equal(result.nextBestMove.grounded, false);
  assert.match(result.nextBestMove.uncertainty.join(" "), /No relevant Brain memory/i);
  assert.ok(result.rankedCandidates.every((candidate) => candidate.grounding === "context_light"));
  assert.ok(result.rankedCandidates.every((candidate) => /context-light|search-needed|inferred/i.test(candidate.contextLabel)));
  assert.ok(result.rankedCandidates.every((candidate) => candidate.memoryRefs.length === 0));
});

function memory(id: string, label: string, summary: string): MemoryRef {
  return {
    id,
    label,
    kind: label.startsWith("Preference") ? "preference" : "brain",
    summary,
  };
}

function sourceRefs(): SourceRef[] {
  return [
    {
      id: "source-rough",
      label: "Rough idea",
      kind: "rough_idea",
      excerpt: "Build a memory-grounded Create flow.",
    },
    {
      id: "source-notes",
      label: "Founder notes",
      kind: "source",
      excerpt: "I prefer small reversible builds with explicit source provenance.",
      sourceRange: "chunk 1",
    },
  ];
}

function retrieval(
  nodeId: string,
  type: RetrievalResult["type"],
  confidence: number,
  evidenceLevel: RetrievalResult["evidenceLevel"],
): RetrievalResult {
  return {
    id: `retrieval-${nodeId}`,
    nodeId,
    sourceId: "source-notes",
    chunkId: "chunk-1",
    type,
    title: nodeId,
    summary: nodeId,
    excerpt: "I prefer small reversible builds with explicit source provenance.",
    score: 8,
    confidence,
    evidenceLevel,
    lastSeenAt: "2026-05-20T11:00:00.000Z",
    memoryRef: {
      id: nodeId,
      label: nodeId,
      kind: type === "preference" ? "preference" : "brain",
      summary: nodeId,
    },
    sourceRef: {
      id: "source-notes",
      label: "Founder notes",
      kind: "source",
      excerpt: "I prefer small reversible builds with explicit source provenance.",
      sourceRange: "chunk 1",
    },
    permission: {
      visibility: "private",
      trainingUse: false,
      source: "user_upload",
      allowedUses: ["private_memory", "create_retrieval"],
    },
  };
}
