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

export type RecipeStepStatus = z.infer<typeof RecipeStepStatusSchema>;
export type RecipeStepTrace = z.infer<typeof RecipeStepTraceSchema>;
export type RecipeTrace = z.infer<typeof RecipeTraceSchema>;

export type RecipeStepResult<Context> = {
  status?: RecipeStepStatus;
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

function recipeStatus(steps: ReadonlyArray<RecipeStepTrace>): RecipeStepStatus {
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
