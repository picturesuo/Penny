import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LearnWorkspace, askPennyContextForStep, visibleLearningPathSteps } from "../src/components/LearnWorkspace";

test("LearnWorkspace first screen opens directly to the lesson view", () => {
  const markup = renderToStaticMarkup(
    createElement(LearnWorkspace, learnWorkspaceProps()),
  );

  assert.match(markup, /Name the program/);
  assert.match(markup, /YC is a three-month startup accelerator/);
  assert.match(markup, /Ask Penny/);
  assert.match(markup, /LEARNING PATH/);
  assert.match(markup, /STEP 1\.1 OF 15/);
  assert.match(markup, /STRUCTURE/);
  assert.match(markup, /Fill in the check/);
  assert.match(markup, /Positive/);
  assert.match(markup, /Negative/);
  assert.match(markup, /Curve/);
  assert.match(markup, /Good example/);
  assert.match(markup, /Bad example/);
  assert.match(markup, /Draft 1/);
  assert.match(markup, /\+ Tab/);
  assert.match(markup, /Final typed answer/);
  assert.match(markup, /Type this part/);
  assert.match(markup, /Esc/);
  assert.match(markup, /Enter/);
  assert.doesNotMatch(markup, /Enter forward \/ Esc back/);
  assert.doesNotMatch(markup, /Definition/);
  assert.doesNotMatch(markup, /Application/);
  assert.doesNotMatch(markup, /Procedure/);
  assert.doesNotMatch(markup, /ANSWER/);
  assert.doesNotMatch(markup, /WRITE THIS DOWN/);
  assert.doesNotMatch(markup, /MISCONCEPTIONS/);
  assert.doesNotMatch(markup, /EXAMPLE/);
  assert.match(markup, /Thinking graph/);
  assert.doesNotMatch(markup, /Use &quot;Name the program&quot; to answer what YC would actually evaluate/);
  assert.doesNotMatch(markup, /Do not treat investor interest as stronger than founder proof/);
  assert.doesNotMatch(markup, /What shall we think through/);
  assert.doesNotMatch(markup, /Save to Brain/);
  assert.doesNotMatch(markup, /Have I thought about this before/);
  assert.doesNotMatch(markup, /USED YOUR BRAIN/);
  assert.doesNotMatch(markup, /Can you explain this in simpler terms/);
  assert.doesNotMatch(markup, /Give me another example/);
  assert.doesNotMatch(markup, /Search\/Settings|Settings|Makes Cents|MAKES CENTS/);
  assert.doesNotMatch(markup, /FULLY FLESHED-OUT EXAMPLE/);
  assert.doesNotMatch(markup, /Visual placeholder/);
  assert.doesNotMatch(markup, /NOTE/);
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
                    "The next test should be small enough to run and strong enough to change the claim. This gives Check or Verify a real target.",
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
  assert.match(markup, /Name the buyer/);
  assert.match(markup, /What is the strongest true version/);
  assert.match(markup, /What should this not mean/);
  assert.match(markup, /What twist changes the answer/);
  assert.match(markup, /What would a strong answer look like/);
  assert.match(markup, /What would a weak answer look like/);
  assert.doesNotMatch(markup, /Definition/);
  assert.doesNotMatch(markup, /MISCONCEPTIONS/);
  assert.doesNotMatch(markup, /A pricing expert teaching/);
  assert.doesNotMatch(markup, /Pricing value map/);
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
    data: null,
    autopilot: null,
    recents: [],
    focusedClaimId: null,
    focusNode: null,
    relatedBrainSearch: null,
    status: "Ready",
    isThinking: false,
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
