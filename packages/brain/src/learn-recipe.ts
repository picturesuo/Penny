import { z } from "zod";
import { RecipeEngine, RecipeTraceSchema, type RecipeTrace } from "./recipe-engine.ts";
import { shouldUseWebSearch, type SearchDecision } from "./search-decision-service.ts";
import type { EntityId } from "./domain/types.ts";
import { LearningPlanSchema, buildExpertLearningPlan, type LearningSourceContext } from "./learn-plan.ts";

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
    sourceContext: z
      .object({
        kind: z.enum(["text", "pdf", "slides", "document"]),
        fileName: z.string().nullable(),
        mainIdea: z.string(),
        clusters: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            summary: z.string(),
            sourceRange: z.string(),
          }),
        ),
      })
      .nullable(),
    learningPlan: LearningPlanSchema,
  })
  .strict();

export type LearnRecipeOutput = z.infer<typeof LearnRecipeOutputSchema>;
export type LearnRecipeStepName = z.infer<typeof LearnRecipeStepNameSchema>;

export type LearnRecipeInput = {
  rawIdea: string;
  seedPayload: LearnRecipeSeedPayload;
  nextMoves: ReadonlyArray<LearnRecipeNextMove>;
  sourceContext?: LearningSourceContext | null;
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
  sourceContext?: LearningSourceContext | null;
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
        const strongestAssumption = assumptions[0]?.text ?? context.seedPayload.ideaMap.keyInsight;

        return {
          summary: `Structured the idea around its load-bearing assumption: ${clipText(strongestAssumption, 160)}`,
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
          summary: context.sourceContext
            ? `Produced a source-clustered lesson plan for ${context.sourceContext.fileName ?? context.sourceContext.kind}.`
            : `Produced an expert lesson plan with paragraph-sized subgroups centered on: ${clipText(context.seedPayload.ideaMap.keyInsight, 170)}`,
          inputs: [context.seedPayload.ideaMap.keyInsight],
          outputs: [
            clipText(claims[0]?.text ?? context.seedPayload.ideaMap.keyInsight, 180),
            ...questions.slice(0, 2).map((question) => clipText(question.text, 180)),
            ...concepts.slice(0, 2).map((concept) => `Learn: ${clipText(concept.term, 170)}`),
            `${context.seedPayload.explorationPaths.length} creative directions`,
          ],
        };
      },
    },
    {
      step: "produce_next_moves",
      title: "Produce next moves",
      run(context) {
        const recommended = recommendPrimaryNextMove(context.nextMoves);

        return {
          summary: recommended
            ? `Recommended ${nextMoveDisplayName(recommended.action)} next: ${clipText(recommended.reason, 180)}`
            : "Reduced the recipe output to the four UI-safe moves Penny already exposes.",
          inputs: context.nextMoves.map((move) => move.reason),
          outputs: context.nextMoves.map((move) => `${nextMoveDisplayName(move.action)}: ${clipText(move.label, 180)}`),
        };
      },
    },
  ]);
  const result = await engine.run({
    rawIdea: input.rawIdea,
    seedPayload: input.seedPayload,
    nextMoves: input.nextMoves,
    sourceContext: input.sourceContext ?? null,
  });

  return LearnRecipeOutputSchema.parse({
    recipe: result.trace,
    searchDecision: result.context.searchDecision,
    brainContext: result.context.brainContext,
    sourceContext: input.sourceContext ?? null,
    learningPlan: buildExpertLearningPlan({
      rawIdea: input.rawIdea,
      keyInsight: input.seedPayload.ideaMap.keyInsight,
      claims: input.seedPayload.ideaMap.claims,
      learnCandidates: input.seedPayload.learnCandidates,
      explorationPaths: input.seedPayload.explorationPaths,
      sourceContext: input.sourceContext ?? null,
    }),
  });
}

export function learnRecipeTraceForBrainRun(output: LearnRecipeOutput): RecipeTrace {
  return output.recipe;
}

function recommendPrimaryNextMove(moves: ReadonlyArray<LearnRecipeNextMove>): LearnRecipeNextMove | null {
  return (
    moves.find((move) => move.action === "check") ??
    moves.find((move) => move.action === "verify") ??
    moves.find((move) => move.action === "save_to_brain") ??
    moves[0] ??
    null
  );
}

function nextMoveDisplayName(action: LearnRecipeNextMove["action"]): string {
  switch (action) {
    case "learn":
      return "Learn";
    case "check":
      return "Check";
    case "verify":
      return "Verify";
    case "save_to_brain":
      return "Save";
  }
}

function clipText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 1).trimEnd()}.`;
}
