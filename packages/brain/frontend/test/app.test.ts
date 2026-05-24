import assert from "node:assert/strict";
import test from "node:test";
import { createPromptFromBrainDocument, createPromptFromBrainProfile, formatErrorMessage } from "../src/App";
import type { BrainDocumentSummary, BrainMemoryProfileData } from "../src/types/brain";

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

test("createPromptFromBrainProfile can seed Create from a specific Brain memory", () => {
  const profile = brainProfile();
  const prompt = createPromptFromBrainProfile(profile, profile.recentMemoryNodes[0]);

  assert.match(prompt, /Use this Brain memory as the seed/);
  assert.match(prompt, /Small reversible builds/);
  assert.match(prompt, /source-backed context/);
  assert.match(prompt, /Ground the directions in this context/);
  assert.doesNotMatch(prompt, /live Gmail|live WhatsApp|SMS/i);
});

test("createPromptFromBrainDocument turns a saved Brain doc into a Create seed", () => {
  const prompt = createPromptFromBrainDocument(brainDocument());

  assert.match(prompt, /Rework the Brain document "Penny YC workbench"/);
  assert.match(prompt, /Original idea: Build Penny as a memory-native creativity workbench/);
  assert.match(prompt, /Main claim: Penny should help builders turn vague ideas into buildable structure/);
  assert.match(prompt, /Recommendations: Keep five equal directions/);
  assert.match(prompt, /Next actions: Record the YC fixture demo/);
  assert.match(prompt, /Do not claim live Gmail/);
  assert.match(prompt, /five concrete directions/);
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

function brainDocument(): BrainDocumentSummary {
  return {
    id: "session-1",
    sessionId: "session-1",
    scope: {
      userId: null,
      workspaceId: null,
      projectId: null,
      sphereId: null,
    },
    title: "Penny YC workbench",
    description: "A saved Brain document about the YC demo path.",
    status: "open",
    originalIdea: "Build Penny as a memory-native creativity workbench.",
    mainClaim: {
      id: "claim-1",
      kind: "belief",
      status: "active",
      text: "Penny should help builders turn vague ideas into buildable structure.",
      versionId: "version-1",
      createdAt: "2026-05-24T00:00:00.000Z",
    },
    strongestOptions: [],
    rejectedOptions: [],
    todoLaterIdeas: ["Do not claim live Gmail in the demo."],
    finalRecommendations: ["Keep five equal directions", "Show human judgment before export"],
    nextActions: ["Record the YC fixture demo", "Export the build prompt"],
    counts: {
      claims: 1,
      edges: 0,
      moves: 0,
      artifacts: 0,
      versions: 1,
    },
    latestArtifact: null,
    lastMove: null,
    createdAt: "2026-05-24T00:00:00.000Z",
    updatedAt: "2026-05-24T00:00:00.000Z",
  };
}
