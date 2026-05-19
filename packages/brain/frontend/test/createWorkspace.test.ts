import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildCreateNextInput, CreateBrainOnboardingPanel, CreateOptionBoard, CreateOptionDetailsDrawer } from "../src/components/CheckWorkspace";
import type { BrainMemoryProfileData, CandidateOption } from "../src/types/brain";

test("CreateOptionBoard shows memory and source grounding counts on option cards", () => {
  const markup = renderToStaticMarkup(
    createElement(CreateOptionBoard, {
      options: [memoryGroundedOption(), contextLightOption()],
      selectedOptionIds: [],
      busy: false,
      onToggleOption: () => undefined,
    }),
  );

  assert.match(markup, /2 memories/);
  assert.match(markup, /2 sources/);
  assert.match(markup, /0 memories/);
  assert.match(markup, /1 sources/);
  assert.match(markup, /Context-light/);
  assert.match(markup, /Details/);
});

test("CreateOptionDetailsDrawer renders rationale, memories, sources, and grounding details", () => {
  const markup = renderToStaticMarkup(
    createElement(CreateOptionDetailsDrawer, {
      option: memoryGroundedOption(),
      onClose: () => undefined,
    }),
  );

  assert.match(markup, /Why suggested/);
  assert.match(markup, /Memories used/);
  assert.match(markup, /Sources used/);
  assert.match(markup, /Grounded/);
  assert.match(markup, /Inferred/);
  assert.match(markup, /Founder workflow notes/);
  assert.match(markup, /Prefers source-backed cards/);
});

test("CreateBrainOnboardingPanel shows context-light and imported Brain states", () => {
  const contextLight = renderToStaticMarkup(createElement(CreateBrainOnboardingPanel, { profile: null }));
  const usingBrain = renderToStaticMarkup(createElement(CreateBrainOnboardingPanel, { profile: brainProfile() }));

  assert.match(contextLight, /Context-light/);
  assert.match(contextLight, /No imported Brain memories yet/);
  assert.match(usingBrain, /Using your Brain/);
  assert.match(usingBrain, /1 memories/);
  assert.match(usingBrain, /1 sources/);
  assert.match(usingBrain, /Small reversible builds/);
});

test("buildCreateNextInput carries imported Brain profile memory and source evidence", () => {
  const input = buildCreateNextInput({
    rawIdea: "Build Penny Create export.",
    data: null,
    brainProfile: brainProfile(),
  });

  assert.equal(input.memory?.[0]?.kind, "preference");
  assert.match(input.memory?.[0]?.summary ?? "", /explicit source provenance/);
  assert.equal(input.sources?.[0]?.kind, "source");
  assert.match(input.sources?.[0]?.excerpt ?? "", /1 memories and 1 chunks/);
  assert.match(input.context?.summary ?? "", /Using imported Brain context/);
  assert.match(input.context?.summary ?? "", /Small reversible builds/);
});

function memoryGroundedOption(): CandidateOption {
  return {
    id: "create-option-personal",
    lens: "Personal",
    title: "Make Create use remembered founder taste",
    oneLine: "Ground options in private memory.",
    rationale: "Use remembered preferences as constraints rather than inventing context.",
    nextMove: "Keep source-backed cards visible.",
    risks: ["Could imply more memory than Penny has."],
    memoryUsed: [
      {
        id: "memory-1",
        label: "Preference: source-backed cards",
        kind: "preference",
        summary: "Prefers source-backed cards over generic suggestions.",
      },
      {
        id: "memory-2",
        label: "Project: founder workflow",
        kind: "brain",
        summary: "Penny Create should help founders shape startup ideas.",
      },
    ],
    sourcesUsed: [
      {
        id: "source-1",
        label: "Founder workflow notes",
        kind: "source",
        excerpt: "I prefer source-backed cards over generic suggestions.",
        sourceRange: "chunk 1",
      },
      {
        id: "source-rough",
        label: "Rough idea",
        kind: "rough_idea",
        excerpt: "Build memory-grounded Create.",
      },
    ],
    scores: { intentMatch: 90, buildability: 80, value: 85, novelty: 70, risk: 30 },
  };
}

function brainProfile(): BrainMemoryProfileData {
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
    jobs: [],
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
        labels: ["taste"],
        evidenceLevel: "grounded",
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
      privacySafeSummary: "Private user memory from 1 imported source.",
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

function contextLightOption(): CandidateOption {
  return {
    ...memoryGroundedOption(),
    id: "create-option-practical",
    lens: "Practical",
    title: "Ship the smallest Create loop",
    rationale: "Context-light: no imported Penny memory matched this idea.",
    memoryUsed: [],
    sourcesUsed: [
      {
        id: "source-rough",
        label: "Rough idea",
        kind: "rough_idea",
        excerpt: "Build memory-grounded Create.",
      },
    ],
  };
}
