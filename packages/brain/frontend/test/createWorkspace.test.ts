import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildCreateNextInput,
  CreateBrainOnboardingPanel,
  CreateComparisonPanel,
  CreateExportFeedbackPanel,
  CreateOptionBoard,
  CreateOptionDetailsDrawer,
  CreateProviderStatusPanel,
  isCreateComparisonDevMode,
} from "../src/components/CreateWorkspace";
import type { BrainMemoryProfileData, CandidateOption, CreateProviderComparisonResponse } from "../src/types/brain";

test("CreateOptionBoard shows memory and source grounding counts on option cards", () => {
  const markup = renderToStaticMarkup(
    createElement(CreateOptionBoard, {
      options: [memoryGroundedOption(), contextLightOption()],
      nextBestMove: nextBestMove(),
      selectedOptionIds: [],
      busy: false,
      onToggleOption: () => undefined,
    }),
  );

  assert.match(markup, /Next-best move/);
  assert.match(markup, /Advance through Personal/);
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
  assert.match(markup, /Rank reasons/);
  assert.match(markup, /Memories used/);
  assert.match(markup, /Sources used/);
  assert.match(markup, /Grounded/);
  assert.match(markup, /Inferred/);
  assert.match(markup, /Uncertainty/);
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

test("CreateProviderStatusPanel exposes provider mode, schema, counts, and fallback reason", () => {
  const markup = renderToStaticMarkup(
    createElement(CreateProviderStatusPanel, {
      observability: {
        providerMode: "deterministic_fallback",
        providerName: "test",
        schemaValidation: "failure",
        schemaValidationErrors: ["options.4 missing"],
        fallbackReason: "Model-backed Create provider fell back to deterministic options.",
        memoryCountUsed: 3,
        sourceCountUsed: 2,
        rejectedDirectionsUsed: ["Rejected direction: generic chatbot"],
        generatedLenses: ["Personal", "Practical", "Valuable", "Critical", "Weird"],
        selectedOptionIds: [],
        selectedLenses: [],
        exportQualitySignals: promptQualitySignals(),
      },
    }),
  );

  assert.match(markup, /Fallback/);
  assert.match(markup, /failure/);
  assert.match(markup, /3/);
  assert.match(markup, /2/);
  assert.match(markup, /fell back to deterministic/);
  assert.match(markup, /options\.4 missing/);
});

test("CreateComparisonPanel renders deterministic and model-backed options with quality signals", () => {
  const comparison = createComparisonPayload();
  const markup = renderToStaticMarkup(
    createElement(CreateComparisonPanel, {
      comparison,
      busy: false,
      onCompare: () => undefined,
    }),
  );

  assert.match(markup, /DEV COMPARISON/);
  assert.match(markup, /Deterministic/);
  assert.match(markup, /Model-backed/);
  assert.match(markup, /Compare providers/);
  assert.match(markup, /Schema/);
  assert.match(markup, /Memory/);
  assert.match(markup, /Prompt/);
  assert.match(markup, /Personal model-backed direction/);
  assert.match(markup, /Prompt completeness 100/);
  assert.match(markup, /Missing prompt signals: none/);
});

test("CreateExportFeedbackPanel renders rating, reason, and save controls", () => {
  const arm = createComparisonArm("deterministic", createOptionSet("deterministic").options);
  const markup = renderToStaticMarkup(
    createElement(CreateExportFeedbackPanel, {
      artifact: arm.artifact,
      promptExport: arm.promptExport,
      busy: false,
      rating: "not_useful",
      reasons: ["too_generic"],
      comment: "Needs sharper memory constraints.",
      status: "Feedback saved",
      onRatingChange: () => undefined,
      onReasonToggle: () => undefined,
      onCommentChange: () => undefined,
      onSubmit: () => undefined,
    }),
  );

  assert.match(markup, /Useful/);
  assert.match(markup, /Not useful/);
  assert.match(markup, /Too generic/);
  assert.match(markup, /Missing constraints/);
  assert.match(markup, /Save feedback/);
  assert.match(markup, /Feedback saved/);
});

test("isCreateComparisonDevMode only exposes comparison in dev, test, or explicit flag", () => {
  assert.equal(isCreateComparisonDevMode({ DEV: true }), true);
  assert.equal(isCreateComparisonDevMode({ MODE: "test" }), true);
  assert.equal(isCreateComparisonDevMode({ VITE_PENNY_CREATE_COMPARE: "true" }), true);
  assert.equal(isCreateComparisonDevMode({ DEV: false, MODE: "production" }), false);
});

function memoryGroundedOption(): CandidateOption {
  return {
    id: "create-option-personal",
    lens: "Personal",
    title: "Make Create use remembered founder taste",
    oneLine: "Ground options in private memory.",
    rationale: "Use remembered preferences as constraints rather than inventing context.",
    nextMove: "Keep source-backed cards visible.",
    topReason: "This uses a remembered personal signal: Prefers source-backed cards over generic suggestions.",
    grounding: "grounded",
    contextLabel: "Grounded in Brain memory",
    memoryCount: 2,
    sourceCount: 2,
    rankReasons: ["This uses a remembered personal signal: Prefers source-backed cards over generic suggestions."],
    uncertainty: ["No major missing Brain context detected for this lens."],
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
    topReason: "Context-light: no relevant Brain memory matched this task.",
    grounding: "context_light",
    contextLabel: "Context-light / search-needed / inferred",
    memoryCount: 0,
    sourceCount: 1,
    rankReasons: ["Practical is inferred from the rough idea because no relevant durable Brain memory matched."],
    uncertainty: ["No relevant Brain memory matched strongly."],
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

function createComparisonPayload(): CreateProviderComparisonResponse["data"] {
  const deterministicOptions = createOptionSet("deterministic").options;
  const modelOptions = createOptionSet("model").options.map((option) => ({
    ...option,
    title: `${option.lens} model-backed direction`,
    oneLine: `Grounded model-backed ${option.lens.toLowerCase()} direction.`,
  }));

  return {
    sourceOfTruth: "deterministic_model_backed_create_comparison",
    rawIdea: "Build memory-grounded Create.",
    deterministic: createComparisonArm("deterministic", deterministicOptions),
    modelBacked: createComparisonArm("model_backed", modelOptions),
  };
}

function createComparisonArm(providerUsed: "deterministic" | "model_backed", options: CandidateOption[]): CreateProviderComparisonResponse["data"]["deterministic"] {
  return {
    label: providerUsed === "deterministic" ? "deterministic" : "model_backed",
    providerUsed,
    fallbackReason: null,
    optionSet: createOptionSet(providerUsed, options),
    artifact: {
      id: `artifact-${providerUsed}`,
      projectId: "project-test",
      sessionId: "session-test",
      title: "Create prompt",
      version: 1,
      rawIdea: "Build memory-grounded Create.",
      sections: [],
      sourceOptionSetIds: [`options-${providerUsed}`],
      judgmentEventIds: [],
      updatedAt: "2026-05-19T12:00:00.000Z",
    },
    verification: {
      id: `verification-${providerUsed}`,
      artifactId: `artifact-${providerUsed}`,
      createdAt: "2026-05-19T12:00:00.000Z",
      verdict: "ready",
      scores: {
        intentMatch: 90,
        personalMemoryGrounding: 92,
        buildability: 88,
        nonGenericness: 91,
        userAutonomyPreserved: 95,
        fakeClaimRisk: 96,
        promptCompleteness: 100,
      },
      checks: [],
      missingInfo: [],
      risks: [],
    },
    promptExport: {
      id: `export-${providerUsed}`,
      artifactId: `artifact-${providerUsed}`,
      format: "coding_agent_prompt",
      targets: ["Codex", "Claude Code", "Cursor"],
      text: "# Create prompt",
      fileName: "create-prompt.md",
      qualitySignals: promptQualitySignals(),
      createdAt: "2026-05-19T12:00:00.000Z",
    },
    observability: {
      providerMode: providerUsed,
      providerName: providerUsed === "deterministic" ? "deterministic" : "test",
      schemaValidation: providerUsed === "deterministic" ? "not_run" : "success",
      schemaValidationErrors: [],
      fallbackReason: null,
      memoryCountUsed: 2,
      sourceCountUsed: 2,
      rejectedDirectionsUsed: [],
      generatedLenses: ["Personal", "Practical", "Valuable", "Critical", "Weird"],
      selectedOptionIds: [],
      selectedLenses: [],
      exportQualitySignals: promptQualitySignals(),
    },
  };
}

function createOptionSet(id: string, options = [memoryGroundedOption(), contextLightOption()]): CreateProviderComparisonResponse["data"]["deterministic"]["optionSet"] {
  return {
    id: `options-${id}`,
    projectId: "project-test",
    sessionId: "session-test",
    sourceOfTruth: id === "deterministic" ? "rough_idea_context_deterministic_create_lenses" : "rough_idea_context_model_backed_create_lenses",
    rawIdea: "Build memory-grounded Create.",
    options,
    nextBestMove: nextBestMove(),
    rankedCandidates: [],
    memoryUsed: memoryGroundedOption().memoryUsed,
    sourcesUsed: memoryGroundedOption().sourcesUsed,
    createdAt: "2026-05-19T12:00:00.000Z",
  };
}

function nextBestMove() {
  return {
    id: "next-best-personal",
    title: "Advance through Personal",
    action: "Pin the source-backed cards preference as a visible Create constraint.",
    whyItMatters: "This uses confirmed Brain context rather than inventing personalization.",
    contextUsed: ["2 memory ref(s)", "2 source ref(s)", "Grounded in Brain memory"],
    uncertainty: ["No major missing Brain context detected for this lens."],
    grounded: true,
    createdAt: "2026-05-19T12:00:00.000Z",
  };
}

function promptQualitySignals() {
  return {
    hasRoughIdea: true,
    hasSelectedOptionHistory: true,
    hasRelevantPersonalContext: true,
    hasRepeatedRejectedDirections: true,
    hasProductGoal: true,
    hasNonGoals: true,
    hasUxRequirements: true,
    hasFrontendRequirements: true,
    hasBackendRequirements: true,
    hasDataModel: true,
    hasPrivacyConstraints: true,
    hasVerificationRequirements: true,
    hasImplementationSequence: true,
    hasAcceptanceTests: true,
    hasDoNotBreakList: true,
    promptCompletenessScore: 100,
    missing: [],
  };
}
