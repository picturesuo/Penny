import assert from "node:assert/strict";
import test from "node:test";
import { LearnRecipeOutputSchema, buildLearningPlanPrompt, buildLearningPlanSystemPrompt, runLearnRecipe } from "./learn-recipe.ts";

test("Learn plan prompts preserve researched learning lenses and public-figure guardrails", () => {
  const system = buildLearningPlanSystemPrompt();
  const prompt = buildLearningPlanPrompt({
    rawIdea: "Teach me AI engineering from scratch like a first-principles operator.",
    keyInsight: "The learner needs primitives, traces, tests, and an artifact.",
    claims: [{ kind: "concept", text: "AI engineering is learned from primitives." }],
    learnCandidates: [{ term: "AI engineering" }],
    explorationPaths: [{ title: "Tiny agent loop", prompt: "Trace prompt -> model -> tool -> observation." }],
    sourceContext: null,
  });

  assert.match(system, /primitive -> trace -> test -> artifact/i);
  assert.match(system, /do not impersonate/i);
  assert.match(prompt, /learningBlueprint/);
  assert.match(prompt, /from-scratch builder/);
  assert.match(prompt, /public mental model or principles/i);
});

test("LearnRecipe structures recipe steps and keeps web search hidden behind SearchDecisionService", async () => {
  const output = await runLearnRecipe({
    rawIdea: "Penny should help founders learn if recent AI agent pricing changes their onboarding strategy.",
    seedPayload: {
      session: { id: uuidAt(100) },
      source: {
        id: uuidAt(101),
        rawText: "Penny should help founders learn if recent AI agent pricing changes their onboarding strategy.",
      },
      ideaMap: {
        keyInsight: "Pricing changes may alter the onboarding bet.",
        claims: [
          { id: uuidAt(201), kind: "belief", text: "Penny should guide onboarding strategy." },
          { id: uuidAt(202), kind: "assumption", text: "Recent AI agent pricing changes matter for onboarding." },
          { id: uuidAt(203), kind: "question", text: "Which pricing change affects the first session?" },
          { id: uuidAt(204), kind: "concept", text: "Onboarding strategy is a learning concept here." },
        ],
      },
      learnCandidates: [{ term: "onboarding strategy", claimId: uuidAt(204) }],
      explorationPaths: [
        { title: "Pricing pressure", prompt: "Which price point changes willingness to try Penny?" },
        { title: "First-session promise", prompt: "What should the first session prove?" },
      ],
    },
    nextMoves: [
      {
        action: "learn",
        label: "Learn onboarding strategy",
        reason: "Clarify the concept before changing the idea.",
        targetClaimId: uuidAt(204),
      },
      {
        action: "check",
        label: "Check the pricing assumption",
        reason: "Pressure-test the riskiest assumption.",
        targetClaimId: uuidAt(202),
      },
      {
        action: "verify",
        label: "Verify pricing",
        reason: "Ground the current pricing claim.",
        targetClaimId: uuidAt(202),
      },
      {
        action: "save_to_brain",
        label: "Save to Brain",
        reason: "Keep the structured idea.",
        targetClaimId: uuidAt(201),
      },
    ],
  });

  assert.equal(LearnRecipeOutputSchema.safeParse(output).success, true);
  assert.equal(output.recipe.recipeId, "learn_recipe");
  assert.deepEqual(
    output.recipe.steps.map((step) => step.step),
    [
      "structure_idea",
      "retrieve_brain_context",
      "search_decide",
      "generate_learning_material",
      "produce_next_moves",
    ],
  );
  assert.equal(output.brainContext.claimCount, 4);
  assert.equal(output.brainContext.assumptionCount, 1);
  assert.equal(output.searchDecision.mode, "learn");
  assert.equal(output.searchDecision.useWebSearch, true);
  assert.equal(output.learningPlan.paragraphFit, "one_subgroup_per_page");
  assert.match(output.learningPlan.expertRole, /expert|instructor/i);
  assert.ok(output.learningPlan.groups.length >= 5);
  assert.ok(output.learningPlan.groups.every((group) => group.subgroups.length >= 3));
  assert.match(output.learningPlan.groups[0]?.subgroups[0]?.teachingParagraph ?? "", /goal|mastery|understand/i);
  assert.match(output.learningPlan.groups[0]?.subgroups[0]?.oneLineGoal ?? "", /subsection/i);
  assert.equal(output.learningPlan.groups[0]?.subgroups[0]?.teachingSections.length, 3);
  assert.ok((output.learningPlan.groups[0]?.subgroups[0]?.misconceptions.length ?? 0) >= 1);
  assert.match(output.learningPlan.groups[2]?.subgroups[0]?.visualExample.description ?? "", /prompt|case|question/i);
  assert.match(output.recipe.steps[2]?.summary ?? "", /SearchDecisionService/);
  assert.deepEqual(output.recipe.steps[4]?.outputs, [
    "Learn: Learn onboarding strategy",
    "Check: Check the pricing assumption",
    "Verify: Verify pricing",
    "Save: Save to Brain",
  ]);
  assert.match(output.recipe.steps[4]?.summary ?? "", /Recommended Check next/);
});

test("LearnRecipe honors the Learn web sources toggle as an explicit search request", async () => {
  const baseInput = {
    rawIdea: "Teach me how to choose a startup name.",
    seedPayload: {
      session: { id: uuidAt(250) },
      source: {
        id: uuidAt(251),
        rawText: "Teach me how to choose a startup name.",
      },
      ideaMap: {
        keyInsight: "A startup name should make the project easier to understand and remember.",
        claims: [
          { id: uuidAt(252), kind: "belief" as const, text: "A startup name should communicate the product clearly." },
          { id: uuidAt(253), kind: "concept" as const, text: "Naming strategy is the concept to learn." },
        ],
      },
      learnCandidates: [{ term: "naming strategy", claimId: uuidAt(253) }],
      explorationPaths: [{ title: "Name test", prompt: "Try the name on a real user." }],
    },
    nextMoves: [],
  };

  const brainOnly = await runLearnRecipe(baseInput);
  const withWebSources = await runLearnRecipe({ ...baseInput, forceWebSearch: true });

  assert.equal(brainOnly.searchDecision.useWebSearch, false);
  assert.equal(withWebSources.searchDecision.useWebSearch, true);
  assert.ok(withWebSources.searchDecision.reasonCodes.includes("user_explicitly_asks"));
  assert.equal(withWebSources.searchDecision.query, "Teach me how to choose a startup name.");
});

test("LearnRecipe makes the YC demo idea read like a useful thinking recipe", async () => {
  const output = await runLearnRecipe({
    rawIdea: ycDemoIdea,
    seedPayload: {
      session: { id: uuidAt(300) },
      source: {
        id: uuidAt(301),
        rawText: ycDemoIdea,
      },
      ideaMap: {
        keyInsight:
          "The load-bearing bet is not generation; it is making creative thinking inspectable, challengeable, and source-grounded without losing speed.",
        claims: [
          { id: uuidAt(401), kind: "belief", text: ycDemoIdea },
          {
            id: uuidAt(402),
            kind: "assumption",
            text: "Penny can evoke better creative starting points more consistently than an open-ended chat or blank document.",
          },
          {
            id: uuidAt(403),
            kind: "assumption",
            text: "Penny can turn that creative spark into claims, assumptions, checks, and sources without slowing the user down.",
          },
          {
            id: uuidAt(404),
            kind: "question",
            text: "What observable first-session signal proves Penny is more efficient?",
          },
          {
            id: uuidAt(405),
            kind: "concept",
            text: "Source-grounded thinking keeps a visible path back to evidence, assumptions, or user-provided context.",
          },
        ],
      },
      learnCandidates: [
        { term: "source-grounded thinking", claimId: uuidAt(405) },
        { term: "structured creativity", claimId: uuidAt(402) },
      ],
      explorationPaths: [
        { title: "Define efficiency", prompt: "What proves Penny is faster and better?" },
        { title: "Name the mechanism", prompt: "Where does creativity actually come from?" },
        { title: "Source threshold", prompt: "Which claims need Verify?" },
      ],
    },
    nextMoves: [
      {
        action: "learn",
        label: "Learn source-grounded thinking",
        reason: "Clarify the promise before presenting it.",
        targetClaimId: uuidAt(405),
      },
      {
        action: "check",
        label: "Check the creativity mechanism",
        reason: "The idea depends on Penny being better than a strong chat prompt.",
        targetClaimId: uuidAt(402),
      },
      {
        action: "verify",
        label: "Verify efficiency claim",
        reason: "The comparative efficiency claim needs evidence before it becomes stable.",
        targetClaimId: uuidAt(401),
      },
      {
        action: "save_to_brain",
        label: "Save demo idea",
        reason: "Save after the weakest assumption has been checked.",
        targetClaimId: uuidAt(401),
      },
    ],
  });

  assert.equal(LearnRecipeOutputSchema.safeParse(output).success, true);
  assert.match(output.learningPlan.expertRole, /startup|expert/i);
  assert.match(output.learningPlan.groups[3]?.title ?? "", /Check the work/i);
  assert.match(output.recipe.steps[0]?.summary ?? "", /load-bearing assumption/i);
  assert.match(output.recipe.steps[3]?.summary ?? "", /inspectable, challengeable, and source-grounded/i);
  assert.deepEqual(output.recipe.steps[4]?.outputs, [
    "Learn: Learn source-grounded thinking",
    "Check: Check the creativity mechanism",
    "Verify: Verify efficiency claim",
    "Save: Save demo idea",
  ]);
  assert.match(output.recipe.steps[4]?.summary ?? "", /Recommended Check next/);
});

const ycDemoIdea =
  "Penny is the most consistently efficient way to evoke creativity and turn it into structured, source-grounded thinking.";

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}
