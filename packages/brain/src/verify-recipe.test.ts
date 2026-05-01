import assert from "node:assert/strict";
import test from "node:test";
import { VerifyRecipeTraceOutputSchema, runVerifyRecipeTrace } from "./verify-recipe.ts";

test("VerifyRecipe converts the verifier recipe into a persisted step trace", () => {
  const output = runVerifyRecipeTrace({
    steps: [
      {
        step: "decompose_claim",
        title: "Decompose claim",
        status: "completed",
        summary: "Split the claim into testable parts.",
        inputs: ["Founders will pay $200/month."],
        outputs: ["Target assertion", "Evidence need"],
      },
      {
        step: "search_gather",
        title: "Search and gather",
        status: "completed",
        summary: "Gathered source-backed pricing evidence.",
        inputs: ["verify_source_grounding"],
        outputs: ["1 citation-backed evidence card"],
      },
      {
        step: "evaluate_evidence",
        title: "Evaluate evidence",
        status: "completed",
        summary: "Compared the citation to the claim.",
        inputs: ["Pricing survey"],
        outputs: ["mixed"],
      },
      {
        step: "synthesize_verdict",
        title: "Synthesize verdict",
        status: "completed",
        summary: "Combined the evidence into a mixed verdict.",
        inputs: ["mixed"],
        outputs: ["mixed"],
      },
      {
        step: "suggest_confidence_change",
        title: "Suggest confidence change",
        status: "completed",
        summary: "Suggested lowering confidence by five points.",
        inputs: ["mixed"],
        outputs: ["delta -5"],
      },
    ],
  });

  assert.equal(VerifyRecipeTraceOutputSchema.safeParse(output).success, true);
  assert.equal(output.recipeTrace.recipeId, "verify_recipe");
  assert.equal(output.recipeTrace.status, "completed");
  assert.deepEqual(
    output.recipeTrace.steps.map((step) => step.step),
    [
      "decompose_claim",
      "search_gather",
      "evaluate_evidence",
      "synthesize_verdict",
      "suggest_confidence_change",
    ],
  );
  assert.equal(output.recipeTrace.steps[1]?.outputs[0], "1 citation-backed evidence card");
});
