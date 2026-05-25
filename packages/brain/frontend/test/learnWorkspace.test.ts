import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  LearnWorkspace,
  askPennyContextForStep,
  meaningMapItemsForLesson,
  visibleLearningPathSteps,
} from "../src/components/LearnWorkspace";

test("LearnWorkspace first screen opens the Learn composer", () => {
  const markup = renderToStaticMarkup(
    createElement(LearnWorkspace, learnWorkspaceProps()),
  );

  assert.match(markup, /Start a Learn session/);
  assert.match(markup, /Start from something Penny already knows/);
  assert.match(markup, /Build Learn path/);
  assert.match(markup, /pick a previous thought/);
  assert.match(markup, /Paste the messy thought, decision, or question/);
  assert.match(markup, /Ready for Brain/);
  assert.match(markup, /Previous/);
  assert.match(markup, /No previous thoughts yet/);
  assert.doesNotMatch(markup, /Name the program/);
  assert.doesNotMatch(markup, /YC is not just an investor logo/);
  assert.doesNotMatch(markup, /Current lesson context is loaded/);
  assert.doesNotMatch(markup, /LEARNING PATH/);
  assert.doesNotMatch(markup, /LESSON 1 \/ 15/);
  assert.doesNotMatch(markup, /penny@learn:~\$/);
  assert.doesNotMatch(markup, /Enter forward \/ Esc back/);
  assert.doesNotMatch(markup, /STRUCTURE/);
  assert.doesNotMatch(markup, /Fill in the check/);
  assert.doesNotMatch(markup, /Positive/);
  assert.doesNotMatch(markup, /Negative/);
  assert.doesNotMatch(markup, /Curve/);
  assert.doesNotMatch(markup, /Good example/);
  assert.doesNotMatch(markup, /Bad example/);
  assert.doesNotMatch(markup, /Draft 1/);
  assert.doesNotMatch(markup, /\+ Tab/);
  assert.doesNotMatch(markup, /Final typed answer/);
  assert.doesNotMatch(markup, /Type this part/);
  assert.doesNotMatch(markup, /Definition/);
  assert.doesNotMatch(markup, /Application/);
  assert.doesNotMatch(markup, /Procedure/);
  assert.doesNotMatch(markup, /ANSWER/);
  assert.doesNotMatch(markup, /WRITE THIS DOWN/);
  assert.doesNotMatch(markup, /MISCONCEPTIONS/);
  assert.doesNotMatch(markup, /EXAMPLE/);
  assert.doesNotMatch(markup, /Thinking graph/);
  assert.doesNotMatch(markup, /data-testid="learn-understanding-tour"/);
  assert.doesNotMatch(markup, /data-testid="learn-meaning-map"/);
  assert.doesNotMatch(markup, /aria-label="Ask about Source:/);
  assert.doesNotMatch(markup, /Grounding/);
  assert.doesNotMatch(markup, /What changes/);
  assert.doesNotMatch(markup, /Can you use it/);
  assert.doesNotMatch(markup, /Use &quot;Name the program&quot; to answer what YC would actually evaluate/);
  assert.doesNotMatch(markup, /Do not treat investor interest as stronger than founder proof/);
  assert.doesNotMatch(markup, /What shall we think through/);
  assert.doesNotMatch(markup, /Save to Brain/);
  assert.doesNotMatch(markup, /Have I thought about this before/);
  assert.doesNotMatch(markup, /Used your Brain/);
  assert.doesNotMatch(markup, /Can you explain this in simpler terms/);
  assert.doesNotMatch(markup, /Give me another example/);
  assert.doesNotMatch(markup, /Search\/Settings|Settings|Makes Cents|MAKES CENTS/);
  assert.doesNotMatch(markup, /FULLY FLESHED-OUT EXAMPLE/);
  assert.doesNotMatch(markup, /Visual placeholder/);
  assert.doesNotMatch(markup, /YC program loop/);
  assert.doesNotMatch(markup, /Your turn/);
  assert.doesNotMatch(markup, /Takeaway/);
  assert.doesNotMatch(markup, /Explain visual/);
  assert.doesNotMatch(markup, /NOTE/);
});

test("LearnWorkspace renders the Create Learn bridge with a Back to Create control", () => {
  const markup = renderToStaticMarkup(
    createElement(
      LearnWorkspace,
      learnWorkspaceProps({
        focusNode: {
          id: "create-learn:brain-ranker-judgment-events",
          kind: "concept",
          title: "Brain Ranker judgment weighting",
          summary: "Brain Ranker weights explicit judgment events over implicit behavior.",
          refs: { artifactId: "artifact-create-test" },
        },
        onBackToCreate: () => undefined,
      }),
    ),
  );

  assert.match(markup, /data-testid="learn-back-to-create"/);
  assert.match(markup, /Back to Create/);
  assert.match(markup, /Learn how Brain Ranker uses explicit Create judgment/);
  assert.match(markup, /Explain simply/);
  assert.match(markup, /Show worked example/);
  assert.match(markup, /Apply to my artifact/);
  assert.match(markup, /aria-current="step"/);
  assert.match(markup, /explicit judgment events are the things you deliberately do/i);
  assert.match(markup, /selecting cards, writing comments, and rating exports/i);
  assert.match(markup, /data-testid="learn-understanding-tour"/);
  assert.match(markup, /Thinking graph/);
  assert.match(markup, /data-testid="learn-meaning-map"/);
});

test("LearnWorkspace lets Learn start from previous Brain material", () => {
  const markup = renderToStaticMarkup(
    createElement(
      LearnWorkspace,
      learnWorkspaceProps({
        documents: [
          {
            id: "doc-pricing",
            sessionId: "session-pricing",
            title: "Pricing strategy",
            description: "Figure out whether founders pay for sharper decisions.",
            status: "open",
            originalIdea: "Should Penny charge founders for decision support?",
            mainClaim: null,
            strongestOptions: [],
            rejectedOptions: [],
            todoLaterIdeas: [],
            finalRecommendations: [],
            nextActions: ["Check willingness to pay"],
            counts: { claims: 1, edges: 0, moves: 1, artifacts: 0, versions: 1 },
            latestArtifact: null,
            lastMove: null,
            createdAt: "2026-05-24T00:00:00.000Z",
            updatedAt: "2026-05-24T00:00:00.000Z",
          },
        ],
      }),
    ),
  );

  assert.match(markup, /Learn from your Brain/);
  assert.match(markup, /Pricing strategy/);
  assert.match(markup, /Figure out whether founders pay/);
});

test("LearnWorkspace renders a Create option Learn bridge with option-specific choices", () => {
  const markup = renderToStaticMarkup(
    createElement(
      LearnWorkspace,
      learnWorkspaceProps({
        focusNode: {
          id: "create-option-learn:create-option-personal",
          kind: "concept",
          title: "Personal: Memory-native workbench",
          summary:
            "What this option means: keep Penny grounded in founder context. Why Penny suggested it: the source evidence points to human judgment. Worked example: select the option and update the artifact. Next smallest concept: understand how Personal changes the selected mix.",
          refs: { artifactId: "artifact-create-option-test" },
        },
        onBackToCreate: () => undefined,
      }),
    ),
  );

  assert.match(markup, /data-testid="learn-back-to-create"/);
  assert.match(markup, /Learn Personal: Memory-native workbench without leaving Create judgment behind/);
  assert.match(markup, /Explain simply/);
  assert.match(markup, /Show worked example/);
  assert.match(markup, /Apply to my artifact/);
  assert.match(markup, /What this option means/);
  assert.match(markup, /Why Penny suggested it/);
});

test("meaningMapItemsForLesson turns arbitrary source material into a compact source path", () => {
  const items = meaningMapItemsForLesson(
    lesson(
      "Find customer urgency",
      "Understand a messy pricing memo",
      ["name budget pressure", "separate nice-to-have from urgent pain"],
      "The memo says customers like the prototype, but only two teams named a budget-backed deadline.",
    ),
  );

  assert.deepEqual(items.map((item) => item.label), ["Source", "Map", "Teach", "Use", "Check"]);
  assert.match(items[0]?.text ?? "", /memo says customers like/i);
  assert.match(items[1]?.text ?? "", /Find customer urgency/);
  assert.match(items[2]?.text ?? "", /Find customer urgency explanation/);
  assert.equal(items[3]?.text, "Use find customer urgency on one case");
  assert.equal(items[4]?.text, "Check against source");
});

test("LearnWorkspace renders backend expert learning plan subgroups", () => {
  const markup = renderToStaticMarkup(
    createElement(LearnWorkspace, learnWorkspaceProps({
      data: {
        source: { kind: "raw_idea", rawText: "Teach me a better pricing strategy." },
        learningPlan: {
          expertRole: "A pricing expert teaching through examples and failure modes.",
          goal: "I want to understand pricing strategy.",
          paragraphFit: "one_subgroup_per_page",
          groups: [
            {
              id: "pricing-frame",
              title: "Frame pricing",
              purpose: "Make pricing teachable before moving into evidence.",
              subgroups: [
                {
                  id: "pricing-frame-goal",
                  title: "Name the pricing goal",
                  teachingParagraph:
                    "An expert starts by naming what the pricing decision must accomplish. The learner should know who pays, what value they believe they receive, and what signal would show the price is too high or too low.",
                  keyMoves: ["Name the buyer.", "Name the value unit.", "Name the failure signal."],
                  workedExample: "For Penny, the value unit might be a sharper founder decision, not a generic AI conversation.",
                  visualExample: {
                    title: "Pricing value map",
                    description: "A prompt flowing into buyer, value unit, and failure signal boxes.",
                  },
                },
                {
                  id: "pricing-frame-boundary",
                  title: "Set the pricing boundary",
                  teachingParagraph:
                    "The boundary keeps this subgroup focused on the first pricing decision instead of every future monetization question. That makes the lesson small enough to fit one page and specific enough to challenge.",
                  keyMoves: ["Pick the first decision.", "Exclude later packaging.", "Keep one testable claim."],
                  workedExample: "Decide the first paid tier before debating enterprise packaging.",
                  visualExample: {
                    title: "Boundary box",
                    description: "A single-page box with included pricing questions inside and deferred questions outside.",
                  },
                },
              ],
            },
            {
              id: "pricing-example",
              title: "Work an example",
              purpose: "Show pricing strategy in use.",
              subgroups: [
                {
                  id: "pricing-example-case",
                  title: "Run one pricing case",
                  teachingParagraph:
                    "The expert applies the pricing claim to one concrete buyer and one concrete use case. This shows what the strategy predicts before the learner tries to generalize it.",
                  keyMoves: ["Choose one buyer.", "Apply one price.", "Read one signal."],
                  workedExample: "A founder pays if one saved decision is worth more than the monthly price.",
                  visualExample: {
                    title: "Pricing case trace",
                    description: "A trace from buyer to price to observed willingness-to-pay signal.",
                  },
                },
                {
                  id: "pricing-example-output",
                  title: "Name the pricing output",
                  teachingParagraph:
                    "The output is a reusable pricing rule or a question that needs testing. Naming it keeps the lesson from becoming a loose paragraph.",
                  keyMoves: ["Name the rule.", "Name the risk.", "Name the next test."],
                  workedExample: "Rule: charge around the decision value; risk: the value is not frequent enough.",
                  visualExample: {
                    title: "Output card",
                    description: "A card containing the rule, the risk, and the next pricing test.",
                  },
                },
              ],
            },
            {
              id: "pricing-challenge",
              title: "Challenge pricing",
              purpose: "Test the weak point.",
              subgroups: [
                {
                  id: "pricing-challenge-risk",
                  title: "Find pricing risk",
                  teachingParagraph:
                    "A pricing expert attacks the assumption most likely to break the strategy. If buyers admire the product but do not attach budget to the moment, the strategy needs revision.",
                  keyMoves: ["Find the weak assumption.", "Name disconfirming evidence.", "Prepare revision."],
                  workedExample: "If founders will use Penny but not pay for it, pricing must move to a different value moment.",
                  visualExample: {
                    title: "Risk loop",
                    description: "A loop from price claim to buyer objection to revision rule.",
                  },
                },
                {
                  id: "pricing-challenge-next",
                  title: "Choose next pricing test",
                  teachingParagraph:
                    "The next test should be small enough to run and strong enough to change the claim. This gives Create or Verify a real target.",
                  keyMoves: ["Pick one test.", "Set a threshold.", "Connect it to the graph."],
                  workedExample: "Ask five target founders what decision they would pay to improve this month.",
                  visualExample: {
                    title: "Next test arrow",
                    description: "An arrow from pricing claim to test threshold to Check.",
                  },
                },
              ],
            },
            {
              id: "pricing-packaging",
              title: "Package pricing",
              purpose: "Keep packaging connected to the same buyer logic.",
              subgroups: [
                {
                  id: "pricing-packaging-tier",
                  title: "Name the package",
                  teachingParagraph:
                    "A package should bundle the smallest set of features that make the buyer's value moment repeatable.",
                  keyMoves: ["Name the repeated value.", "Name the bundle.", "Name the excluded feature."],
                  workedExample: "Bundle repeated decision reviews instead of generic unlimited chat.",
                  visualExample: {
                    title: "Package stack",
                    description: "A stack of included value moments.",
                  },
                },
              ],
            },
            {
              id: "pricing-evidence",
              title: "Read pricing evidence",
              purpose: "Separate compliments from willingness to pay.",
              subgroups: [
                {
                  id: "pricing-evidence-signal",
                  title: "Find the payment signal",
                  teachingParagraph:
                    "The useful evidence is not whether users like the product; it is whether the moment has budget, urgency, and repeat value.",
                  keyMoves: ["Name budget.", "Name urgency.", "Name repeat value."],
                  workedExample: "A founder asking for another review before fundraising is stronger than a nice demo reaction.",
                  visualExample: {
                    title: "Payment signal",
                    description: "Budget, urgency, and repeat value in one evidence row.",
                  },
                },
              ],
            },
            {
              id: "pricing-iterate",
              title: "Iterate pricing",
              purpose: "Use the first signal to revise the price claim.",
              subgroups: [
                {
                  id: "pricing-iterate-rule",
                  title: "Revise the rule",
                  teachingParagraph:
                    "The lesson ends by changing the pricing claim only when the evidence changes the buyer, value unit, or failure signal.",
                  keyMoves: ["Compare the signal.", "Revise the rule.", "Save the next Check target."],
                  workedExample: "If buyers pay for fundraising prep, revise around that moment instead of broad founder clarity.",
                  visualExample: {
                    title: "Revision rule",
                    description: "A price claim flowing through evidence into a revised Check target.",
                  },
                },
              ],
            },
          ],
        },
      },
    })),
  );

  assert.match(markup, /Name the pricing goal/);
  assert.match(markup, /Package pricing/);
  assert.match(markup, /Iterate pricing/);
  assert.match(markup, /An expert starts by naming what the pricing decision must accomplish/);
  assert.match(markup, /Ask Penny/);
  assert.doesNotMatch(markup, /Lesson 1 context/);
  assert.doesNotMatch(markup, /aria-label="Current lesson context"/);
  assert.doesNotMatch(markup, /Ask Penny quick actions/);
  assert.doesNotMatch(markup, /Give another example/);
  assert.doesNotMatch(markup, /What is the strongest true version/);
  assert.doesNotMatch(markup, /What should this not mean/);
  assert.doesNotMatch(markup, /What twist changes the answer/);
  assert.doesNotMatch(markup, /What would a strong answer look like/);
  assert.doesNotMatch(markup, /What would a weak answer look like/);
  assert.match(markup, /Name the buyer/);
  assert.match(markup, /Name the value unit/);
  assert.match(markup, /Name the failure signal/);
  assert.doesNotMatch(markup, /MISCONCEPTIONS/);
  assert.doesNotMatch(markup, /A pricing expert teaching/);
  assert.match(markup, /AI lesson output/);
  assert.match(markup, /Visual/);
  assert.match(markup, /Pricing value map/);
});

test("LearnWorkspace keeps backend V2 pages as single visible steps", () => {
  const markup = renderToStaticMarkup(
    createElement(LearnWorkspace, learnWorkspaceProps({
      data: {
        source: { kind: "raw_idea", rawText: "Teach me multiplication." },
        learn: {
          sessionV2: {
            version: "learn_session_v2",
            goal: "Understand multiplication.",
            sourceOfTruth: "ai_generated_learn_pages_validated_locally",
            visualTypes: ["diagram"],
            pages: [
              {
                id: "multiplication-groups",
                lessonNumber: 1,
                title: "Equal groups",
                explanation: "Multiplication counts equal-size groups.",
                visual: {
                  type: "diagram",
                  title: "Groups diagram",
                  description: "Three groups with four dots each.",
                  body: "3 groups -> 4 in each -> 12 total",
                  items: [
                    { label: "Groups", text: "3 groups" },
                    { label: "Size", text: "4 in each" },
                    { label: "Total", text: "12 total" },
                  ],
                },
                quickCheck: "What is 3 groups of 4?",
                takeaway: "Multiplication is repeated equal grouping.",
                sourceSpans: [{ sourceId: "source.raw_idea", label: "Source idea", text: "Teach me multiplication." }],
              },
            ],
          },
        },
      },
    })),
  );

  assert.match(markup, /Equal groups/);
  assert.match(markup, /LESSON 1 \/ 1/);
  assert.match(markup, /AI lesson output/);
  assert.match(markup, /Groups diagram/);
  assert.match(markup, /What is 3 groups of 4/);
  assert.match(markup, /Multiplication is repeated equal grouping/);
  assert.doesNotMatch(markup, /1\.2/);
  assert.doesNotMatch(markup, /1\.3/);
  assert.doesNotMatch(markup, /Work an example/);
  assert.doesNotMatch(markup, /Check understanding/);
});

test("LearnWorkspace prefers AI-generated V2 pages over planning scaffold", () => {
  const markup = renderToStaticMarkup(
    createElement(LearnWorkspace, learnWorkspaceProps({
      data: {
        source: { kind: "raw_idea", rawText: "Teach me multiplication." },
        learn: {
          learningPlan: {
            expertRole: "A generic planner.",
            goal: "Plan the lesson.",
            paragraphFit: "one_subgroup_per_page",
            groups: [
              {
                id: "generic-plan",
                title: "Understand the target",
                purpose: "Planning scaffold.",
                subgroups: [
                  {
                    id: "generic-plan-end-state",
                    title: "Name the end state",
                    teachingParagraph: "This is planning text that should not be the visible lesson.",
                    teachingSections: [
                      { title: "Definition", body: "Planning definition." },
                      { title: "Application", body: "Planning application." },
                      { title: "Procedure", body: "Planning procedure." },
                    ],
                    keyMoves: ["Planning move."],
                    workedExample: "Planning example.",
                    visualExample: {
                      title: "Planning visual",
                      description: "Planning visual description.",
                    },
                  },
                ],
              },
            ],
          },
          sessionV2: {
            version: "learn_session_v2",
            goal: "Understand multiplication as equal groups.",
            sourceOfTruth: "ai_generated_learn_pages_validated_locally",
            visualTypes: ["diagram"],
            pages: [
              {
                id: "ai-equal-groups",
                lessonNumber: 1,
                title: "AI equal groups",
                explanation: "The AI lesson says multiplication means counting equal groups.",
                visual: {
                  type: "diagram",
                  title: "AI grouping diagram",
                  description: "Groups, size, and total.",
                  body: "groups -> size -> total",
                },
                quickCheck: "Use 2 groups of 5.",
                takeaway: "Equal groups make multiplication inspectable.",
                sourceSpans: [{ sourceId: "source.raw_idea", label: "Source idea", text: "Teach me multiplication." }],
              },
            ],
          },
        },
      },
    })),
  );

  assert.match(markup, /AI equal groups/);
  assert.match(markup, /The AI lesson says multiplication means counting equal groups/);
  assert.match(markup, /AI grouping diagram/);
  assert.doesNotMatch(markup, /Name the end state/);
  assert.doesNotMatch(markup, /Planning definition/);
  assert.doesNotMatch(markup, /Planning visual/);
});

test("LearnWorkspace exposes the whole learning path around the active step", () => {
  const steps = Array.from({ length: 8 }, (_, index) => ({
    id: `step-${index + 1}`,
    title: `Step ${index + 1}`,
    expanded: false,
    substeps: [],
  }));

  assert.deepEqual(
    visibleLearningPathSteps(steps, "step-6").map((item) => [item.index + 1, item.step.title]),
    [
      [1, "Step 1"],
      [2, "Step 2"],
      [3, "Step 3"],
      [4, "Step 4"],
      [5, "Step 5"],
      [6, "Step 6"],
      [7, "Step 7"],
      [8, "Step 8"],
    ],
  );

  assert.deepEqual(
    visibleLearningPathSteps(steps, "step-2").map((item) => [item.index + 1, item.step.title]),
    [
      [1, "Step 1"],
      [2, "Step 2"],
      [3, "Step 3"],
      [4, "Step 4"],
      [5, "Step 5"],
      [6, "Step 6"],
      [7, "Step 7"],
      [8, "Step 8"],
    ],
  );
});

test("Ask Penny context stays inside the active main learning category", () => {
  const stepOneLesson = lesson("Name the program", "Frame what YC is", ["name YC", "separate program from investors"], "YC is an accelerator.");
  const stepTwoLesson = lesson("Read people signal", "Understand the people signal", ["founder learning rate"], "People signal means founder evidence.");
  const pageData = {
    goal: "Understand YC.",
    progressPercent: 0,
    steps: [
      {
        id: "group-1",
        title: "Frame what YC is",
        expanded: true,
        substeps: [{ id: "group-1-subgroup-1", title: stepOneLesson.title, isActive: true, lesson: stepOneLesson }],
      },
      {
        id: "group-2",
        title: "Understand the people signal",
        expanded: false,
        substeps: [{ id: "group-2-subgroup-1", title: stepTwoLesson.title, isActive: false, lesson: stepTwoLesson }],
      },
    ],
    currentStep: stepOneLesson,
    askPenny: { suggestedQuestions: [], placeholder: "Ask..." },
  };

  const firstContext = askPennyContextForStep(pageData, pageData.steps[0], stepOneLesson, "YC application guide source text");
  const secondContext = askPennyContextForStep(pageData, pageData.steps[1], stepTwoLesson, "YC application guide source text");

  assert.match(firstContext, /Current category: Frame what YC is/);
  assert.match(firstContext, /name YC/);
  assert.doesNotMatch(firstContext, /founder learning rate/);
  assert.match(secondContext, /Current category: Understand the people signal/);
  assert.match(secondContext, /founder learning rate/);
  assert.doesNotMatch(secondContext, /separate program from investors/);
});

function learnWorkspaceProps(overrides: Record<string, unknown> = {}) {
  return {
    documentsData: null,
    selectedDocument: null,
    documents: [],
    data: null,
    autopilot: null,
    recents: [],
    focusedClaimId: null,
    focusNode: null,
    relatedBrainSearch: null,
    status: "Ready",
    isThinking: false,
    async onLearnSeed() {},
    async onSeed() {},
    async onKeepRecent() {},
    onSelectDocument() {},
    onOpenBrain() {},
    onOpenCanvas() {},
    onOpenCheck() {},
    onOpenVerify() {},
    async onSearchBrainRelated() {
      return { available: false, results: [], meta: { query: "", resultCount: 0 } };
    },
    ...overrides,
  };
}

function lesson(title: string, parentTitle: string, bullets: string[], exampleLine: string) {
  return {
    stepNumber: 1,
    totalSteps: 2,
    substepNumber: 1,
    totalSubsteps: 1,
    title,
    parentTitle,
    learningGoal: `Learn ${title}.`,
    shortExplanation: `${title} explanation.`,
    visual: {
      type: "diagram" as const,
      title: `${title} visual`,
      description: `${title} visual description.`,
      body: bullets.join(" -> ") || exampleLine,
      items: bullets.map((bullet, index) => ({ label: `Step ${index + 1}`, text: bullet })),
    },
    quickCheck: `Apply ${title} to the current source.`,
    takeaway: `${title} takeaway.`,
    sourceSpans: [{ sourceId: "source.raw_idea", label: "Source idea", text: exampleLine }],
    teachingSections: [
      { title: "Definition", body: bullets[0] ?? `${title} definition.` },
      { title: "Application", body: bullets[1] ?? `${title} application.` },
      { title: "Procedure", body: bullets[2] ?? `${title} procedure.` },
    ],
    misconceptions: [`${title} misconception.`],
    coreIdea: { bullets },
    example: {
      title: `${title} example`,
      description: exampleLine,
      lines: [exampleLine],
      whyThisMatters: `${parentTitle} purpose.`,
      format: "business" as const,
    },
    nextStepTitle: "Next",
  };
}
