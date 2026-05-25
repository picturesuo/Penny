import { z } from "zod";
import { createXai } from "@ai-sdk/xai";
import { generateText, Output, type LanguageModel } from "ai";
import { RecipeEngine, RecipeTraceSchema, type RecipeTrace } from "./recipe-engine.ts";
import { shouldUseWebSearch, type SearchDecision } from "./search-decision-service.ts";
import type { EntityId } from "./domain/types.ts";
import {
  type LearningPlan,
  LearnSessionV2Schema,
  LearningPlanSchema,
  buildExpertLearningPlan,
  buildLearnSessionV2,
  learningBlueprintFor,
  type LearningSourceContext,
} from "./learn-plan.ts";

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
    learnSessionV2: LearnSessionV2Schema,
  })
  .strict();

export type LearnRecipeOutput = z.infer<typeof LearnRecipeOutputSchema>;
export type LearnRecipeStepName = z.infer<typeof LearnRecipeStepNameSchema>;

export type LearnRecipeInput = {
  rawIdea: string;
  seedPayload: LearnRecipeSeedPayload;
  nextMoves: ReadonlyArray<LearnRecipeNextMove>;
  sourceContext?: LearningSourceContext | null;
  learningPlanProvider?: LearningPlanProvider;
  forceWebSearch?: boolean;
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
  forceWebSearch?: boolean;
};

const learningPlanOutputSpec = Output.object<LearningPlan>({
  schema: LearningPlanSchema,
  name: "penny_learning_plan",
  description: "Expert-authored Learn Mode lesson plan with small, checkable subgroups that each fit one low-load screen.",
});

const AnthropicLearningPlanDraftSchema = z
  .object({
    expertRole: z.string().trim().min(12).max(160),
    goal: z.string().trim().min(12).max(260),
    lessons: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(90),
            oneLineGoal: z.string().trim().min(1).max(600),
            teachingParagraph: z.string().trim().min(1).max(1_200),
            visualTitle: z.string().trim().min(1).max(240),
            visualDescription: z.string().trim().min(1).max(800),
            keyMoves: z.array(z.string().trim().min(1).max(400)).min(1).max(6),
            misconception: z.string().trim().min(1).max(600),
            workedExample: z.string().trim().min(1).max(800),
          })
          .strict(),
      )
      .min(3)
      .max(6),
  })
  .strict();

type AnthropicLearningPlanDraft = z.infer<typeof AnthropicLearningPlanDraftSchema>;

export type LearningPlanProvider = {
  name: "anthropic" | "xai" | "heuristic";
  model: string | null;
  generate(input: LearningPlanInputForProvider): Promise<LearningPlan>;
};

type LearningPlanInputForProvider = Parameters<typeof buildExpertLearningPlan>[0];

export type LearningPlanGenerateText = (request: {
  model: LanguageModel;
  system: string;
  prompt: string;
  output: typeof learningPlanOutputSpec;
  maxRetries: number;
  providerOptions: {
    xai: {
      store: false;
    };
  };
}) => Promise<{ output: unknown }>;

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
            userRequest: context.forceWebSearch ? `Use web sources for this Learn request.\n${context.rawIdea}` : context.rawIdea,
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
    forceWebSearch: input.forceWebSearch ?? false,
  });
  const learningPlanInput = {
    rawIdea: input.rawIdea,
    keyInsight: input.seedPayload.ideaMap.keyInsight,
    claims: input.seedPayload.ideaMap.claims,
    learnCandidates: input.seedPayload.learnCandidates,
    explorationPaths: input.seedPayload.explorationPaths,
    sourceContext: input.sourceContext ?? null,
  };
  const learningPlan = await generateLearningPlan(learningPlanInput, input.learningPlanProvider);

  return LearnRecipeOutputSchema.parse({
    recipe: result.trace,
    searchDecision: result.context.searchDecision,
    brainContext: result.context.brainContext,
    sourceContext: input.sourceContext ?? null,
    learningPlan,
    learnSessionV2: buildLearnSessionV2({
      plan: learningPlan,
      sourceContext: input.sourceContext ?? null,
      rawIdea: input.rawIdea,
      keyInsight: input.seedPayload.ideaMap.keyInsight,
    }),
  });
}

export async function generateLearningPlan(
  input: LearningPlanInputForProvider,
  provider: LearningPlanProvider = createDefaultLearningPlanProvider(),
): Promise<LearningPlan> {
  try {
    return LearningPlanSchema.parse(await provider.generate(input));
  } catch (error) {
    if (provider.name === "heuristic" || !learningPlanFallbackEnabled()) {
      throw error;
    }

    return buildExpertLearningPlan(input);
  }
}

export function createDefaultLearningPlanProvider(
  env: Record<string, string | undefined> = process.env,
): LearningPlanProvider {
  if (env.ANTHROPIC_API_KEY?.trim()) {
    return createAnthropicLearningPlanProvider(env);
  }

  if (env.XAI_API_KEY?.trim()) {
    return createXaiLearningPlanProvider(env);
  }

  return createHeuristicLearningPlanProvider();
}

export function createHeuristicLearningPlanProvider(): LearningPlanProvider {
  return {
    name: "heuristic",
    model: null,
    async generate(input) {
      return buildExpertLearningPlan(input);
    },
  };
}

export function createXaiLearningPlanProvider(
  env: Record<string, string | undefined> = process.env,
  options: { generateText?: LearningPlanGenerateText } = {},
): LearningPlanProvider {
  const model = resolveXaiLearningPlanModel(env);

  return {
    name: "xai",
    model,
    async generate(input) {
      const apiKey = env.XAI_API_KEY?.trim();

      if (!apiKey) {
        throw new Error("XAI_API_KEY is required for the xAI Learn plan provider.");
      }

      const xai = createXai(createXaiSettings(apiKey, env));
      const callGenerateText = options.generateText ?? generateStructuredLearningPlan;
      const result = await callGenerateText({
        model: xai.responses(model),
        system: buildLearningPlanSystemPrompt(),
        prompt: buildLearningPlanPrompt(input),
        output: learningPlanOutputSpec,
        maxRetries: 1,
        providerOptions: {
          xai: {
            store: false,
          },
        },
      });

      return LearningPlanSchema.parse(result.output);
    },
  };
}

export function createAnthropicLearningPlanProvider(
  env: Record<string, string | undefined> = process.env,
  options: { fetch?: typeof fetch } = {},
): LearningPlanProvider {
  const model = resolveAnthropicLearningPlanModel(env);

  return {
    name: "anthropic",
    model,
    async generate(input) {
      const apiKey = env.ANTHROPIC_API_KEY?.trim();

      if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY is required for the Anthropic Learn plan provider.");
      }

      const callFetch = options.fetch ?? fetch;
      const timeoutMs = parsePositiveInteger(env.PENNY_LEARN_PLAN_TIMEOUT_MS, 25_000);
      const response = await callFetch(`${env.ANTHROPIC_BASE_URL?.trim().replace(/\/+$/, "") || "https://api.anthropic.com"}/v1/messages`, {
        method: "POST",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": env.ANTHROPIC_VERSION?.trim() || "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: parsePositiveInteger(env.PENNY_LEARN_PLAN_MAX_TOKENS, 1800),
          system: buildLearningPlanSystemPrompt(),
          messages: [
            {
              role: "user",
              content: buildAnthropicLearningDraftPrompt(input),
            },
          ],
        }),
      });
      const payload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        throw new Error(`Anthropic Learn plan request failed with ${response.status}: ${anthropicErrorMessage(payload)}`);
      }

      const draft = AnthropicLearningPlanDraftSchema.parse(extractJsonObject(anthropicText(payload)));

      return learningDraftToPlan(draft);
    },
  };
}

export function resolveXaiLearningPlanModel(env: Record<string, string | undefined> = process.env): string {
  return env.XAI_LEARN_PLAN_MODEL?.trim() || env.XAI_INLINE_LEARN_MODEL?.trim() || env.XAI_MODEL?.trim() || "grok-4.20-reasoning";
}

export function resolveAnthropicLearningPlanModel(env: Record<string, string | undefined> = process.env): string {
  return env.ANTHROPIC_LEARN_PLAN_MODEL?.trim() || env.ANTHROPIC_ASK_PENNY_MODEL?.trim() || env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-6";
}

export function buildLearningPlanSystemPrompt(): string {
  return [
    "You are Penny inside Learn Mode.",
    "Write the actual lesson material the learner should see, not a prompt, meta-instruction, or scaffold.",
    "Use the user's exact topic as the subject matter and teach it directly.",
    "Each subgroup is one low-cognitive-load screen: concise, expert, concrete, and checked before moving on.",
    "Favor short meaning -> worked move -> check progressions over long explanations.",
    "For technical topics, teach from raw primitives before frameworks: primitive -> trace -> test -> artifact.",
    "For source-backed topics, keep source honesty visible: source span -> map -> teach -> use -> evidence gap.",
    "For conceptual topics, use Socratic teach-back and misconception repair rather than passive exposition.",
    "If the user asks to learn like a famous person or operator, translate that into public principles, constraints, inversion, and checks; do not impersonate the person's private voice.",
    "Do not mention Anthropic, chat, prompts, system messages, or instructions.",
    "Return only valid JSON. Do not wrap it in markdown.",
  ].join("\n");
}

export function buildLearningPlanPrompt(input: LearningPlanInputForProvider): string {
  return [
    "Create a Penny Learn Mode learningPlan JSON object.",
    "",
    "Required shape:",
    "- expertRole: 12-160 chars.",
    "- goal: 12-260 chars.",
    "- paragraphFit: exactly \"one_subgroup_per_page\".",
    "- groups: exactly 3 groups.",
    "- each group has id, title, purpose, and 3-4 subgroups.",
    "- each subgroup has id, title, oneLineGoal, teachingParagraph, exactly 3 teachingSections, 2-4 keyMoves, 1-4 misconceptions, workedExample, and visualExample.",
    "- each teachingSection has title and body.",
    "- visualExample has title and description.",
    "- when sourceContext is provided, preserve sourceContext on relevant subgroups with clusterId, clusterTitle, localSummary, and sourceRange.",
    "",
    "Quality bar:",
    "- Teach the topic itself. Do not say what an expert would do; do it.",
    "- Make the first lesson immediately useful for the user's raw request.",
    "- Use concrete examples and checks specific to the topic.",
    "- Pick a learning lens from the input blueprint and make it visible in expertRole.",
    "- Prefer a diagnostic start, then primitive, worked trace, active recall, misconception, and saved artifact.",
    "- If a public figure is mentioned, teach the public mental model or principles, not an imitation.",
    "- Split difficult ideas into many tiny subgroups; the learner should be able to press Enter through one digestible move at a time.",
    "- Keep every field short enough for a compact UI.",
    "",
    `Input JSON: ${JSON.stringify({
      rawIdea: clipText(input.rawIdea, 500),
      keyInsight: clipText(input.keyInsight, 500),
      learningBlueprint: learningBlueprintFor(input),
      claims: input.claims.slice(0, 6).map((claim) => ({ ...claim, text: clipText(claim.text, 260) })),
      learnCandidates: input.learnCandidates.slice(0, 5),
      explorationPaths: input.explorationPaths.slice(0, 5).map((path) => ({
        title: clipText(path.title, 120),
        prompt: clipText(path.prompt, 260),
        expectedValue: path.expectedValue ? clipText(path.expectedValue, 180) : undefined,
      })),
      sourceContext: input.sourceContext ?? null,
    })}`,
  ].join("\n");
}

export function buildAnthropicLearningDraftPrompt(input: LearningPlanInputForProvider): string {
  return [
    "Create a compact Penny Learn Mode draft as valid JSON.",
    "",
    "Required JSON shape:",
    "{",
    "  \"expertRole\": string,",
    "  \"goal\": string,",
    "  \"lessons\": [3-6 short objects with title, oneLineGoal, teachingParagraph, visualTitle, visualDescription, keyMoves, misconception, workedExample]",
    "}",
    "",
    "Rules:",
    "- Teach the user's topic directly. Do not describe how to teach it.",
    "- For math or concrete procedures, work the user's actual numbers or example.",
    "- Keep each teachingParagraph under 120 words.",
    "- Make each lesson small enough to expand into meaning, worked move, and check screens.",
    "- Use the learningBlueprint to choose the expert lens and output artifact.",
    "- For public figures/operators, use public principles and decision tests without imitating their private voice.",
    "- Return only JSON. No markdown.",
    "",
    `Input JSON: ${JSON.stringify(compactLearningPlanInput(input))}`,
  ].join("\n");
}

function compactLearningPlanInput(input: LearningPlanInputForProvider) {
  return {
    rawIdea: clipText(input.rawIdea, 500),
    keyInsight: clipText(input.keyInsight, 500),
    learningBlueprint: learningBlueprintFor(input),
    claims: input.claims.slice(0, 6).map((claim) => ({ ...claim, text: clipText(claim.text, 260) })),
    learnCandidates: input.learnCandidates.slice(0, 5),
    explorationPaths: input.explorationPaths.slice(0, 5).map((path) => ({
      title: clipText(path.title, 120),
      prompt: clipText(path.prompt, 260),
      expectedValue: path.expectedValue ? clipText(path.expectedValue, 180) : undefined,
    })),
    sourceContext: input.sourceContext ?? null,
  };
}

function learningDraftToPlan(draft: AnthropicLearningPlanDraft): LearningPlan {
  const groupTitles = ["Understand", "Practice", "Check"];
  const subgroupsPerGroup = 3;
  const lessons = expandDraftLessons(draft.lessons, groupTitles.length * subgroupsPerGroup);
  const groupPurposes = [
    "Build the core idea with enough precision that the learner can say what the procedure is doing.",
    "Use concrete cases so the learner can repeat the move instead of only recognizing an explanation.",
    "Close with checks, mistakes, and a reusable takeaway that can guide the next attempt.",
  ];
  const groups = groupTitles.map((title, groupIndex) => ({
    id: `ai-group-${groupIndex + 1}`,
    title,
    purpose: groupPurposes[groupIndex] ?? groupPurposes[0],
    subgroups: lessons.slice(groupIndex * subgroupsPerGroup, groupIndex * subgroupsPerGroup + subgroupsPerGroup).map((lesson, lessonIndex) => {
      const id = `ai-group-${groupIndex + 1}-subgroup-${lessonIndex + 1}`;
      const sections = teachingSectionsFromDraftLesson(lesson);

      return {
        id,
        title: clipText(lesson.title, 90),
        oneLineGoal: ensureMinLength(clipText(lesson.oneLineGoal, 220), 20),
        teachingParagraph: ensureMinLength(clipText(lesson.teachingParagraph, 720), 80),
        teachingSections: sections,
        keyMoves: normalizedKeyMoves(lesson.keyMoves),
        misconceptions: [clipText(lesson.misconception, 220)],
        workedExample: ensureMinLength(clipText(lesson.workedExample, 360), 40),
        visualExample: {
          title: clipText(lesson.visualTitle, 90),
          description: ensureMinLength(clipText(lesson.visualDescription, 260), 40),
        },
      };
    }),
  }));

  return LearningPlanSchema.parse({
    expertRole: draft.expertRole,
    goal: draft.goal,
    paragraphFit: "one_subgroup_per_page",
    groups,
  });
}

function expandDraftLessons(lessons: AnthropicLearningPlanDraft["lessons"], targetLength: number): AnthropicLearningPlanDraft["lessons"] {
  if (lessons.length >= targetLength) {
    return lessons.slice(0, targetLength);
  }

  const expanded = lessons.flatMap((lesson, index) => [
    lesson,
    {
      ...lesson,
      title: `${lesson.title}: practice`,
      oneLineGoal: ensureMinLength(`Use the idea from "${lesson.title}" on a concrete case.`, 20),
      teachingParagraph: ensureMinLength(`${lesson.workedExample} This practice pass turns the explanation into a repeatable move.`, 80),
      visualTitle: `${lesson.visualTitle} practice`,
      visualDescription: ensureMinLength(`A worked example view showing the inputs, the move, and the checked result for "${lesson.title}".`, 40),
      misconception: ensureMinLength(`Do not stop after recognizing the idea; apply it and check the result. ${lesson.misconception}`, 1),
      workedExample: ensureMinLength(lesson.workedExample, 40),
      keyMoves: lesson.keyMoves.length >= 2 ? lesson.keyMoves : ["Apply the move.", "Check the result."],
    },
    {
      ...lesson,
      title: `${lesson.title}: check`,
      oneLineGoal: ensureMinLength(`Check "${lesson.title}" with one small attempt before moving on.`, 20),
      teachingParagraph: ensureMinLength(`${lesson.misconception} Use the worked example to catch this mistake and keep only the reliable move.`, 80),
      visualTitle: `${lesson.visualTitle} check`,
      visualDescription: ensureMinLength(`A compact check view with the learner's attempt, the expected move, and the mistake to avoid for "${lesson.title}".`, 40),
      misconception: ensureMinLength(lesson.misconception, 1),
      workedExample: ensureMinLength(lesson.workedExample, 40),
      keyMoves: lesson.keyMoves.length >= 2 ? lesson.keyMoves : ["Try the move.", "Compare the result."],
    },
  ]);

  while (expanded.length < targetLength) {
    const source = lessons[expanded.length % lessons.length] ?? lessons[0];

    if (!source) {
      break;
    }

    expanded.push({
      ...source,
      title: `${source.title}: retry`,
      oneLineGoal: ensureMinLength(`Check the result of "${source.title}" without opening a new topic.`, 20),
      teachingParagraph: ensureMinLength(`Use the inverse move or a simpler case to verify the result. ${source.teachingParagraph}`, 80),
    });
  }

  return expanded.slice(0, targetLength);
}

function normalizedKeyMoves(keyMoves: string[]): string[] {
  const moves = keyMoves.map((move) => clipText(move, 160)).filter(Boolean);

  while (moves.length < 2) {
    moves.push(moves.length === 0 ? "Apply the move." : "Check the result.");
  }

  return moves.slice(0, 4);
}

function teachingSectionsFromDraftLesson(lesson: AnthropicLearningPlanDraft["lessons"][number]) {
  return [
    {
      title: "Core idea",
      body: ensureMinLength(clipText(lesson.teachingParagraph, 360), 40),
    },
    {
      title: "Try it",
      body: ensureMinLength(clipText(lesson.workedExample, 360), 40),
    },
    {
      title: "Watch for",
      body: ensureMinLength(clipText(lesson.misconception, 360), 40),
    },
  ];
}

function ensureMinLength(value: string, minLength: number): string {
  const compact = value.trim();

  if (compact.length >= minLength) {
    return compact;
  }

  return `${compact} Use the example on this page to make the distinction concrete.`;
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

async function generateStructuredLearningPlan(request: Parameters<LearningPlanGenerateText>[0]): Promise<{ output: unknown }> {
  const result = await generateText(request);

  return { output: result.output };
}

function createXaiSettings(apiKey: string, env: Record<string, string | undefined>) {
  const baseURL = env.XAI_BASE_URL?.trim();

  if (!baseURL) {
    return { apiKey };
  }

  return { apiKey, baseURL: baseURL.replace(/\/+$/, "") };
}

function learningPlanFallbackEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const configured = env.PENNY_LEARN_PLAN_HEURISTIC_FALLBACK?.trim().toLowerCase();

  return configured !== "false" && configured !== "0" && configured !== "off";
}

function anthropicText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const content = (payload as { content?: unknown }).content;

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (!part || typeof part !== "object") {
        return "";
      }

      const text = (part as { text?: unknown }).text;

      return typeof text === "string" ? text : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function anthropicErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "unknown error";
  }

  const error = (payload as { error?: unknown }).error;

  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return "unknown error";
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();

  if (!trimmed) {
    throw new Error("Anthropic Learn plan response was empty.");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();

    if (fenced) {
      return JSON.parse(fenced);
    }

    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }

    throw new Error("Anthropic Learn plan response did not contain a JSON object.");
  }
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);

  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  return fallback;
}
