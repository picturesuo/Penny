import { z } from "zod";
import { RecipeEngine, RecipeTraceSchema, type RecipeTrace } from "./recipe-engine.ts";
import { shouldUseWebSearch, type SearchDecision } from "./search-decision-service.ts";
import type { EntityId } from "./domain/types.ts";

const LearnRecipeStepNameSchema = z.enum([
  "structure_idea",
  "retrieve_brain_context",
  "search_decide",
  "generate_learning_material",
  "produce_next_moves",
]);

export const LearnRecipeOutputSchema = z
  .object({
    recipe: RecipeTraceSchema.extend({
      recipeId: z.literal("learn_recipe"),
      steps: z
        .array(
          RecipeTraceSchema.shape.steps.element.extend({
            step: LearnRecipeStepNameSchema,
          }),
        )
        .length(5),
    }),
    searchDecision: z.object({
      mode: z.literal("learn"),
      useWebSearch: z.boolean(),
      depth: z.enum(["fast", "deep"]),
      reason: z.string(),
      reasonCodes: z.array(z.string()),
      signals: z.array(z.string()),
      query: z.string(),
      filters: z.record(z.string(), z.unknown()),
    }),
    brainContext: z.object({
      sessionId: z.string().uuid(),
      sourceId: z.string().uuid(),
      claimCount: z.number().int().min(0),
      assumptionCount: z.number().int().min(0),
      questionCount: z.number().int().min(0),
      conceptCount: z.number().int().min(0),
    }),
  })
  .strict();

export type LearnRecipeOutput = z.infer<typeof LearnRecipeOutputSchema>;
export type LearnRecipeStepName = z.infer<typeof LearnRecipeStepNameSchema>;

export type LearnRecipeInput = {
  rawIdea: string;
  seedPayload: LearnRecipeSeedPayload;
  nextMoves: ReadonlyArray<LearnRecipeNextMove>;
};

export type LearnRecipeSeedPayload = {
  session: {
    id: string;
  };
  source: {
    id: string;
    rawText: string;
  };
  ideaMap: {
    keyInsight: string;
    claims: ReadonlyArray<{
      id: EntityId;
      kind: "belief" | "assumption" | "question" | "concept";
      text: string;
    }>;
  };
  learnCandidates: ReadonlyArray<{
    term: string;
    claimId: EntityId;
  }>;
  explorationPaths: ReadonlyArray<{
    title: string;
    prompt: string;
  }>;
};

export type LearnRecipeNextMove = {
  action: "learn" | "check" | "verify" | "save_to_brain";
  label: string;
  reason: string;
  targetClaimId: EntityId | null;
};

type LearnRecipeContext = {
  rawIdea: string;
  seedPayload: LearnRecipeSeedPayload;
  nextMoves: ReadonlyArray<LearnRecipeNextMove>;
  brainContext?: LearnRecipeOutput["brainContext"];
  searchDecision?: SearchDecision;
};

export async function runLearnRecipe(input: LearnRecipeInput): Promise<LearnRecipeOutput> {
  const engine = new RecipeEngine<LearnRecipeContext>("learn_recipe", [
    {
      step: "structure_idea",
      title: "Structure idea",
      run(context) {
        const claims = context.seedPayload.ideaMap.claims;
        const assumptions = claims.filter((claim) => claim.kind === "assumption");

        return {
          summary: "Structured the seed idea into stable claims, assumptions, questions, concepts, and exploration paths.",
          inputs: [context.rawIdea],
          outputs: [
            `${claims.length} claims`,
            `${assumptions.length} assumptions`,
            `${context.seedPayload.explorationPaths.length} exploration paths`,
          ],
        };
      },
    },
    {
      step: "retrieve_brain_context",
      title: "Retrieve Brain context",
      run(context) {
        const claims = context.seedPayload.ideaMap.claims;
        const brainContext = {
          sessionId: context.seedPayload.session.id,
          sourceId: context.seedPayload.source.id,
          claimCount: claims.length,
          assumptionCount: claims.filter((claim) => claim.kind === "assumption").length,
          questionCount: claims.filter((claim) => claim.kind === "question").length,
          conceptCount: claims.filter((claim) => claim.kind === "concept").length,
        };

        return {
          summary: "Read the saved Brain slice created for this Learn run instead of inventing frontend-only graph state.",
          inputs: [context.seedPayload.session.id, context.seedPayload.source.id],
          outputs: [
            `${brainContext.claimCount} claims`,
            `${brainContext.assumptionCount} assumptions`,
            `${brainContext.conceptCount} concepts`,
          ],
          context: { brainContext },
        };
      },
    },
    {
      step: "search_decide",
      title: "Decide web search",
      run(context) {
        const brainText = [
          context.seedPayload.ideaMap.keyInsight,
          ...context.seedPayload.ideaMap.claims.map((claim) => claim.text),
          ...context.seedPayload.learnCandidates.map((candidate) => candidate.term),
        ].join("\n");
        const searchDecision = shouldUseWebSearch(
          {
            query: context.rawIdea,
            text: context.rawIdea,
            userRequest: context.rawIdea,
          },
          "learn",
          {
            brainContext: brainText,
            brainContextSufficient: true,
            knownBrainEntities: context.seedPayload.learnCandidates.map((candidate) => candidate.term),
          },
        );

        return {
          status: searchDecision.useWebSearch ? "completed" : "skipped",
          summary: searchDecision.useWebSearch
            ? "SearchDecisionService marked this Learn run as needing external context."
            : "SearchDecisionService found the saved Brain context sufficient for Learn.",
          inputs: [searchDecision.query],
          outputs: [searchDecision.reason, ...searchDecision.reasonCodes],
          context: { searchDecision },
        };
      },
    },
    {
      step: "generate_learning_material",
      title: "Generate learning material",
      run(context) {
        const claims = context.seedPayload.ideaMap.claims;
        const concepts = context.seedPayload.learnCandidates;
        const questions = claims.filter((claim) => claim.kind === "question");

        return {
          summary: "Produced the Learn-facing claims, assumptions, questions, contextual concepts, and creative directions.",
          inputs: [context.seedPayload.ideaMap.keyInsight],
          outputs: [
            `${claims.length} claims`,
            `${questions.length} questions`,
            `${concepts.length} concepts`,
            `${context.seedPayload.explorationPaths.length} creative directions`,
          ],
        };
      },
    },
    {
      step: "produce_next_moves",
      title: "Produce next moves",
      run(context) {
        return {
          summary: "Reduced the recipe output to the four UI-safe moves Penny already exposes.",
          inputs: context.nextMoves.map((move) => move.reason),
          outputs: context.nextMoves.map((move) => move.action),
        };
      },
    },
  ]);
  const result = await engine.run({
    rawIdea: input.rawIdea,
    seedPayload: input.seedPayload,
    nextMoves: input.nextMoves,
  });

  return LearnRecipeOutputSchema.parse({
    recipe: result.trace,
    searchDecision: result.context.searchDecision,
    brainContext: result.context.brainContext,
  });
}

export function learnRecipeTraceForBrainRun(output: LearnRecipeOutput): RecipeTrace {
  return output.recipe;
}
