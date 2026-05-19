import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrainMemoryPanel, BrainWorkspace } from "../src/components/BrainWorkspace";
import type { BrainDocumentsData, BrainMemoryProfileData, BrainRecentIdea } from "../src/types/brain";

test("BrainWorkspace renders persisted quick notes as the first sidebar folder", () => {
  const markup = renderToStaticMarkup(
    createElement(BrainWorkspace, {
      documentsData: emptyDocumentsData(),
      selectedDocument: null,
      data: null,
      moves: [],
      autopilot: null,
      latestArtifact: null,
      focusedClaimId: null,
      canvasOpen: false,
      status: "Ready",
      isThinking: false,
      recents: [quickNote("Persist this note in Brain.")],
      archivedRecents: [],
      onSelectDocument: () => undefined,
      onBackToLibrary: () => undefined,
      onNewThought: () => undefined,
      onSeed: async () => undefined,
      onQuickNoteCreate: async () => undefined,
      onQuickNoteAction: async () => undefined,
      onClaimSelect: () => undefined,
      onReworkDocument: async () => undefined,
      onCanvasOpenChange: () => undefined,
      onCanvasNodeAction: () => undefined,
    }),
  );

  const quickNotesIndex = markup.indexOf("Quick Notes");
  const documentsIndex = markup.indexOf("Documents");

  assert.notEqual(quickNotesIndex, -1);
  assert.notEqual(documentsIndex, -1);
  assert.ok(quickNotesIndex < documentsIndex);
  assert.match(markup, /Persist this note in Brain/);
  assert.doesNotMatch(markup, /No quick notes yet/);
  assert.doesNotMatch(markup, /Capture a quick note/);
  assert.match(markup, /aria-label="Quick notes folder"/);
  assert.match(markup, /aria-label="Send quick note"/);
  assert.match(markup, /class="quick-note-open"/);
});

test("BrainMemoryPanel renders imported sources, profile summary, and recent memory nodes", () => {
  const markup = renderToStaticMarkup(
    createElement(BrainMemoryPanel, {
      profile: memoryProfile(),
      status: "ready",
      error: null,
      disabled: false,
      onImport: async () => undefined,
      onDeleteSource: async () => undefined,
    }),
  );

  assert.match(markup, /Second Brain memory/);
  assert.match(markup, /Private context for Create/);
  assert.match(markup, /Uploaded sources/);
  assert.match(markup, /Founder workflow notes/);
  assert.match(markup, /Private user memory/);
  assert.match(markup, /no global training/i);
  assert.match(markup, /Small reversible builds/);
  assert.match(markup, /Preference - Small reversible builds/);
  assert.match(markup, /Delete Founder workflow notes/);
});

function emptyDocumentsData(): BrainDocumentsData {
  const document = documentSummary();

  return {
    sourceOfTruth: "sessions_sources_claims_claim_versions_edges_moves_artifacts",
    documents: [document],
    hierarchy: [],
    sidebar: {
      quickNotes: [],
      folders: [],
      research: [],
    },
    graph: {
      nodes: [],
      edges: [],
    },
    meta: {
      documentCount: 1,
      claimCount: 0,
      edgeCount: 0,
    },
  };
}

function documentSummary(): BrainDocumentsData["documents"][number] {
  return {
    id: "session-1",
    sessionId: "session-1",
    scope: {},
    title: "Saved document",
    description: "A saved document for the sidebar test.",
    status: "open",
    originalIdea: "A persisted thought.",
    mainClaim: null,
    strongestOptions: [],
    rejectedOptions: [],
    todoLaterIdeas: [],
    finalRecommendations: [],
    nextActions: [],
    counts: {
      claims: 0,
      edges: 0,
      moves: 0,
      artifacts: 0,
      versions: 0,
    },
    latestArtifact: null,
    lastMove: null,
    createdAt: "2026-05-02T12:00:00.000Z",
    updatedAt: "2026-05-02T12:00:00.000Z",
  };
}

function quickNote(rawIdea: string): BrainRecentIdea {
  return {
    id: "recent-1",
    scope: {},
    sessionId: null,
    kind: "raw_idea",
    title: rawIdea,
    summary: null,
    status: "active",
    rawIdea,
    content: rawIdea,
    payload: {},
    createdAt: "2026-05-02T12:00:00.000Z",
    updatedAt: "2026-05-02T12:00:00.000Z",
  };
}

function memoryProfile(): BrainMemoryProfileData {
  const permission = {
    visibility: "private" as const,
    trainingUse: false as const,
    source: "user_upload" as const,
    allowedUses: ["private_memory" as const, "create_retrieval" as const],
  };
  const source = {
    id: "brain-source-1",
    kind: "markdown" as const,
    label: "Founder workflow notes",
    scope: {},
    privacy: {
      visibility: "private" as const,
      trainingUse: false as const,
      rawRetention: false,
    },
    permission,
    textHash: "hash-1",
    contentLength: 128,
    chunkCount: 1,
    memoryNodeCount: 1,
    createdAt: "2026-05-02T12:00:00.000Z",
    updatedAt: "2026-05-02T12:00:00.000Z",
    fileName: "founder-workflow.md",
  };
  const signal = {
    id: "signal-1",
    kind: "preferred_build_style" as const,
    label: "Small reversible builds",
    summary: "The user prefers small reversible builds with explicit source provenance.",
    weight: 0.9,
    sourceNodeIds: ["memory-node-1"],
    updatedAt: "2026-05-02T12:00:01.000Z",
  };

  return {
    sourceOfTruth: "private_user_memory_sources_chunks_nodes_edges_profile_signals",
    scope: {},
    sources: [source],
    jobs: [
      {
        id: "brain-import-job-1",
        status: "completed",
        sourceImport: source,
        sourceId: source.id,
        errorMessages: [],
        importedAt: "2026-05-02T12:00:00.000Z",
        completedAt: "2026-05-02T12:00:01.000Z",
        counts: {
          sources: 1,
          chunks: 1,
          memoryNodes: 1,
          memoryEdges: 0,
          profileSignals: 1,
        },
      },
    ],
    recentMemoryNodes: [
      {
        id: "memory-node-1",
        type: "preference",
        title: "Preference - Small reversible builds",
        summary: "The user prefers small reversible builds with explicit source provenance.",
        text: "I prefer small reversible builds with explicit source provenance.",
        sourceId: source.id,
        chunkIds: ["brain-chunk-1"],
        confidence: 0.9,
        tags: ["small", "reversible", "builds"],
        permission,
        createdAt: "2026-05-02T12:00:01.000Z",
        lastSeenAt: "2026-05-02T12:00:01.000Z",
      },
    ],
    memoryEdges: [],
    profile: {
      recurringInterests: [],
      activeIdeaClusters: [],
      tasteSignals: [signal],
      preferredBuildStyle: [signal],
      commonFrustrations: [],
      privacySafeSummary:
        "Private user memory from 1 imported source. Current recurring topics: founders. No private global training is claimed or enabled.",
    },
    stats: {
      sourceCount: 1,
      chunkCount: 1,
      memoryNodeCount: 1,
      memoryEdgeCount: 0,
      profileSignalCount: 1,
    },
  };
}
