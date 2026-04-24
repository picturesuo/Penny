import { invokeAnthropicStructured } from "../providers/anthropic.ts";
import { invokeXaiStructured } from "../providers/xai.ts";
import { PROMPT_VERSION, buildCaptureThoughtPrompt } from "../prompts/captureThought/v1.ts";
import { selectModelForOperation } from "../routing/modelPolicy.ts";
import { CaptureThoughtOutputSchema, type CaptureThoughtOutput } from "../schemas/captureThought.ts";

export type CaptureThoughtProviderName = "anthropic" | "xai";
export type CaptureThoughtQualityTier = "default" | "fallback" | "cheap";

export type CaptureThoughtInput = {
  text: string;
  sessionId?: string | null;
  qualityTier?: CaptureThoughtQualityTier | null;
};

export type CaptureThoughtContext = {
  promptVersion?: string | null;
  qualityTier?: CaptureThoughtQualityTier | null;
  requestId?: string | null;
  userId?: string | null;
};

export type StructuredProviderUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type StructuredProviderCost = {
  currency: string | null;
  totalUsd: number | null;
};

export type CaptureThoughtResult = CaptureThoughtOutput & {
  rawText: string;
  sessionId: string | null;
  meta: {
    cost: StructuredProviderCost;
    fallbackHopCount: number;
    model: string;
    promptVersion: string;
    provider: CaptureThoughtProviderName;
    repairAttempted: boolean;
    routeTier: string;
    usage: StructuredProviderUsage;
    validationResult: "valid" | "repaired_valid";
  };
};

export class CaptureThoughtValidationError extends Error {
  issues: string[];

  constructor(message: string, issues: string[]) {
    super(message);
    this.name = "CaptureThoughtValidationError";
    this.issues = issues;
  }
}

export class CaptureThoughtError extends Error {
  attempts: number;
  code: string;
  failures: Array<{ message: string; model?: string; provider?: string; tier?: string }>;
  operationName: string;

  constructor(params: {
    attempts: number;
    failures: Array<{ message: string; model?: string; provider?: string; tier?: string }>;
    message?: string;
    operationName: string;
  }) {
    super(params.message ?? "AI capture operation failed.");
    this.name = "CaptureThoughtError";
    this.code = "AI_CAPTURE_FAILED";
    this.operationName = params.operationName;
    this.attempts = params.attempts;
    this.failures = params.failures;
  }
}

type CaptureThoughtRoute = {
  model: string;
  promptVersion: string;
  provider: CaptureThoughtProviderName;
  tier: string;
};

type PromptBundle = {
  promptVersion: string;
  systemPrompt: string;
  userPrompt: string;
};

type StructuredProviderResponse = {
  cost: StructuredProviderCost;
  output: unknown;
  usage: StructuredProviderUsage;
};

type StructuredProviderInvoker = (input: unknown) => Promise<unknown>;
type ResolveModelPolicy = (
  operationName: string,
  options?: { promptVersion?: string; qualityTier?: CaptureThoughtQualityTier | null },
) => CaptureThoughtRoute[];

const CAPTURE_THOUGHT_OPERATION = "captureThought";
const DEFAULT_PROMPT_VERSION = PROMPT_VERSION;
const CAPTURE_THOUGHT_OUTPUT_KEYS = ["thought", "claims"] as const;

function defaultResolveModelPolicy(
  operationName: string,
  options: { promptVersion?: string; qualityTier?: CaptureThoughtQualityTier | null } = {},
): CaptureThoughtRoute[] {
  const promptVersion = readOptionalString(options.promptVersion) ?? DEFAULT_PROMPT_VERSION;
  const qualityTier = readQualityTier(options.qualityTier);

  if (qualityTier === "cheap") {
    const selection = selectModelForOperation(operationName, "cheap");
    return [
      {
        provider: selection.provider,
        model: selection.model,
        promptVersion,
        tier: selection.qualityTier,
      },
    ];
  }

  const defaultSelection = selectModelForOperation(operationName, "default");
  const fallbackSelection = selectModelForOperation(operationName, "fallback");

  return [
    {
      provider: defaultSelection.provider,
      model: defaultSelection.model,
      promptVersion,
      tier: defaultSelection.qualityTier,
    },
    {
      provider: fallbackSelection.provider,
      model: fallbackSelection.model,
      promptVersion,
      tier: fallbackSelection.qualityTier,
    },
  ];
}

export const captureThoughtDeps = {
  invokeAnthropicStructured: invokeAnthropicStructured as StructuredProviderInvoker,
  invokeXaiStructured: invokeXaiStructured as StructuredProviderInvoker,
  resolveModelPolicy: defaultResolveModelPolicy as ResolveModelPolicy,
};

export async function captureThought(input: unknown, context: CaptureThoughtContext = {}): Promise<CaptureThoughtResult> {
  const normalizedInput = validateCaptureThoughtInput(input);
  const promptVersion = readOptionalString(context.promptVersion) ?? DEFAULT_PROMPT_VERSION;
  const builtPrompt = buildCaptureThoughtPrompt({
    text: normalizedInput.text,
    sessionId: normalizedInput.sessionId,
  });
  const prompt =
    promptVersion === builtPrompt.promptVersion
      ? builtPrompt
      : {
          ...builtPrompt,
          promptVersion,
          userPrompt: JSON.stringify({ ...builtPrompt.structuredInput, promptVersion }, null, 2),
        };
  const routes = captureThoughtDeps.resolveModelPolicy(CAPTURE_THOUGHT_OPERATION, {
    promptVersion,
    qualityTier: normalizedInput.qualityTier ?? context.qualityTier ?? null,
  });
  const failures: Array<{ message: string; model?: string; provider?: string; tier?: string }> = [];

  for (const [routeIndex, route] of routes.entries()) {
    try {
      const firstResponse = await invokeStructuredProvider(route, prompt);
      const validation = await validateWithSingleRepair(route, prompt, firstResponse);

      return {
        rawText: normalizedInput.text,
        sessionId: normalizedInput.sessionId,
        thought: validation.output.thought,
        claims: validation.output.claims,
        meta: {
          provider: route.provider,
          model: route.model,
          promptVersion: route.promptVersion,
          fallbackHopCount: routeIndex,
          repairAttempted: validation.repairAttempted,
          validationResult: validation.repairAttempted ? "repaired_valid" : "valid",
          routeTier: route.tier,
          usage: validation.usage,
          cost: validation.cost,
        },
      };
    } catch (error) {
      failures.push({
        provider: route.provider,
        model: route.model,
        tier: route.tier,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw new CaptureThoughtError({
    operationName: CAPTURE_THOUGHT_OPERATION,
    attempts: routes.length,
    failures,
    message: "Thought capture extraction failed across all configured providers.",
  });
}

function validateCaptureThoughtInput(input: unknown): CaptureThoughtInput & { sessionId: string | null } {
  const object = asRecord(input, "captureThought input must be an object.");

  return {
    text: readRequiredString(object.text, "text", 1, 8000),
    sessionId: readOptionalString(object.sessionId, "sessionId", { maxLength: 200 }),
    qualityTier: readQualityTier(object.qualityTier),
  };
}

async function validateWithSingleRepair(
  route: CaptureThoughtRoute,
  prompt: PromptBundle,
  firstResponse: StructuredProviderResponse,
): Promise<{
  cost: StructuredProviderCost;
  output: CaptureThoughtOutput;
  repairAttempted: boolean;
  usage: StructuredProviderUsage;
}> {
  const initial = safeParseCaptureThoughtOutput(firstResponse.output);

  if (initial.success) {
    return {
      output: initial.data,
      repairAttempted: false,
      usage: normalizeUsage(firstResponse.usage),
      cost: normalizeCost(firstResponse.cost),
    };
  }

  const repairResponse = await invokeStructuredProvider(route, buildCaptureThoughtRepairPrompt(prompt, firstResponse.output, initial.issues));
  const repaired = safeParseCaptureThoughtOutput(repairResponse.output);

  if (!repaired.success) {
    throw new CaptureThoughtValidationError("Capture thought output failed validation after one repair pass.", repaired.issues);
  }

  return {
    output: repaired.data,
    repairAttempted: true,
    usage: {
      inputTokens: addNullableNumbers(firstResponse.usage?.inputTokens ?? null, repairResponse.usage?.inputTokens ?? null),
      outputTokens: addNullableNumbers(firstResponse.usage?.outputTokens ?? null, repairResponse.usage?.outputTokens ?? null),
      totalTokens: addNullableNumbers(firstResponse.usage?.totalTokens ?? null, repairResponse.usage?.totalTokens ?? null),
    },
    cost: {
      totalUsd: addNullableNumbers(firstResponse.cost?.totalUsd ?? null, repairResponse.cost?.totalUsd ?? null),
      currency: readOptionalString(firstResponse.cost?.currency) ?? readOptionalString(repairResponse.cost?.currency) ?? null,
    },
  };
}

function buildCaptureThoughtRepairPrompt(prompt: PromptBundle, invalidOutput: unknown, issues: string[]): PromptBundle {
  return {
    promptVersion: prompt.promptVersion,
    systemPrompt:
      "You are repairing malformed JSON for Penny's thought capture parser. Return only valid JSON matching the requested schema.",
    userPrompt: [
      "Original system prompt:",
      prompt.systemPrompt,
      "",
      "Original user prompt:",
      prompt.userPrompt,
      "",
      "Malformed output:",
      JSON.stringify(invalidOutput, null, 2),
      "",
      "Validation issues:",
      JSON.stringify(issues, null, 2),
      "",
      `Return JSON with exactly these top-level keys: ${CAPTURE_THOUGHT_OUTPUT_KEYS.join(", ")}.`,
    ].join("\n"),
  };
}

async function invokeStructuredProvider(route: CaptureThoughtRoute, prompt: PromptBundle): Promise<StructuredProviderResponse> {
  const request = {
    jsonSchema: captureThoughtJsonSchema,
    maxTokens: route.tier === "cheap" ? 900 : 1400,
    model: route.model,
    schemaName: CAPTURE_THOUGHT_OPERATION,
    systemPrompt: prompt.systemPrompt,
    temperature: route.tier === "cheap" ? 0.1 : 0.15,
    userPrompt: prompt.userPrompt,
  };
  const response =
    route.provider === "anthropic"
      ? await captureThoughtDeps.invokeAnthropicStructured(request)
      : route.provider === "xai"
        ? await captureThoughtDeps.invokeXaiStructured(request)
        : Promise.reject(new Error(`Unsupported AI provider: ${route.provider}`));

  return normalizeStructuredProviderResponse(response);
}

const captureThoughtJsonSchema = {
  type: "object",
  required: CAPTURE_THOUGHT_OUTPUT_KEYS,
  additionalProperties: false,
  properties: {
    thought: {
      type: "object",
      required: ["title", "summary"],
      additionalProperties: false,
      properties: {
        title: { type: "string" },
        summary: { type: "string" },
      },
    },
    claims: {
      type: "array",
      items: {
        type: "object",
        required: ["text", "confidenceBps", "rationale"],
        additionalProperties: false,
        properties: {
          text: { type: "string" },
          confidenceBps: { type: "integer", minimum: 0, maximum: 10_000 },
          rationale: {
            anyOf: [{ type: "string" }, { type: "null" }],
          },
        },
      },
    },
  },
} as const;

function safeParseCaptureThoughtOutput(value: unknown):
  | { success: true; data: CaptureThoughtOutput }
  | { success: false; issues: string[] } {
  const parsed = CaptureThoughtOutputSchema.safeParse(value);

  if (parsed.success) {
    return {
      success: true,
      data: parsed.data,
    };
  }

  return {
    success: false,
    issues: parsed.error.issues.map((issue) => `${issue.path.join(".") || "output"}: ${issue.message}`),
  };
}

function normalizeStructuredProviderResponse(value: unknown): StructuredProviderResponse {
  const object = asRecord(value, "Structured provider response must be an object.");

  return {
    output: object.output,
    usage: normalizeUsage(object.usage),
    cost: normalizeCost(object.cost),
  };
}

function normalizeUsage(value: unknown): StructuredProviderUsage {
  const object = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

  return {
    inputTokens: readNullableNumber(object.inputTokens),
    outputTokens: readNullableNumber(object.outputTokens),
    totalTokens: readNullableNumber(object.totalTokens),
  };
}

function normalizeCost(value: unknown): StructuredProviderCost {
  const object = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

  return {
    totalUsd: readNullableNumber(object.totalUsd),
    currency: readOptionalString(object.currency),
  };
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CaptureThoughtValidationError(message, [message]);
  }

  return value as Record<string, unknown>;
}

function readRequiredString(value: unknown, fieldName: string, minLength: number, maxLength: number): string {
  if (typeof value !== "string") {
    throw new CaptureThoughtValidationError(`${fieldName} must be a string.`, [`${fieldName} must be a string.`]);
  }

  const trimmed = value.trim();

  if (trimmed.length < minLength) {
    throw new CaptureThoughtValidationError(`${fieldName} must be at least ${minLength} character(s).`, [
      `${fieldName} must be at least ${minLength} character(s).`,
    ]);
  }

  if (trimmed.length > maxLength) {
    throw new CaptureThoughtValidationError(`${fieldName} must be at most ${maxLength} character(s).`, [
      `${fieldName} must be at most ${maxLength} character(s).`,
    ]);
  }

  return trimmed;
}

function readOptionalString(
  value: unknown,
  fieldName = "value",
  options: { maxLength?: number } = {},
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new CaptureThoughtValidationError(`${fieldName} must be a string when provided.`, [
      `${fieldName} must be a string when provided.`,
    ]);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (options.maxLength !== undefined && trimmed.length > options.maxLength) {
    throw new CaptureThoughtValidationError(`${fieldName} must be at most ${options.maxLength} character(s).`, [
      `${fieldName} must be at most ${options.maxLength} character(s).`,
    ]);
  }

  return trimmed;
}

function readQualityTier(value: unknown): CaptureThoughtQualityTier | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (value === "default" || value === "fallback" || value === "cheap") {
    return value;
  }

  throw new CaptureThoughtValidationError("qualityTier must be default, fallback, or cheap when provided.", [
    "qualityTier must be default, fallback, or cheap when provided.",
  ]);
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function addNullableNumbers(left: number | null, right: number | null): number | null {
  if (left === null && right === null) {
    return null;
  }

  return (left ?? 0) + (right ?? 0);
}
