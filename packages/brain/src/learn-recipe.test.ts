import assert from "node:assert/strict";
import test from "node:test";
import { LearnRecipeOutputSchema, runLearnRecipe } from "./learn-recipe.ts";

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
  assert.match(output.recipe.steps[2]?.summary ?? "", /SearchDecisionService/);
  assert.deepEqual(output.recipe.steps[4]?.outputs, ["learn", "check", "verify", "save_to_brain"]);
});

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}
