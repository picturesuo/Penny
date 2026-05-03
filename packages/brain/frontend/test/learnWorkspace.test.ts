import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LearnWorkspace } from "../src/components/LearnWorkspace";

test("LearnWorkspace first screen opens directly to the lesson view", () => {
  const markup = renderToStaticMarkup(
    createElement(LearnWorkspace, learnWorkspaceProps()),
  );

  assert.match(markup, /LEARNING PATH/);
  assert.match(markup, /January 1/);
  assert.match(markup, /what YC does/i);
  assert.match(markup, /investors, ideas, or people/i);
  assert.match(markup, /Frame what YC is/);
  assert.match(markup, /YOUR GOAL/);
  assert.match(markup, /BIG PICTURE/);
  assert.match(markup, /ZOOM IN/);
  assert.match(markup, /ASK PENNY/);
  assert.match(markup, /1\.1/);
  assert.match(markup, /1\.2/);
  assert.match(markup, /1\.3/);
  assert.match(markup, /Enter forward \/ Esc back/);
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
  assert.match(markup, /Name the buyer/);
  assert.match(markup, /Package pricing/);
  assert.match(markup, /Iterate pricing/);
  assert.match(markup, />6</);
  assert.doesNotMatch(markup, /A pricing expert teaching/);
  assert.doesNotMatch(markup, /Pricing value map/);
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
