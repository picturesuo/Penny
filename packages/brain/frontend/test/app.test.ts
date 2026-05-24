import assert from "node:assert/strict";
import test from "node:test";
import { createPromptFromBrainProfile, formatErrorMessage } from "../src/App";
import type { BrainMemoryProfileData } from "../src/types/brain";

test("formatErrorMessage hides raw local database setup errors", () => {
  assert.equal(
    formatErrorMessage(new Error("DATABASE_URL is required to create the Penny database client.")),
    "Local demo mode",
  );
  assert.equal(formatErrorMessage(new Error("ENOTFOUND invalid.invalid")), "Local demo mode");
  assert.equal(formatErrorMessage(new Error("Create ready")), "Create ready");
});

test("createPromptFromBrainProfile turns imported Brain context into a Create seed", () => {
  const prompt = createPromptFromBrainProfile(brainProfile());

  assert.match(prompt, /Use my Brain context/);
  assert.match(prompt, /five concrete directions/);
  assert.match(prompt, /founder workflow/i);
  assert.match(prompt, /Small reversible builds/);
  assert.doesNotMatch(prompt, /live Gmail|live WhatsApp|SMS/i);
});

function brainProfile(): BrainMemoryProfileData {
  const permission = {
    visibility: "private" as const,
    trainingUse: false as const,
    source: "user_upload" as const,
    allowedUses: ["private_memory" as const, "create_retrieval" as const],
  };

  return {
    sourceOfTruth: "private_user_memory_sources_chunks_nodes_edges_profile_signals",
    scope: {},
    sources: [
      {
        id: "source-1",
        kind: "markdown",
        label: "Founder workflow notes",
        scope: {},
        privacy: { visibility: "private", trainingUse: false, rawRetention: false },
        permission,
        textHash: "hash-1",
        contentLength: 120,
        chunkCount: 1,
        memoryNodeCount: 1,
        createdAt: "2026-05-24T00:00:00.000Z",
        updatedAt: "2026-05-24T00:00:00.000Z",
      },
    ],
    jobs: [],
    recentMemoryNodes: [
      {
        id: "memory-1",
        type: "preference",
        title: "Small reversible builds",
        summary: "The user prefers small reversible builds with source-backed context.",
        text: "Small reversible builds with source-backed context.",
        sourceId: "source-1",
        chunkIds: ["chunk-1"],
        confidence: 0.9,
        tags: ["build-style"],
        labels: ["taste"],
        evidenceLevel: "grounded",
        permission,
        createdAt: "2026-05-24T00:00:00.000Z",
        lastSeenAt: "2026-05-24T00:00:00.000Z",
      },
    ],
    memoryEdges: [],
    profile: {
      recurringInterests: [],
      activeIdeaClusters: [],
      tasteSignals: [],
      preferredBuildStyle: [],
      commonFrustrations: [],
      privacySafeSummary: "",
    },
    stats: {
      sourceCount: 1,
      chunkCount: 1,
      memoryNodeCount: 1,
      memoryEdgeCount: 0,
      profileSignalCount: 0,
    },
    profileReview: null,
  };
}
