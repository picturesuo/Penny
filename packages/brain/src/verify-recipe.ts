import { z } from "zod";
import { recipeTraceFromSteps, RecipeTraceSchema } from "./recipe-engine.ts";

const VerifyRecipeStepNameSchema = z.enum([
  "decompose_claim",
  "search_gather",
  "evaluate_evidence",
  "synthesize_verdict",
  "suggest_confidence_change",
]);

export const VerifyRecipeTraceOutputSchema = z
  .object({
    recipeTrace: RecipeTraceSchema.extend({
      recipeId: z.literal("verify_recipe"),
      steps: z
        .array(
          RecipeTraceSchema.shape.steps.element.extend({
            step: VerifyRecipeStepNameSchema,
          }),
        )
        .length(5),
    }),
  })
  .strict();

export type VerifyRecipeStepName = z.infer<typeof VerifyRecipeStepNameSchema>;
export type VerifyRecipeTraceOutput = z.infer<typeof VerifyRecipeTraceOutputSchema>;

export type VerifyRecipeLike = {
  steps: ReadonlyArray<{
    step: VerifyRecipeStepName;
    title: string;
    status: "completed" | "limited" | "skipped";
    summary: string;
    inputs: ReadonlyArray<string>;
    outputs: ReadonlyArray<string>;
  }>;
};

export function runVerifyRecipeTrace(recipe: VerifyRecipeLike): VerifyRecipeTraceOutput {
  return VerifyRecipeTraceOutputSchema.parse({
    recipeTrace: recipeTraceFromSteps(
      "verify_recipe",
      recipe.steps.map((step) => ({
        step: step.step,
        title: step.title,
        status: step.status,
        summary: step.summary,
        inputs: [...step.inputs],
        outputs: [...step.outputs],
      })),
    ),
  });
}

export function verifyRecipeTraceForBrainRun(recipe: VerifyRecipeLike): VerifyRecipeTraceOutput["recipeTrace"] {
  return runVerifyRecipeTrace(recipe).recipeTrace;
}
