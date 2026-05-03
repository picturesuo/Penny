import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrainWorkspace } from "../src/components/BrainWorkspace";
import type { BrainDocumentsData, BrainRecentIdea } from "../src/types/brain";

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
