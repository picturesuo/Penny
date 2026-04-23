import "server-only";

import { getActiveSpanId, getActiveTraceId, startActiveObservation } from "@langfuse/tracing";
import { z } from "zod";
import { getDeployMetadata } from "@/lib/deploy-metadata";
import { ChallengeCritiqueValidationError } from "@/server/ai/challenge-critique-validation";
import {
  invokeAnthropicStructured,
  type StructuredProviderCost,
  type StructuredProviderUsage,
} from "@/server/ai/providers/anthropic";
import { invokeXaiStructured } from "@/server/ai/providers/xai";
import {
  resolveModelPolicy,
  type AiProviderName,
  type AiRouteDefinition,
  type AiRouteTier,
} from "@/server/ai/routing/modelPolicy";
import {
  GenerateChallengeCritiqueInputSchema,
  GenerateChallengeCritiqueOutputSchema,
  type GenerateChallengeCritiqueInput,
  type GenerateChallengeCritiqueOutput,
} from "@/server/ai/schemas/challengeCritique";

export type AiTaskContext = {
  claimId?: string | null;
  conceptId?: string | null;
  mapId?: string | null;
  sessionId?: string | null;
  tags?: string[];
  userId?: string | null;
  workspaceContextId?: string | null;
};

export type AiCallMeta = {
  cost: StructuredProviderCost;
  environment: string;
  latencyMs: number;
  model: string;
  observationId: string | null;
  promptVersion: string;
  provider: AiProviderName;
  repairAttempted: boolean;
  release: string;
  routeTier: AiRouteTier;
  traceId: string | null;
  usage: StructuredProviderUsage;
};

export type AiCallResult<TOutput> = {
  meta: AiCallMeta;
  output: TOutput;
};

type JsonCompatibleValue =
  | string
  | number
  | boolean
  | null
  | JsonCompatibleValue[]
  | { [key: string]: JsonCompatibleValue };

export async function generateChallengeCritique(
  input: z.input<typeof GenerateChallengeCritiqueInputSchema>,
  context: AiTaskContext = {},
): Promise<AiCallResult<GenerateChallengeCritiqueOutput>> {
  const parsed = GenerateChallengeCritiqueInputSchema.parse(input);
  const routes = resolveModelPolicy("generateChallengeCritique");
  const prompt = buildChallengeCritiquePrompt(parsed);
  const jsonSchema = toProviderJsonSchema(GenerateChallengeCritiqueOutputSchema);
  const deploy = getDeployMetadata();
  let lastError: Error | null = null;

  for (const route of routes) {
    try {
      return await startActiveObservation(
        `ai.generateChallengeCritique.${route.tier}`,
        async (generation) => {
          const startedAt = Date.now();
          const providerResponse = await invokeStructuredProvider({
            jsonSchema,
            route,
            systemPrompt: prompt.systemPrompt,
            userPrompt: prompt.userPrompt,
          });
          const { repairAttempted, validatedOutput, usage, cost } = await validateChallengeCritiqueWithSingleRepair({
            jsonSchema,
            prompt,
            providerResponse,
            route,
          });
          const latencyMs = Date.now() - startedAt;
          const traceId = getActiveTraceId() ?? null;
          const observationId = getActiveSpanId() ?? null;

          generation.update({
            output: validatedOutput as JsonCompatibleValue,
            usageDetails: toLangfuseUsageDetails(usage),
            costDetails: toLangfuseCostDetails(cost),
            metadata: {
              operation: route.operation,
              provider: route.provider,
              model: route.model,
              routeTier: route.tier,
              promptVersion: route.promptVersion,
              release: deploy.release,
              environment: deploy.environment,
              repairAttempted,
              ...toContextMetadata(context),
            },
            model: route.model,
            statusMessage: `Completed in ${latencyMs}ms`,
          });

          return {
            output: validatedOutput,
            meta: {
              provider: route.provider,
              model: route.model,
              promptVersion: route.promptVersion,
              release: deploy.release,
              environment: deploy.environment,
              latencyMs,
              traceId,
              observationId,
              repairAttempted,
              usage,
              cost,
              routeTier: route.tier,
            },
          };
        },
        {
          asType: "generation",
        },
      ) as AiCallResult<GenerateChallengeCritiqueOutput>;
    } catch (error) {
      if (error instanceof ChallengeCritiqueValidationError) {
        throw error;
      }

      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("Challenge critique generation failed.");
}

async function validateChallengeCritiqueWithSingleRepair(params: {
  jsonSchema: Record<string, unknown>;
  prompt: ReturnType<typeof buildChallengeCritiquePrompt>;
  providerResponse: Awaited<ReturnType<typeof invokeStructuredProvider>>;
  route: AiRouteDefinition;
}) {
  const initialValidation = GenerateChallengeCritiqueOutputSchema.safeParse(params.providerResponse.output);

  if (initialValidation.success) {
    return {
      validatedOutput: initialValidation.data,
      repairAttempted: false,
      usage: params.providerResponse.usage,
      cost: params.providerResponse.cost,
    };
  }

  const repairResponse = await invokeStructuredProvider({
    jsonSchema: params.jsonSchema,
    route: params.route,
    systemPrompt: buildChallengeCritiqueRepairSystemPrompt(),
    userPrompt: buildChallengeCritiqueRepairUserPrompt({
      originalPrompt: params.prompt,
      invalidOutput: params.providerResponse.output,
      issues: initialValidation.error.issues,
    }),
  });

  const repairedValidation = GenerateChallengeCritiqueOutputSchema.safeParse(repairResponse.output);

  if (repairedValidation.success) {
    return {
      validatedOutput: repairedValidation.data,
      repairAttempted: true,
      usage: {
        inputTokens: addNullableNumbers(params.providerResponse.usage.inputTokens, repairResponse.usage.inputTokens),
        outputTokens: addNullableNumbers(params.providerResponse.usage.outputTokens, repairResponse.usage.outputTokens),
        totalTokens: addNullableNumbers(params.providerResponse.usage.totalTokens, repairResponse.usage.totalTokens),
      },
      cost: {
        totalUsd: addNullableNumbers(params.providerResponse.cost.totalUsd, repairResponse.cost.totalUsd),
        currency: params.providerResponse.cost.currency ?? repairResponse.cost.currency,
      },
    };
  }

  throw new ChallengeCritiqueValidationError(
    "Challenge critique output failed schema validation after one repair pass.",
    repairedValidation.error,
    2,
  );
}

function buildChallengeCritiquePrompt(input: GenerateChallengeCritiqueInput) {
  return {
    systemPrompt:
      "You generate one rigorous challenge critique for Penny, a pressure-tested second brain. Be concise, specific, and high-signal. Prefer structural pressure over vague skepticism. Output only valid JSON that matches the requested schema.",
    userPrompt: [
      `Map title: ${input.mapTitle}`,
      `Claim id: ${input.claimId}`,
      `Claim: ${input.claimText}`,
      input.steelmanText ? `Existing steelman: ${input.steelmanText}` : "",
      `Current confidence: ${input.claimConfidence}%`,
      `Critique mode: ${input.critiqueMode}`,
      input.userGoal ? `User goal: ${input.userGoal}` : "User goal: none provided.",
      input.neighboringClaims.length
        ? `Neighboring claims:\n- ${input.neighboringClaims
            .map((claim) =>
              [
                claim.text,
                claim.confidence != null ? `${claim.confidence}% confidence` : null,
                claim.relationship ? `relationship=${claim.relationship}` : null,
              ]
                .filter(Boolean)
                .join(" | "),
            )
            .join("\n- ")}`
        : "Neighboring claims: none provided.",
      input.previousRounds.length
        ? `Previous rounds:\n- ${input.previousRounds
            .map((round) =>
              [
                `Round ${round.roundNumber}`,
                round.critiqueSummary,
                round.userResponse ? `response=${round.userResponse}` : null,
                round.responsePath ? `path=${round.responsePath}` : null,
                round.confidenceDelta != null ? `delta=${round.confidenceDelta}` : null,
              ]
                .filter(Boolean)
                .join(" | "),
            )
            .join("\n- ")}`
        : "Previous rounds: none.",
      'Return JSON with "conciseCritiqueSummary", "strongestCounterargument", "assumptions", "likelyFailureModes", "followUpQuestions", "suggestedConfidenceDelta", and "uncertaintyNote".',
      "Keep the confidence delta conservative and bounded by the evidence in the prompt.",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

function buildChallengeCritiqueRepairSystemPrompt() {
  return [
    "You are repairing a malformed JSON response for Penny.",
    "Return only JSON that matches the target schema exactly.",
    "Do not add commentary, markdown, or extra keys.",
    "If a field is missing, infer the smallest defensible value from the original prompt and malformed output.",
  ].join(" ");
}

function buildChallengeCritiqueRepairUserPrompt(params: {
  originalPrompt: ReturnType<typeof buildChallengeCritiquePrompt>;
  invalidOutput: unknown;
  issues: z.ZodIssue[];
}) {
  return [
    "Original system prompt:",
    params.originalPrompt.systemPrompt,
    "",
    "Original user prompt:",
    params.originalPrompt.userPrompt,
    "",
    "Malformed JSON output to repair:",
    JSON.stringify(params.invalidOutput, null, 2),
    "",
    "Validation issues:",
    JSON.stringify(params.issues, null, 2),
    "",
    'Return valid JSON with exactly these keys: "conciseCritiqueSummary", "strongestCounterargument", "assumptions", "likelyFailureModes", "followUpQuestions", "suggestedConfidenceDelta", "uncertaintyNote".',
  ].join("\n");
}

async function invokeStructuredProvider(params: {
  jsonSchema: Record<string, unknown>;
  route: AiRouteDefinition;
  systemPrompt: string;
  userPrompt: string;
}) {
  const request = {
    model: params.route.model,
    maxTokens: params.route.maxTokens,
    temperature: params.route.temperature,
    schemaName: params.route.operation,
    jsonSchema: params.jsonSchema,
    systemPrompt: params.systemPrompt,
    userPrompt: params.userPrompt,
  };

  switch (params.route.provider) {
    case "anthropic":
      return invokeAnthropicStructured(request);
    case "xai":
      return invokeXaiStructured(request);
    default:
      throw new Error(`Unsupported AI provider: ${params.route.provider satisfies never}`);
  }
}

function toProviderJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const rawSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  return sanitizeJsonSchema(rawSchema) as Record<string, unknown>;
}

function sanitizeJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeJsonSchema(entry));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const objectValue = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(objectValue)) {
    if (key === "$schema") {
      continue;
    }

    if (key === "minLength" || key === "maxLength" || key === "minItems" || key === "maxItems") {
      continue;
    }

    sanitized[key] = sanitizeJsonSchema(entry);
  }

  return sanitized;
}

function toLangfuseUsageDetails(usage: StructuredProviderUsage) {
  const details: Record<string, number> = {};

  if (usage.inputTokens != null) {
    details.input = usage.inputTokens;
  }

  if (usage.outputTokens != null) {
    details.output = usage.outputTokens;
  }

  if (usage.totalTokens != null) {
    details.total = usage.totalTokens;
  }

  return Object.keys(details).length ? details : undefined;
}

function toLangfuseCostDetails(cost: StructuredProviderCost) {
  const details: Record<string, number> = {};

  if (cost.totalUsd != null) {
    details.totalCost = cost.totalUsd;
  }

  return Object.keys(details).length ? details : undefined;
}

function addNullableNumbers(a: number | null, b: number | null) {
  if (a == null && b == null) {
    return null;
  }

  return (a ?? 0) + (b ?? 0);
}

function toContextMetadata(context: AiTaskContext) {
  return {
    userId: context.userId ?? null,
    mapId: context.mapId ?? null,
    claimId: context.claimId ?? null,
    conceptId: context.conceptId ?? null,
    workspaceContextId: context.workspaceContextId ?? null,
    sessionId: context.sessionId ?? null,
    tags: context.tags ?? [],
  };
}
