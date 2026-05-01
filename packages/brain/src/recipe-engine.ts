import { z } from "zod";

export const RecipeStepStatusSchema = z.enum(["completed", "limited", "skipped", "failed"]);

export const RecipeStepTraceSchema = z
  .object({
    step: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(160),
    status: RecipeStepStatusSchema,
    summary: z.string().trim().min(1).max(700),
    inputs: z.array(z.string().trim().min(1).max(220)).max(8),
    outputs: z.array(z.string().trim().min(1).max(220)).max(8),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
  })
  .strict();

export const RecipeTraceSchema = z
  .object({
    recipeId: z.string().trim().min(1).max(120),
    status: RecipeStepStatusSchema,
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
    steps: z.array(RecipeStepTraceSchema).min(1).max(12),
  })
  .strict();

export type RecipeKind = "learn" | "verify" | "check";
export type RecipeTraceStepStatus = z.infer<typeof RecipeStepStatusSchema>;
export type RecipeStepStatus = "pending" | "running" | RecipeTraceStepStatus;
export type RecipeStepTrace = z.infer<typeof RecipeStepTraceSchema>;
export type RecipeTrace = z.infer<typeof RecipeTraceSchema>;

export type RecipeStepResult<Context> = {
  status?: RecipeTraceStepStatus;
  summary: string;
  inputs?: string[];
  outputs?: string[];
  context?: Partial<Context>;
};

export type RecipeStep<Context> = {
  step: string;
  title: string;
  run(context: Context): Promise<RecipeStepResult<Context>> | RecipeStepResult<Context>;
};

export type RecipeRunResult<Context> = {
  context: Context;
  trace: RecipeTrace;
};

export class RecipeEngine<Context extends Record<string, unknown>> {
  constructor(
    private readonly recipeId: string,
    private readonly steps: ReadonlyArray<RecipeStep<Context>>,
  ) {}

  async run(initialContext: Context): Promise<RecipeRunResult<Context>> {
    const startedAt = isoNow();
    let context = { ...initialContext };
    const traces: RecipeStepTrace[] = [];

    try {
      for (const step of this.steps) {
        const stepStartedAt = isoNow();
        const result = await step.run(context);

        context = {
          ...context,
          ...(result.context ?? {}),
        };
        traces.push(
          RecipeStepTraceSchema.parse({
            step: step.step,
            title: step.title,
            status: result.status ?? "completed",
            summary: result.summary,
            inputs: sanitizeList(result.inputs ?? []),
            outputs: sanitizeList(result.outputs ?? []),
            startedAt: stepStartedAt,
            completedAt: isoNow(),
          }),
        );
      }
    } catch (error) {
      traces.push(
        RecipeStepTraceSchema.parse({
          step: "recipe_failed",
          title: "Recipe failed",
          status: "failed",
          summary: formatErrorMessage(error),
          inputs: [],
          outputs: [],
          startedAt: isoNow(),
          completedAt: isoNow(),
        }),
      );
      throw error;
    }

    return {
      context,
      trace: RecipeTraceSchema.parse({
        recipeId: this.recipeId,
        status: recipeStatus(traces),
        startedAt,
        completedAt: isoNow(),
        steps: traces,
      }),
    };
  }
}

export type RecipeStepRun = {
  id: string;
  recipeRunId: string;
  key: string;
  title: string;
  status: RecipeStepStatus;
  startedAt?: string;
  completedAt?: string;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  error?: string;
};

export type RecipeRun = {
  id: string;
  kind: RecipeKind;
  sessionId: string;
  targetClaimId?: string;
  status: RecipeStepStatus;
  startedAt: string;
  completedAt?: string;
  steps: RecipeStepRun[];
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
};

export type RecipeStepContract = {
  key: string;
  title: string;
  purpose: string;
  requiredInputs: readonly string[];
  expectedOutputs: readonly string[];
};

export type RecipeContract<Kind extends RecipeKind> = {
  kind: Kind;
  version: 1;
  title: string;
  goal: string;
  steps: readonly RecipeStepContract[];
};

export type LearnRecipe = RecipeContract<"learn">;
export type VerifyRecipe = RecipeContract<"verify">;
export type CheckRecipe = RecipeContract<"check">;

export const LearnRecipeContract: LearnRecipe = {
  kind: "learn",
  version: 1,
  title: "Learn contextual explanation",
  goal: "Explain a confusing term inside the active Brain context and suggest the next Autopilot action.",
  steps: [
    step("retrieve_context", "Retrieve Brain context", "Find local Brain rows related to the term and active claim.", ["term", "currentClaimId"], ["hybridResults"]),
    step("explain_term", "Explain term", "Generate a compact contextual explanation.", ["term", "currentClaimText", "hybridResults"], ["explanation"]),
    step("structure_output", "Structure output", "Return candidate claims, assumptions, questions, gaps, and save candidates.", ["explanation"], ["learnOutput"]),
  ],
};

export const VerifyRecipeContract: VerifyRecipe = {
  kind: "verify",
  version: 1,
  title: "Verify source-grounded claim",
  goal: "Use local Brain/source context first, then external search when needed, to evaluate a claim.",
  steps: [
    step("retrieve_local_context", "Retrieve local context", "Gather local Brain rows and source rows before web search.", ["claimId"], ["hybridResults"]),
    step("decide_search", "Decide search", "Decide whether local context is enough or web search is needed.", ["claimText", "hybridResults"], ["searchDecision"]),
    step("evaluate_evidence", "Evaluate evidence", "Compare local and external evidence against the exact claim.", ["claimText", "sources"], ["evidenceCards"]),
    step("suggest_confidence", "Suggest confidence", "Return a pending confidence delta without mutating truth.", ["verdict"], ["confidenceDeltaSuggestion"]),
  ],
};

export const CheckRecipeContract: CheckRecipe = {
  kind: "check",
  version: 1,
  title: "Check structural weakness",
  goal: "Retrieve prior shapes, mistakes, and misconceptions, then challenge the weakest load-bearing claim.",
  steps: [
    step("retrieve_prior_patterns", "Retrieve prior patterns", "Find relevant shapes, mistakes, misconceptions, and graph neighbors.", ["targetClaimId"], ["hybridResults"]),
    step("select_weakness", "Select weakness", "Choose the load-bearing failure mode to pressure-test.", ["targetClaimText", "hybridResults"], ["failureType"]),
    step("issue_challenge", "Issue challenge", "Generate a Defend/Revise/Absorb-ready challenge.", ["failureType"], ["challenge"]),
  ],
};

export function createRecipeRun<Kind extends RecipeKind>(
  recipe: RecipeContract<Kind>,
  input: {
    id: string;
    sessionId: string;
    targetClaimId?: string;
    startedAt: string;
    payload: Record<string, unknown>;
  },
): RecipeRun {
  return {
    id: input.id,
    kind: recipe.kind,
    sessionId: input.sessionId,
    ...(input.targetClaimId ? { targetClaimId: input.targetClaimId } : {}),
    status: "pending",
    startedAt: input.startedAt,
    input: input.payload,
    steps: recipe.steps.map((contract, index) => ({
      id: `${input.id}:step:${index + 1}`,
      recipeRunId: input.id,
      key: contract.key,
      title: contract.title,
      status: "pending",
      inputs: {
        required: [...contract.requiredInputs],
      },
      outputs: {
        expected: [...contract.expectedOutputs],
      },
    })),
  };
}

export function recipeTraceFromSteps(
  recipeId: string,
  steps: Array<Omit<RecipeStepTrace, "startedAt" | "completedAt"> & Partial<Pick<RecipeStepTrace, "startedAt" | "completedAt">>>,
): RecipeTrace {
  const startedAt = isoNow();
  const traces = steps.map((step) =>
    RecipeStepTraceSchema.parse({
      ...step,
      inputs: sanitizeList(step.inputs),
      outputs: sanitizeList(step.outputs),
      startedAt: step.startedAt ?? startedAt,
      completedAt: step.completedAt ?? isoNow(),
    }),
  );

  return RecipeTraceSchema.parse({
    recipeId,
    status: recipeStatus(traces),
    startedAt,
    completedAt: isoNow(),
    steps: traces,
  });
}

function step(
  key: string,
  title: string,
  purpose: string,
  requiredInputs: readonly string[],
  expectedOutputs: readonly string[],
): RecipeStepContract {
  return {
    key,
    title,
    purpose,
    requiredInputs,
    expectedOutputs,
  };
}

function recipeStatus(steps: ReadonlyArray<RecipeStepTrace>): RecipeTraceStepStatus {
  if (steps.some((step) => step.status === "failed")) {
    return "failed";
  }

  if (steps.some((step) => step.status === "limited")) {
    return "limited";
  }

  if (steps.every((step) => step.status === "skipped")) {
    return "skipped";
  }

  return "completed";
}

function sanitizeList(values: ReadonlyArray<string> | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean))].slice(0, 8);
}

function isoNow(): string {
  return new Date().toISOString();
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return String(error);
}
