import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBrainCodingPromptExport,
  handleBrainExportCodingPromptRequest,
  type BrainCodingPromptExport,
} from "./brain-export-route.ts";
import type { BrainMemoryProfile } from "./brain-memory-route.ts";

test("POST /api/brain/export-coding-prompt returns a source-backed Brain prompt", async () => {
  const profile = brainProfile();
  const response = await handleBrainExportCodingPromptRequest(
    new Request("http://localhost/api/brain/export-coding-prompt", {
      method: "POST",
      body: JSON.stringify({ goal: "Build the next Penny Create artifact from my Brain profile." }),
    }),
    {
      service: {
        async getProfile() {
          return profile;
        },
      },
      now: () => new Date("2026-05-24T12:00:00.000Z"),
    },
  );
  const payload = (await response.json()) as { data: BrainCodingPromptExport };

  assert.equal(response.status, 200);
  assert.equal(payload.data.sourceOfTruth, "private_user_memory_profile_export");
  assert.equal(payload.data.export.format, "coding_agent_prompt");
  assert.equal(payload.data.export.createdAt, "2026-05-24T12:00:00.000Z");
  assert.equal(payload.data.export.qualitySignals.promptCompletenessScore, 100);
  assert.equal(payload.data.export.qualitySignals.sourceCount, 2);
  assert.equal(payload.data.export.qualitySignals.memoryCount, 2);
  assert.match(payload.data.export.text, /Build the next Penny Create artifact/);
  assert.match(payload.data.export.text, /Founder workflow notes/);
  assert.match(payload.data.export.text, /Manual messages context/);
  assert.match(payload.data.export.text, /Small reversible builds/);
  assert.match(payload.data.export.text, /Do not claim live Gmail/);
  assert.doesNotMatch(payload.data.export.text, /oauth-token|raw email body|live WhatsApp/i);
});

test("Brain export rejects missing imported memory", () => {
  assert.throws(
    () =>
      buildBrainCodingPromptExport({
        ...brainProfile(),
        sources: [],
        recentMemoryNodes: [],
        stats: {
          sourceCount: 0,
          chunkCount: 0,
          memoryNodeCount: 0,
          memoryEdgeCount: 0,
          profileSignalCount: 0,
        },
      }),
    /Import and review Brain context/,
  );
});

test("Brain export validates method and body", async () => {
  const getResponse = await handleBrainExportCodingPromptRequest(new Request("http://localhost/api/brain/export-coding-prompt"));
  const invalidBody = await handleBrainExportCodingPromptRequest(
    new Request("http://localhost/api/brain/export-coding-prompt", {
      method: "POST",
      body: JSON.stringify({ goal: 123 }),
    }),
  );

  assert.equal(getResponse.status, 405);
  assert.equal(getResponse.headers.get("allow"), "POST");
  assert.equal(invalidBody.status, 400);
});

function brainProfile(): BrainMemoryProfile {
  const permission = {
    visibility: "private" as const,
    trainingUse: false as const,
    source: "manual_import" as const,
    allowedUses: ["private_memory" as const, "create_retrieval" as const],
  };
  const scope = {
    userId: "user-test",
    workspaceId: "workspace-test",
    projectId: null,
    sphereId: null,
  };
  const sourceA = {
    id: "source-founder",
    kind: "founder_notes" as const,
    label: "Founder workflow notes",
    scope,
    privacy: { visibility: "private" as const, trainingUse: false as const, rawRetention: false },
    permission,
    textHash: "hash-founder",
    contentLength: 200,
    chunkCount: 1,
    memoryNodeCount: 1,
    createdAt: "2026-05-24T00:00:00.000Z",
    updatedAt: "2026-05-24T00:00:00.000Z",
  };
  const sourceB = {
    id: "source-messages",
    kind: "manual_messages_transcript" as const,
    label: "Manual messages context",
    scope,
    privacy: { visibility: "private" as const, trainingUse: false as const, rawRetention: false },
    permission,
    textHash: "hash-messages",
    contentLength: 180,
    chunkCount: 1,
    memoryNodeCount: 1,
    createdAt: "2026-05-24T00:00:00.000Z",
    updatedAt: "2026-05-24T00:00:00.000Z",
  };
  const buildStyle = {
    id: "signal-build",
    kind: "preferred_build_style" as const,
    label: "Small reversible builds",
    summary: "The user prefers scoped, testable changes that keep provenance visible.",
    weight: 0.9,
    sourceNodeIds: ["memory-build"],
    updatedAt: "2026-05-24T00:00:00.000Z",
  };
  const rejected = {
    id: "signal-rejected",
    kind: "repeated_rejected_direction" as const,
    label: "Generic chatbot",
    summary: "Avoid positioning Penny as a generic chatbot or assistant for everything.",
    weight: 0.95,
    sourceNodeIds: ["memory-rejected"],
    updatedAt: "2026-05-24T00:00:00.000Z",
  };

  return {
    sourceOfTruth: "private_user_memory_sources_chunks_nodes_edges_profile_signals",
    scope,
    sources: [sourceA, sourceB],
    jobs: [],
    recentMemoryNodes: [
      {
        id: "memory-build",
        type: "preference",
        title: "Small reversible builds",
        summary: "The user prefers scoped, testable changes that keep provenance visible.",
        text: "Small reversible builds with source-backed context.",
        sourceId: sourceA.id,
        chunkIds: ["chunk-build"],
        confidence: 0.95,
        tags: ["build-style"],
        labels: ["taste"],
        evidenceLevel: "user_confirmed",
        permission,
        createdAt: "2026-05-24T00:00:00.000Z",
        lastSeenAt: "2026-05-24T00:00:00.000Z",
      },
      {
        id: "memory-rejected",
        type: "rejected_direction",
        title: "Generic chatbot",
        summary: "The user rejects generic chatbot and assistant-for-everything framing.",
        text: "Do not make Penny a generic chatbot.",
        sourceId: sourceB.id,
        chunkIds: ["chunk-rejected"],
        confidence: 0.9,
        tags: ["positioning"],
        labels: ["preference"],
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
      activeProjects: [],
      tasteSignals: [buildStyle],
      commonFrustrations: [],
      preferredBuildStyle: [buildStyle],
      repeatedRejectedDirections: [rejected],
      ideaClusters: [],
      highValueMemories: [],
      staleMemories: [],
      supersededMemories: [],
      recentMeaningfulActivity: [],
      privacySafeSummary: "Private founder context from safe manual sources. No global training is claimed or enabled.",
    },
    stats: {
      sourceCount: 2,
      chunkCount: 2,
      memoryNodeCount: 2,
      memoryEdgeCount: 0,
      profileSignalCount: 2,
    },
  };
}
