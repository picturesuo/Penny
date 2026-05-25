import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildCreateNextInput,
  buildCreateLearnBridgeNode,
  buildCreateOptionLearnNode,
  CreateArtifactPanel,
  CreateBrainOnboardingPanel,
  CreateWorkspace,
  CreateComparisonPanel,
  CreateEvidenceLedgerPanel,
  CreateExportFeedbackPanel,
  CreateFitTreeRail,
  CreateInterrogationPanel,
  CreateJudgmentNextPlace,
  CreateLearnBridgePanel,
  CreateOptionBoard,
  CreateOptionDetailsDrawer,
  CreatePathSidebar,
  CreatePromptExportActions,
  CreateProviderStatusPanel,
  CreateVerificationPanel,
  artifactOutlinePreview,
  createLearnBridgeConcept,
  createJudgmentNextPlaceCopy,
  isCreateComparisonDevMode,
} from "../src/components/CreateWorkspace";
import type { BrainMemoryProfileData, CandidateOption, CreateProviderComparisonResponse } from "../src/types/brain";

test("CreateOptionBoard renders numbered direction rows without evidence clutter", () => {
  const markup = renderToStaticMarkup(
    createElement(CreateOptionBoard, {
      options: [memoryGroundedOption(), contextLightOption()],
      nextBestMove: nextBestMove(),
      selectedOptionIds: [],
      busy: false,
      onToggleOption: () => undefined,
      onRejectOption: () => undefined,
      onLearnThis: () => undefined,
    }),
  );

  assert.match(markup, /Possible move/);
  assert.match(markup, /data-testid="create-option-board"/);
  assert.match(markup, /data-testid="create-option-card"/);
  assert.match(markup, /data-create-lens="Personal"/);
  assert.match(markup, /data-create-lens="Practical"/);
  assert.match(markup, /data-testid="create-option-reject-button"/);
  assert.match(markup, /Reject direction 1/);
  assert.match(markup, /create-option-list/);
  assert.match(markup, /create-option-number">1/);
  assert.match(markup, /create-option-number">2/);
  assert.match(markup, /Choose/);
  assert.match(markup, /Advance through Personal/);
  assert.doesNotMatch(markup, /Details/);
  assert.doesNotMatch(markup, /Past evidence|Taste|Context-light/);
  assert.doesNotMatch(markup, /Learn this/);
  assert.doesNotMatch(markup, /data-testid="create-option-learn-this-button"/);
  assert.doesNotMatch(markup, /intentMatch|buildability|novelty|rawScores/i);
});

test("CreatePathSidebar renders step navigation buttons", () => {
  const markup = renderToStaticMarkup(
    createElement(CreatePathSidebar, {
      activeIndex: 2,
      status: "Judgment recorded",
      canvasNodes: [
        {
          id: "backend-create-canvas-node",
          label: "Create",
          detail: "Selected Personal + Critical from backend canvas",
          note: "Explicit judgment recorded.",
          edgeToNext: "explains",
        },
      ],
      onOpenBrain: () => undefined,
      onStepSelect: () => undefined,
    }),
  );

  assert.match(markup, /aria-label="Go to Rough idea"/);
  assert.match(markup, /aria-label="Go to Five directions"/);
  assert.match(markup, /aria-label="Go to Judgment"/);
  assert.match(markup, /aria-label="Go to Idea Spec"/);
  assert.match(markup, /aria-label="Go to Verification"/);
  assert.match(markup, /aria-label="Go to Export"/);
  assert.match(markup, /aria-current="step"/);
  assert.match(markup, /Open Brain from Create/);
  assert.match(markup, /Selected Personal \+ Critical from backend canvas/);
  assert.match(markup, /Explicit judgment recorded/);
});

test("CreatePromptExportActions renders copy and download commands", () => {
  const markup = renderToStaticMarkup(
    createElement(CreatePromptExportActions, {
      notice: "Download started",
      onCopy: () => undefined,
      onDownload: () => undefined,
    }),
  );

  assert.match(markup, /aria-label="Prompt export actions"/);
  assert.match(markup, /Copy prompt/);
  assert.match(markup, /Download \.md/);
  assert.match(markup, /Download started/);
});

test("CreateEvidenceLedgerPanel separates past evidence from interpreted taste", () => {
  const markup = renderToStaticMarkup(
    createElement(CreateEvidenceLedgerPanel, {
      options: [memoryGroundedOption(), contextLightOption()],
      selectedOptionIds: ["create-option-personal"],
      rejectedOptionIds: ["create-option-practical"],
    }),
  );

  assert.match(markup, /data-testid="create-evidence-ledger"/);
  assert.match(markup, /Selected Personal; rejected Practical/);
  assert.match(markup, /Evidence from past/);
  assert.match(markup, /Project: founder workflow/);
  assert.match(markup, /Founder workflow notes/);
  assert.match(markup, /96% confidence/);
  assert.match(markup, /Rank effect: boosted\/high-confidence memory gets extra weight in Create/);
  assert.match(markup, /Taste interpreted/);
  assert.match(markup, /Preference: source-backed cards/);
  assert.doesNotMatch(markup, /Rough idea/);
});

test("CreateOptionDetailsDrawer renders rationale, memories, sources, and grounding details", () => {
  const markup = renderToStaticMarkup(
    createElement(CreateOptionDetailsDrawer, {
      option: memoryGroundedOption(),
      onClose: () => undefined,
    }),
  );

  assert.match(markup, /Why suggested/);
  assert.match(markup, /data-testid="create-evidence-drawer"/);
  assert.match(markup, /data-create-lens="Personal"/);
  assert.match(markup, /Rank reasons/);
  assert.match(markup, /Evidence used/);
  assert.match(markup, /Taste interpreted/);
  assert.match(markup, /Grounded/);
  assert.match(markup, /Inferred/);
  assert.match(markup, /Uncertainty/);
  assert.match(markup, /Founder workflow notes/);
  assert.match(markup, /Prefers source-backed cards/);
  assert.match(markup, /Rank effect: user-confirmed memory is weighted above inferred memory/);
});

test("CreateJudgmentNextPlace keeps selection, rejection, and comment flow visible", () => {
  const markup = renderToStaticMarkup(
    createElement(CreateJudgmentNextPlace, {
      selectedOptions: [optionForLens("Personal")],
      rejectedOptions: [optionForLens("Critical")],
      userComment: "Combine the personal evidence with the practical scope.",
      nextBestMove: nextBestMove(),
      artifact: null,
    }),
  );

  assert.match(markup, /Next place/);
  assert.match(markup, /Record the first judgment into an Idea Spec/);
  assert.match(markup, /Selected/);
  assert.match(markup, /Personal/);
  assert.match(markup, /Rejected/);
  assert.match(markup, /Critical/);
  assert.match(markup, /Comment/);
  assert.match(markup, /Combine the personal evidence with the practical scope/);
});

test("Create next place advances from options to artifact, Learn/export, and feedback", () => {
  const arm = createComparisonArm("deterministic", [memoryGroundedOption()]);

  assert.match(
    createJudgmentNextPlaceCopy({
      hasJudgment: false,
      artifact: null,
      promptExport: null,
      nextBestMove: nextBestMove(),
    }).title,
    /Advance through Personal/,
  );
  assert.match(
    createJudgmentNextPlaceCopy({
      hasJudgment: true,
      artifact: null,
      promptExport: null,
      nextBestMove: nextBestMove(),
    }).title,
    /Record the first judgment/,
  );
  assert.match(
    createJudgmentNextPlaceCopy({
      hasJudgment: true,
      artifact: arm.artifact,
      promptExport: null,
      nextBestMove: nextBestMove(),
    }).title,
    /Learn a fuzzy point or export/,
  );
  assert.match(
    createJudgmentNextPlaceCopy({
      hasJudgment: true,
      artifact: arm.artifact,
      promptExport: arm.promptExport,
      nextBestMove: nextBestMove(),
    }).title,
    /Review the exported prompt/,
  );
});

test("Create option Learn node carries option meaning, rationale, worked example, and artifact ref", () => {
  const artifact = createComparisonArm("deterministic", [memoryGroundedOption()]).artifact;
  const node = buildCreateOptionLearnNode(memoryGroundedOption(), artifact);

  assert.match(node.id, /^create-option-learn:/);
  assert.equal(node.kind, "concept");
  assert.equal(node.refs?.artifactId, artifact.id);
  assert.match(node.title, /Personal:/);
  assert.match(node.summary ?? "", /What this option means/);
  assert.match(node.summary ?? "", /Why Penny suggested it/);
  assert.match(node.summary ?? "", /Worked example/);
  assert.match(node.summary ?? "", /Next smallest concept/);
});

test("CreateBrainOnboardingPanel shows context-light and imported Brain states", () => {
  const contextLight = renderToStaticMarkup(createElement(CreateBrainOnboardingPanel, { profile: null }));
  const usingBrain = renderToStaticMarkup(createElement(CreateBrainOnboardingPanel, { profile: brainProfile() }));

  assert.match(contextLight, /Context-light/);
  assert.match(contextLight, /data-testid="create-brain-context"/);
  assert.match(contextLight, /data-create-context="context-light"/);
  assert.match(contextLight, /No imported Brain memories yet/);
  assert.match(usingBrain, /Using your Brain/);
  assert.match(usingBrain, /data-testid="create-brain-context"/);
  assert.match(usingBrain, /data-create-context="using-brain"/);
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

test("CreateLearnBridgePanel exposes the Brain Ranker lesson and focus node", () => {
  const artifact = createComparisonArm("deterministic", createOptionSet("deterministic").options).artifact;
  const markup = renderToStaticMarkup(
    createElement(CreateLearnBridgePanel, {
      artifact,
      onLearnThis: () => undefined,
    }),
  );
  const node = buildCreateLearnBridgeNode(artifact);

  assert.match(markup, /data-testid="create-learn-bridge"/);
  assert.match(markup, /data-testid="create-learn-this-button"/);
  assert.match(markup, /Learn this/);
  assert.match(markup, /Brain Ranker weights explicit judgment events over implicit behavior/);
  assert.match(markup, /Explain simply/);
  assert.match(markup, /worked example/);
  assert.match(markup, /applies to my Idea Spec|Apply to my Idea Spec/);
  assert.equal(createLearnBridgeConcept, "Brain Ranker weights explicit judgment events over implicit behavior.");
  assert.equal(node.id, "create-learn:brain-ranker-judgment-events");
  assert.equal(node.kind, "concept");
  assert.equal(node.refs?.artifactId, artifact.id);
  assert.match(node.summary ?? "", /Personal \+ Valuable \+ Critical/);
  assert.match(node.summary ?? "", /explicit selections, comments, and export feedback/);
});

test("CreateInterrogationPanel renders backend push, manual opt-out, answer box, and Learn controls", () => {
  const optionSet = createOptionSet("deterministic");
  const artifact = createComparisonArm("deterministic", optionSet.options).artifact;
  const markup = renderToStaticMarkup(
    createElement(CreateInterrogationPanel, {
      optionSet,
      options: optionSet.options,
      selectedOptions: [memoryGroundedOption()],
      rejectedOptions: [contextLightOption()],
      engineOptOut: true,
      manualFocus: "Decide the stack before architecture",
      userAnswer: "I need to compare boring React versus a server-rendered stack.",
      artifact,
      verification: null,
      busy: false,
      onEngineOptOutChange: () => undefined,
      onManualFocusChange: () => undefined,
      onUserAnswerChange: () => undefined,
      onToggleOption: () => undefined,
      onRejectOption: () => undefined,
      onUpdateArtifact: () => undefined,
      onLearnThis: () => undefined,
    }),
  );

  assert.match(markup, /data-testid="create-interrogation-panel"/);
  assert.match(markup, /Manual focus/);
  assert.match(markup, /Decide the stack before architecture/);
  assert.match(markup, /Five prompt options/);
  assert.match(markup, /Personal: Make Create use remembered founder taste/);
  assert.match(markup, /Your answer \/ changes/);
  assert.match(markup, /I need to compare boring React versus a server-rendered stack/);
  assert.match(markup, /Answer and update tree/);
  assert.match(markup, /aria-label="Learn direction 1:/);
});

test("CreateFitTreeRail renders the live outline, engine focus, judgment, and canvas slice", () => {
  const arm = createComparisonArm("deterministic", createOptionSet("deterministic").options);
  const markup = renderToStaticMarkup(
    createElement(CreateFitTreeRail, {
      activeIndex: 3,
      status: "Next Create prompt ready",
      optionSet: arm.optionSet,
      selectedOptions: [memoryGroundedOption()],
      rejectedOptions: [contextLightOption()],
      userComment: "Opt-out focus: choose stack.\n\nFavor boring tools.",
      artifact: arm.artifact,
      verification: arm.verification,
      promptExport: arm.promptExport,
      engineOptOut: false,
      manualFocus: "",
      canvasNodes: [
        {
          id: "create",
          label: "Create",
          detail: "Selected Personal",
          edgeToNext: "explains",
        },
      ],
      onOpenBrain: () => undefined,
      onStepSelect: () => undefined,
    }),
  );

  assert.match(markup, /data-testid="create-fit-tree-rail"/);
  assert.match(markup, /Live fit tree/);
  assert.match(markup, /Ready for Codex/);
  assert.match(markup, /Engine focus/);
  assert.match(markup, /Selected<\/dt><dd>Personal/);
  assert.match(markup, /Rejected<\/dt><dd>Practical/);
  assert.match(markup, /Outline/);
  assert.match(markup, /Canvas/);
  assert.match(markup, /Selected Personal/);
});

test("Create UI smoke covers Brain state, five options, evidence, verification, and export feedback", () => {
  const options = (["Personal", "Practical", "Valuable", "Critical", "Weird"] satisfies CandidateOption["lens"][]).map(optionForLens);
  const artifact = createComparisonArm("deterministic", options).artifact;
  const promptExport = createComparisonArm("deterministic", options).promptExport;
  const markup = renderToStaticMarkup(
    createElement("div", null, [
      createElement(CreateBrainOnboardingPanel, { key: "brain", profile: brainProfile() }),
      createElement(CreateOptionBoard, {
        key: "board",
        options,
        nextBestMove: nextBestMove(),
        selectedOptionIds: ["create-option-personal", "create-option-critical"],
        busy: false,
        onToggleOption: () => undefined,
      }),
      createElement(CreateEvidenceLedgerPanel, {
        key: "ledger",
        options,
        selectedOptionIds: ["create-option-personal", "create-option-critical"],
      }),
      createElement(CreateOptionDetailsDrawer, {
        key: "drawer",
        option: optionForLens("Personal"),
        onClose: () => undefined,
      }),
      createElement(CreateArtifactPanel, {
        key: "artifact",
        artifact: {
          ...artifact,
          sections: [
            {
              id: "artifact-section-final",
              title: "Final coding-agent prompt",
              body: "## Source / Memory Evidence\nFounder workflow notes\n## Acceptance Tests\nThe export preserves memory evidence.",
              status: "updated",
            },
          ],
        },
        selectedOptions: [optionForLens("Personal"), optionForLens("Critical")],
        rejectedOptions: [optionForLens("Weird")],
        userComment: "Keep the founder/builder evidence visible.",
      }),
      createElement(CreateVerificationPanel, {
        key: "verification",
        verification: {
          id: "verification-1",
          artifactId: artifact.id,
          createdAt: "2026-05-20T12:00:00.000Z",
          verdict: "ready",
          scores: {
            intentMatch: 90,
            personalMemoryGrounding: 88,
            buildability: 86,
            nonGenericness: 91,
            userAutonomyPreserved: 95,
            fakeClaimRisk: 96,
            promptCompleteness: 100,
          },
          checks: [
            {
              key: "personal_memory_grounding",
              label: "Personal memory grounding",
              status: "pass",
              score: 88,
              summary: "Memory/source evidence is visible on the selected options and prompt artifact.",
            },
          ],
          missingInfo: [],
          risks: [],
        },
      }),
      createElement(CreateExportFeedbackPanel, {
        key: "feedback",
        artifact,
        promptExport,
        busy: false,
        rating: "useful",
        reasons: ["ready_to_ship"],
        comment: "The export includes the selected evidence.",
        status: "Feedback saved",
        onRatingChange: () => undefined,
        onReasonToggle: () => undefined,
        onCommentChange: () => undefined,
        onSubmit: () => undefined,
      }),
    ]),
  );

  assert.match(markup, /Using your Brain/);
  assert.match(markup, /data-testid="create-brain-context"/);
  assert.match(markup, /Possible move/);
  assert.match(markup, /data-testid="create-option-board"/);
  assert.match(markup, /data-testid="create-evidence-ledger"/);
  assert.match(markup, /data-testid="create-evidence-drawer"/);
  assert.match(markup, /data-testid="create-artifact-panel"/);
  assert.match(markup, /Personal/);
  assert.match(markup, /Practical/);
  assert.match(markup, /Valuable/);
  assert.match(markup, /Critical/);
  assert.match(markup, /Weird/);
  assert.match(markup, /Evidence used/);
  assert.match(markup, /Taste interpreted/);
  assert.match(markup, /Grounded/);
  assert.match(markup, /Inferred/);
  assert.match(markup, /Show full section text/);
  assert.match(markup, /Selected Create directions/);
  assert.match(markup, /Idea Spec inputs/);
  assert.match(markup, /Selected history/);
  assert.match(markup, /Rejected directions/);
  assert.match(markup, /Rejected directions<\/span><p>Weird<\/p>/);
  assert.match(markup, /Keep the founder\/builder evidence visible/);
  assert.match(markup, /2 past evidence refs/);
  assert.match(markup, /1 taste signals kept separate/);
  assert.match(markup, /Expand Product thesis/);
  assert.match(markup, /Verification/);
  assert.match(markup, /Personal memory grounding/);
  assert.match(markup, /Export feedback/);
  assert.match(markup, /Feedback saved/);
});

test("artifactOutlinePreview keeps Create outline cards scannable", () => {
  const preview = artifactOutlinePreview(
    "Memory layer should preserve explicit user judgment, selected directions, source evidence, fixture labels, and coding-agent export constraints without dumping the entire prompt into the card.",
  );
  const commentPreview = artifactOutlinePreview(
    "Selected option history:\n- Personal: Make it grounded.\nUser comment: Make this founder/builder focused. Keep the memory-native creativity angle.",
  );

  assert.match(preview, /^Memory layer should preserve explicit user judgment/);
  assert.ok(preview.length <= 150);
  assert.match(preview, /\.\.\.$/);
  assert.equal(artifactOutlinePreview("### Core loop\n- Capture rough idea\n- Return five choices"), "Core loop Capture rough idea Return five choices");
  assert.equal(
    commentPreview,
    "User comment: Make this founder/builder focused. Keep the memory-native creativity angle.",
  );
});

test("Create UI smoke renders real Gmail evidence in details and prompt artifact", () => {
  const option = gmailEvidenceOption();
  const artifact = createComparisonArm("deterministic", [option]).artifact;
  const markup = renderToStaticMarkup(
    createElement("div", null, [
      createElement(CreateOptionDetailsDrawer, {
        key: "drawer",
        option,
        onClose: () => undefined,
      }),
      createElement(CreateArtifactPanel, {
        key: "artifact",
        artifact: {
          ...artifact,
          title: "Gmail-grounded coding prompt",
          sections: [
            {
              id: "artifact-section-gmail-evidence",
              title: "Source / Memory Evidence",
              body: "Use the Launch partner evidence Gmail memory and source ref only because the selected option cited it.",
              status: "updated",
            },
          ],
        },
      }),
    ]),
  );

  assert.match(markup, /Personal details/);
  assert.match(markup, /data-testid="create-evidence-drawer"/);
  assert.match(markup, /data-create-lens="Personal"/);
  assert.match(markup, /data-testid="create-artifact-panel"/);
  assert.match(markup, /Evidence used/);
  assert.match(markup, /Taste interpreted/);
  assert.match(markup, /Launch partner Gmail memory/);
  assert.match(markup, /Launch partner evidence/);
  assert.match(markup, /gmail:message:gmail-create-msg-1/);
  assert.match(markup, /Gmail-grounded coding prompt/);
  assert.match(markup, /Show full section text/);
  assert.doesNotMatch(markup, /Private raw Gmail body|rawBody|plainTextBody|credentialRef|accessToken|refreshToken/i);
});

test("CreateWorkspace opens on the chat-like Create entry surface", () => {
  const markup = renderToStaticMarkup(createElement(CreateWorkspace, { data: null, status: "ready", isThinking: false }));

  assert.match(markup, /data-testid="create-entry"/);
  assert.match(markup, /What do you want to create/);
  assert.match(markup, /Search or describe what you want to create/);
  assert.match(markup, /Penny turns a rough seed into five AI-shaped directions/);
  assert.doesNotMatch(markup, /Brain archive/);
  assert.doesNotMatch(markup, /Recent research/);
  assert.doesNotMatch(markup, /data-testid="create-option-board"/);
  assert.doesNotMatch(markup, /data-testid="create-export-panel"/);
});

test("CreateWorkspace keeps the Create entry free of sidebar return controls", () => {
  const markup = renderToStaticMarkup(
    createElement(CreateWorkspace, {
      data: null,
      status: "ready",
      isThinking: false,
      onOpenBrain: () => undefined,
    }),
  );

  assert.doesNotMatch(markup, /aria-label="Open Brain from Create"/);
  assert.doesNotMatch(markup, /Open Brain/);
});

test("isCreateComparisonDevMode only exposes comparison with an explicit flag", () => {
  assert.equal(isCreateComparisonDevMode({ DEV: true }), false);
  assert.equal(isCreateComparisonDevMode({ MODE: "test" }), false);
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
        confidence: 0.95,
        evidenceLevel: "user_confirmed",
        rankEffect: "user_confirmed",
      },
      {
        id: "memory-2",
        label: "Project: founder workflow",
        kind: "brain",
        summary: "Penny Create should help founders shape startup ideas.",
        confidence: 0.96,
        evidenceLevel: "grounded",
        rankEffect: "boosted",
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
    profileReview: null,
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

function gmailEvidenceOption(): CandidateOption {
  return {
    ...memoryGroundedOption(),
    id: "create-option-gmail-personal",
    title: "Use real Gmail launch-partner evidence",
    oneLine: "Ground the Personal direction in synced Gmail memory.",
    rationale: "Use only the selected private Gmail evidence that Penny synced into Brain.",
    topReason: "This uses a real synced Gmail memory: Launch partner evidence.",
    rankReasons: ["Gmail evidence is present because the staged account was synced before Create."],
    memoryUsed: [
      {
        id: "memory-gmail-1",
        label: "Launch partner Gmail memory",
        kind: "brain",
        summary: "Launch partner evidence says follow-up urgency matters, while generic CRM dashboards were rejected.",
      },
    ],
    sourcesUsed: [
      {
        id: "source-gmail-1",
        label: "Launch partner evidence",
        kind: "source",
        excerpt: "Synced Gmail message source ref gmail:message:gmail-create-msg-1 supports the selected Personal direction.",
        sourceRange: "gmail:message:gmail-create-msg-1",
      },
    ],
    memoryCount: 1,
    sourceCount: 1,
  };
}

function optionForLens(lens: CandidateOption["lens"]): CandidateOption {
  const base = memoryGroundedOption();

  return {
    ...base,
    id: `create-option-${lens.toLowerCase()}`,
    lens,
    title: `${lens}: source-backed Create direction`,
    oneLine: `${lens} option grounded in private Brain memory and source evidence.`,
    topReason:
      lens === "Critical"
        ? "This catches genericness or rejected-direction risk: avoid generic chatbot sidebars."
        : base.topReason,
    rationale:
      lens === "Weird"
        ? "Expand the idea through a distinctive source-backed angle without ignoring the Create export intent."
        : base.rationale,
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
