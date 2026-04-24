import { invokeAnthropicStructured } from "../providers/anthropic.ts";
import { invokeXaiStructured } from "../providers/xai.ts";
import {
  PROMPT_VERSION,
  buildGenerateChallengeCritiquePrompt,
} from "../prompts/generateChallengeCritique/v1.ts";
import {
  ChallengeCritiqueSchema,
  type ChallengeCritique,
  type GenerateChallengeCritiqueOutput as CanonicalGenerateChallengeCritiqueOutput,
} from "../schemas/challengeCritique.ts";
import { selectModelForOperation } from "../routing/modelPolicy.ts";

export type ChallengeCritiqueProviderName = "anthropic" | "xai";
export type ChallengeCritiqueRouteTier = "default" | "fallback" | "cheap";
export type ChallengeCritiqueQualityTier = "default" | "fallback" | "cheap" | "standard" | "degraded";
export type ChallengeCritiqueMode = "direct" | "socratic" | "red_team";
export type ChallengeResponsePath = "defend" | "revise" | "absorb";

export type GenerateChallengeCritiqueNeighborClaim = {
  id: string;
  text: string;
  confidence?: number | null;
  kind?: string | null;
  relationship?: string | null;
};

export type GenerateChallengeCritiquePreviousRound = {
  roundId: string;
  roundNumber: number;
  critiqueSummary: string;
  userResponse?: string | null;
  responsePath?: ChallengeResponsePath | null;
  confidenceDelta?: number | null;
};

export type GenerateChallengeCritiqueInput = {
  claimId?: string | null;
  claimText: string;
  claimConfidence?: number | null;
  critiqueMode?: ChallengeCritiqueMode | null;
  mapTitle?: string | null;
  neighboringClaims?: GenerateChallengeCritiqueNeighborClaim[] | null;
  previousRounds?: GenerateChallengeCritiquePreviousRound[] | null;
  priorRoundContext?: GenerateChallengeCritiquePreviousRound | GenerateChallengeCritiquePreviousRound[] | null;
  qualityTier?: ChallengeCritiqueQualityTier | null;
  steelmanText?: string | null;
  userGoal?: string | null;
};

export type GenerateChallengeCritiqueOutput = {
  conciseCritiqueSummary: string;
  strongestCounterargument: string;
  assumptions: string[];
  likelyFailureModes: string[];
  followUpQuestions: string[];
  suggestedConfidenceDelta: number;
  uncertaintyNote: string;
};

export type GenerateChallengeCritiqueContext = {
  claimId?: string | null;
  mapId?: string | null;
  promptVersion?: string | null;
  qualityTier?: ChallengeCritiqueQualityTier | null;
  requestId?: string | null;
  roundId?: string | null;
  sessionId?: string | null;
  tags?: string[];
  userId?: string | null;
  workspaceContextId?: string | null;
};

export type GenerateChallengeCritiqueRoute = {
  model: string;
  promptVersion: string;
  provider: ChallengeCritiqueProviderName;
  tier: string;
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

export type StructuredProviderResponse = {
  cost: StructuredProviderCost;
  output: unknown;
  usage: StructuredProviderUsage;
};

export type GenerateChallengeCritiqueResult = {
  critique: ChallengeCritique;
  fallbackUsed: boolean;
  meta: {
    cost: StructuredProviderCost;
    environment: string;
    fallbackHopCount: number;
    latencyMs: number;
    model: string;
    observationId: string | null;
    promptVersion: string;
    provider: ChallengeCritiqueProviderName;
    repairAttempted: boolean;
    release: string;
    routeTier: string;
    traceId: string | null;
    usage: StructuredProviderUsage;
    validationResult: "valid" | "repaired_valid";
  };
  model: string;
  output: GenerateChallengeCritiqueOutput;
  promptVersion: string;
  provider: ChallengeCritiqueProviderName;
  repaired: boolean;
  traceId?: string | null;
};

export class GenerateChallengeCritiqueValidationError extends Error {
  issues: string[];

  constructor(message: string, issues: string[]) {
    super(message);
    this.name = "GenerateChallengeCritiqueValidationError";
    this.issues = issues;
  }
}

export class GenerateChallengeCritiqueError extends Error {
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
    super(params.message ?? "AI operation failed.");
    this.name = "GenerateChallengeCritiqueError";
    this.code = "AI_OPERATION_FAILED";
    this.operationName = params.operationName;
    this.attempts = params.attempts;
    this.failures = params.failures;
  }
}

type Observation = {
  update: (input: unknown) => void;
};

type StructuredProviderInvoker = (input: unknown) => Promise<unknown>;
type StartActiveObservation = (
  name: string,
  callback: (generation: Observation) => Promise<unknown>,
  options?: unknown,
) => Promise<unknown>;
type ResolveModelPolicy = (
  operationName: string,
  options?: { promptVersion?: string; qualityTier?: ChallengeCritiqueQualityTier | null },
) => GenerateChallengeCritiqueRoute[];

type PromptBundle = {
  promptVersion: string;
  systemPrompt: string;
  userPrompt: string;
};

type NormalizedGenerateChallengeCritiqueInput = {
  claimId: string;
  claimText: string;
  claimConfidence: number | null;
  critiqueMode: ChallengeCritiqueMode;
  qualityTier: ChallengeCritiqueQualityTier | null;
  mapTitle: string | null;
  neighboringClaims: GenerateChallengeCritiqueNeighborClaim[];
  previousRounds: GenerateChallengeCritiquePreviousRound[];
  steelmanText: string | null;
  userGoal: string | null;
};

const GENERATE_CHALLENGE_CRITIQUE_OPERATION = "generateChallengeCritique";
const DEFAULT_PROMPT_VERSION = PROMPT_VERSION;
const CANONICAL_OUTPUT_KEYS = [
  "summary",
  "strongestCounterargument",
  "assumptions",
  "failureModes",
  "followUpQuestions",
  "suggestedConfidenceBps",
  "uncertaintyNote",
] as const;

function unsupportedProvider(provider: string): Error {
  return new Error(`Unsupported AI provider: ${provider}`);
}

function defaultStartActiveObservation(
  _name: string,
  callback: (generation: Observation) => Promise<unknown>,
): Promise<unknown> {
  return callback({
    update() {
      return undefined;
    },
  });
}

function defaultResolveModelPolicy(
  operationName: string,
  options: { promptVersion?: string; qualityTier?: ChallengeCritiqueQualityTier | null } = {},
): GenerateChallengeCritiqueRoute[] {
  const promptVersion = readOptionalString(options.promptVersion) ?? DEFAULT_PROMPT_VERSION;
  const normalizedTier = normalizeQualityTier(options.qualityTier);

  if (normalizedTier === "cheap") {
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

  if (operationName === GENERATE_CHALLENGE_CRITIQUE_OPERATION) {
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

  const fallbackSelection = selectModelForOperation(operationName, "fallback");
  return [
    {
      provider: fallbackSelection.provider,
      model: fallbackSelection.model,
      promptVersion,
      tier: fallbackSelection.qualityTier,
    },
  ];
}

export const generateChallengeCritiqueDeps = {
  getActiveObservationId: () => null as string | null,
  getDeployMetadata: () => ({
    environment: process.env.NODE_ENV?.trim() || "development",
    release: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local",
  }),
  getTraceId: () => null as string | null,
  invokeAnthropicStructured: invokeAnthropicStructured as StructuredProviderInvoker,
  invokeXaiStructured: invokeXaiStructured as StructuredProviderInvoker,
  resolveModelPolicy: defaultResolveModelPolicy as ResolveModelPolicy,
  startActiveObservation: defaultStartActiveObservation as StartActiveObservation,
};

export async function generateChallengeCritique(
  input: unknown,
  context: GenerateChallengeCritiqueContext = {},
): Promise<GenerateChallengeCritiqueResult> {
  const normalizedInput = validateGenerateChallengeCritiqueInput(input);
  const promptVersion = readOptionalString(context.promptVersion) ?? DEFAULT_PROMPT_VERSION;
  const prompt = buildChallengeCritiquePromptV1(normalizedInput, promptVersion);
  const routes = generateChallengeCritiqueDeps.resolveModelPolicy(GENERATE_CHALLENGE_CRITIQUE_OPERATION, {
    promptVersion,
    qualityTier: normalizedInput.qualityTier ?? context.qualityTier ?? null,
  });
  const failures: Array<{ message: string; model?: string; provider?: string; tier?: string }> = [];

  for (const [routeIndex, route] of routes.entries()) {
    try {
      return (await generateChallengeCritiqueDeps.startActiveObservation(
        `ai.${GENERATE_CHALLENGE_CRITIQUE_OPERATION}.${route.tier}`,
        async (generation) => {
          const startedAt = Date.now();
          try {
            const firstResponse = await invokeStructuredProvider(route, prompt);
            const validation = await validateWithSingleRepair(route, prompt, firstResponse, normalizedInput.claimConfidence);
            const latencyMs = Date.now() - startedAt;
            const deploy = generateChallengeCritiqueDeps.getDeployMetadata();
            const traceId = generateChallengeCritiqueDeps.getTraceId();

            generation.update({
              metadata: {
                fallbackHopCount: routeIndex,
                operation: GENERATE_CHALLENGE_CRITIQUE_OPERATION,
                promptVersion: route.promptVersion,
                provider: route.provider,
                repairAttempted: validation.repairAttempted,
                routeTier: route.tier,
                validationResult: validation.repairAttempted ? "repaired_valid" : "valid",
              },
              model: route.model,
              output: validation.output,
              statusMessage: `Completed in ${latencyMs}ms`,
            });

            return {
              critique: validation.critique,
              fallbackUsed: routeIndex > 0,
              provider: route.provider,
              model: route.model,
              promptVersion: route.promptVersion,
              repaired: validation.repairAttempted,
              ...(traceId !== null ? { traceId } : {}),
              output: validation.output,
              meta: {
                provider: route.provider,
                model: route.model,
                promptVersion: route.promptVersion,
                fallbackHopCount: routeIndex,
                repairAttempted: validation.repairAttempted,
                validationResult: validation.repairAttempted ? "repaired_valid" : "valid",
                routeTier: route.tier,
                traceId,
                observationId: generateChallengeCritiqueDeps.getActiveObservationId(),
                release: deploy.release,
                environment: deploy.environment,
                latencyMs,
                usage: validation.usage,
                cost: validation.cost,
              },
            } satisfies GenerateChallengeCritiqueResult;
          } catch (error) {
            generation.update({
              metadata: {
                fallbackHopCount: routeIndex,
                operation: GENERATE_CHALLENGE_CRITIQUE_OPERATION,
                promptVersion: route.promptVersion,
                provider: route.provider,
                routeTier: route.tier,
              },
              model: route.model,
              statusMessage: "Failed",
            });
            throw error;
          }
        },
        { asType: "generation" },
      )) as GenerateChallengeCritiqueResult;
    } catch (error) {
      failures.push({
        provider: route.provider,
        model: route.model,
        tier: route.tier,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw new GenerateChallengeCritiqueError({
    operationName: GENERATE_CHALLENGE_CRITIQUE_OPERATION,
    attempts: routes.length,
    failures,
    message: "Challenge critique generation failed across all configured providers.",
  });
}

export function buildChallengeCritiquePromptV1(
  input: NormalizedGenerateChallengeCritiqueInput,
  promptVersion = DEFAULT_PROMPT_VERSION,
): PromptBundle {
  const builtPrompt = buildGenerateChallengeCritiquePrompt({
    mapTitle: input.mapTitle ?? "Untitled map",
    claimId: input.claimId,
    claimText: input.claimText,
    claimConfidenceBps: percentToBps(input.claimConfidence),
    critiqueMode: input.critiqueMode,
    steelmanText: input.steelmanText,
    userGoal: input.userGoal,
    neighboringClaims: input.neighboringClaims.map((claim) => ({
      id: claim.id,
      text: claim.text,
      confidenceBps: percentToBps(claim.confidence),
      relationship: claim.relationship ?? claim.kind ?? null,
    })),
    previousRounds: input.previousRounds.map((round) => ({
      roundId: round.roundId,
      roundNumber: round.roundNumber,
      summary: round.critiqueSummary,
      userResponse: round.userResponse ?? null,
      responsePath: round.responsePath ?? null,
      confidenceDeltaBps: percentToBps(round.confidenceDelta),
    })),
  });

  const structuredInput =
    promptVersion === builtPrompt.promptVersion
      ? builtPrompt.structuredInput
      : { ...builtPrompt.structuredInput, promptVersion };

  return {
    promptVersion,
    systemPrompt: builtPrompt.systemPrompt,
    userPrompt: JSON.stringify(structuredInput, null, 2),
  };
}

function buildChallengeCritiqueRepairPrompt(prompt: PromptBundle, invalidOutput: unknown, issues: string[]): PromptBundle {
  return {
    promptVersion: prompt.promptVersion,
    systemPrompt: [
      "You are repairing a malformed JSON response for Penny.",
      "Return only valid JSON matching the requested critique schema.",
      "Do not add markdown, explanation, or extra keys.",
    ].join(" "),
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
      `Return JSON with exactly these keys: ${CANONICAL_OUTPUT_KEYS.join(", ")}.`,
    ].join("\n"),
  };
}

async function validateWithSingleRepair(
  route: GenerateChallengeCritiqueRoute,
  prompt: PromptBundle,
  firstResponse: StructuredProviderResponse,
  claimConfidence: number | null,
): Promise<{
  cost: StructuredProviderCost;
  critique: ChallengeCritique;
  output: GenerateChallengeCritiqueOutput;
  repairAttempted: boolean;
  usage: StructuredProviderUsage;
}> {
  const initial = safeParseChallengeCritiqueOutput(firstResponse.output, claimConfidence);

  if (initial.success) {
    return {
      critique: initial.critique,
      output: initial.data,
      repairAttempted: false,
      usage: normalizeUsage(firstResponse.usage),
      cost: normalizeCost(firstResponse.cost),
    };
  }

  const repairPrompt = buildChallengeCritiqueRepairPrompt(prompt, firstResponse.output, initial.issues);
  const repairResponse = await invokeStructuredProvider(route, repairPrompt);
  const repaired = safeParseChallengeCritiqueOutput(repairResponse.output, claimConfidence);

  if (!repaired.success) {
    throw new GenerateChallengeCritiqueValidationError(
      "Challenge critique output failed validation after one repair pass.",
      repaired.issues,
    );
  }

  return {
    critique: repaired.critique,
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

async function invokeStructuredProvider(route: GenerateChallengeCritiqueRoute, prompt: PromptBundle): Promise<StructuredProviderResponse> {
  const request = {
    jsonSchema: challengeCritiqueJsonSchema,
    maxTokens: route.tier === "cheap" ? 1200 : 1800,
    model: route.model,
    schemaName: GENERATE_CHALLENGE_CRITIQUE_OPERATION,
    systemPrompt: prompt.systemPrompt,
    temperature: route.tier === "cheap" ? 0.15 : 0.2,
    userPrompt: prompt.userPrompt,
  };

  const response =
    route.provider === "anthropic"
      ? await generateChallengeCritiqueDeps.invokeAnthropicStructured(request)
      : route.provider === "xai"
        ? await generateChallengeCritiqueDeps.invokeXaiStructured(request)
        : Promise.reject(unsupportedProvider(route.provider));

  return normalizeStructuredProviderResponse(response);
}

const challengeCritiqueJsonSchema = {
  type: "object",
  required: CANONICAL_OUTPUT_KEYS,
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    strongestCounterargument: { type: "string" },
    assumptions: { type: "array", items: { type: "string" } },
    failureModes: { type: "array", items: { type: "string" } },
    followUpQuestions: { type: "array", items: { type: "string" } },
    suggestedConfidenceBps: {
      anyOf: [{ type: "integer" }, { type: "null" }],
    },
    uncertaintyNote: { type: "string" },
  },
} as const;

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

function validateGenerateChallengeCritiqueInput(input: unknown): NormalizedGenerateChallengeCritiqueInput {
  const object = asRecord(input, "generateChallengeCritique input must be an object.");
  const previousRounds = normalizePreviousRounds(object.previousRounds, object.priorRoundContext);

  return {
    claimId: readOptionalInputString(object.claimId, "claimId", { maxLength: 200 }) ?? "claim-unknown",
    claimText: readRequiredString(object.claimText, "claimText", 1, 4000),
    claimConfidence: readNullableInteger(object.claimConfidence, "claimConfidence", 0, 100),
    critiqueMode: readCritiqueMode(object.critiqueMode),
    qualityTier: readQualityTier(object.qualityTier),
    mapTitle: readOptionalString(object.mapTitle),
    steelmanText: readOptionalString(object.steelmanText),
    userGoal: readOptionalString(object.userGoal),
    neighboringClaims: normalizeNeighboringClaims(object.neighboringClaims),
    previousRounds,
  };
}

function normalizeNeighboringClaims(value: unknown): GenerateChallengeCritiqueNeighborClaim[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new GenerateChallengeCritiqueValidationError("neighboringClaims must be an array when provided.", [
      "neighboringClaims must be an array when provided.",
    ]);
  }

  return value.map((entry, index) => {
    const object = asRecord(entry, `neighboringClaims[${index}] must be an object.`);

    return {
      id: readRequiredString(object.id, `neighboringClaims[${index}].id`, 1, 200),
      text: readRequiredString(object.text, `neighboringClaims[${index}].text`, 1, 4000),
      confidence: readNullableInteger(object.confidence, `neighboringClaims[${index}].confidence`, 0, 100),
      kind: readOptionalString(object.kind),
      relationship: readOptionalString(object.relationship),
    };
  });
}

function normalizePreviousRounds(
  previousRoundsValue: unknown,
  priorRoundContextValue: unknown,
): GenerateChallengeCritiquePreviousRound[] {
  const sourceValue =
    previousRoundsValue !== undefined
      ? previousRoundsValue
      : priorRoundContextValue === undefined || priorRoundContextValue === null
        ? []
        : Array.isArray(priorRoundContextValue)
          ? priorRoundContextValue
          : [priorRoundContextValue];

  if (!Array.isArray(sourceValue)) {
    throw new GenerateChallengeCritiqueValidationError("prior round context must be an array or object when provided.", [
      "prior round context must be an array or object when provided.",
    ]);
  }

  return sourceValue.map((entry, index) => {
    const object = asRecord(entry, `previousRounds[${index}] must be an object.`);

    return {
      roundId: readRequiredString(object.roundId, `previousRounds[${index}].roundId`, 1, 200),
      roundNumber: readRequiredInteger(object.roundNumber, `previousRounds[${index}].roundNumber`, 1, 1000),
      critiqueSummary: readRequiredString(object.critiqueSummary, `previousRounds[${index}].critiqueSummary`, 1, 800),
      userResponse: readOptionalString(object.userResponse),
      responsePath: readResponsePath(object.responsePath),
      confidenceDelta: readNullableInteger(object.confidenceDelta, `previousRounds[${index}].confidenceDelta`, -100, 100),
    };
  });
}

function safeParseChallengeCritiqueOutput(
  value: unknown,
  claimConfidence: number | null,
): { critique: ChallengeCritique; data: GenerateChallengeCritiqueOutput; success: true } | { issues: string[]; success: false } {
  const normalized = normalizeCritiqueOutputForSchema(value, claimConfidence);
  const result = ChallengeCritiqueSchema.safeParse(normalized);

  if (!result.success) {
    return {
      success: false,
      issues: result.error.issues.map((issue) => {
        const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
        return `${path}${issue.message}`;
      }),
    };
  }

  return {
    success: true,
    critique: result.data,
    data: mapCanonicalOutputToLegacy(result.data, claimConfidence),
  };
}

function normalizeCritiqueOutputForSchema(value: unknown, claimConfidence: number | null): unknown {
  const object = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

  if (!object) {
    return value;
  }

  if ("summary" in object || "failureModes" in object || "suggestedConfidenceBps" in object) {
    return object;
  }

  if (
    "conciseCritiqueSummary" in object ||
    "likelyFailureModes" in object ||
    "suggestedConfidenceDelta" in object
  ) {
    return {
      summary: object.conciseCritiqueSummary,
      strongestCounterargument: object.strongestCounterargument,
      assumptions: object.assumptions,
      failureModes: object.likelyFailureModes,
      followUpQuestions: object.followUpQuestions,
      suggestedConfidenceBps: legacyDeltaToSuggestedConfidenceBps(object.suggestedConfidenceDelta, claimConfidence),
      uncertaintyNote: object.uncertaintyNote,
    };
  }

  return object;
}

function mapCanonicalOutputToLegacy(
  output: CanonicalGenerateChallengeCritiqueOutput,
  claimConfidence: number | null,
): GenerateChallengeCritiqueOutput {
  return {
    conciseCritiqueSummary: output.summary,
    strongestCounterargument: output.strongestCounterargument,
    assumptions: output.assumptions,
    likelyFailureModes: output.failureModes,
    followUpQuestions: output.followUpQuestions,
    suggestedConfidenceDelta: suggestedConfidenceBpsToLegacyDelta(output.suggestedConfidenceBps, claimConfidence),
    uncertaintyNote: output.uncertaintyNote,
  };
}

function legacyDeltaToSuggestedConfidenceBps(value: unknown, claimConfidence: number | null): number | null | unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    return value;
  }

  return claimConfidence == null ? null : Math.trunc((claimConfidence + value) * 100);
}

function suggestedConfidenceBpsToLegacyDelta(value: number | null, claimConfidence: number | null): number {
  if (value === null || claimConfidence == null) {
    return 0;
  }

  return Math.max(-100, Math.min(100, Math.trunc(value / 100) - claimConfidence));
}

function percentToBps(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.trunc(value * 100);
}

function readCritiqueMode(value: unknown): ChallengeCritiqueMode {
  if (value === undefined || value === null) {
    return "direct";
  }

  if (value === "direct" || value === "socratic" || value === "red_team") {
    return value;
  }

  throw new GenerateChallengeCritiqueValidationError("critiqueMode must be one of direct, socratic, or red_team.", [
    "critiqueMode must be one of direct, socratic, or red_team.",
  ]);
}

function readQualityTier(value: unknown): ChallengeCritiqueQualityTier | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (
    value === "default" ||
    value === "fallback" ||
    value === "cheap" ||
    value === "standard" ||
    value === "degraded"
  ) {
    return value;
  }

  throw new GenerateChallengeCritiqueValidationError(
    "qualityTier must be one of default, fallback, cheap, standard, or degraded.",
    ["qualityTier must be one of default, fallback, cheap, standard, or degraded."],
  );
}

function readResponsePath(value: unknown): ChallengeResponsePath | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (value === "defend" || value === "revise" || value === "absorb") {
    return value;
  }

  throw new GenerateChallengeCritiqueValidationError("responsePath must be one of defend, revise, or absorb.", [
    "responsePath must be one of defend, revise, or absorb.",
  ]);
}

function normalizeQualityTier(value: ChallengeCritiqueQualityTier | null | undefined): "default" | "cheap" {
  if (value === "cheap" || value === "degraded") {
    return "cheap";
  }

  return "default";
}

function readRequiredString(value: unknown, fieldName: string, minLength: number, maxLength: number): string {
  if (typeof value !== "string") {
    throw new GenerateChallengeCritiqueValidationError(`${fieldName} must be a string.`, [`${fieldName} must be a string.`]);
  }

  const trimmed = value.trim();

  if (trimmed.length < minLength) {
    throw new GenerateChallengeCritiqueValidationError(
      `${fieldName} must be at least ${minLength} character(s).`,
      [`${fieldName} must be at least ${minLength} character(s).`],
    );
  }

  if (trimmed.length > maxLength) {
    throw new GenerateChallengeCritiqueValidationError(
      `${fieldName} must be at most ${maxLength} character(s).`,
      [`${fieldName} must be at most ${maxLength} character(s).`],
    );
  }

  return trimmed;
}

function readOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new GenerateChallengeCritiqueValidationError("Optional string field must be a string when provided.", [
      "Optional string field must be a string when provided.",
    ]);
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readOptionalInputString(
  value: unknown,
  fieldName: string,
  options: { maxLength?: number } = {},
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new GenerateChallengeCritiqueValidationError(`${fieldName} must be a string when provided.`, [
      `${fieldName} must be a string when provided.`,
    ]);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (options.maxLength !== undefined && trimmed.length > options.maxLength) {
    throw new GenerateChallengeCritiqueValidationError(
      `${fieldName} must be at most ${options.maxLength} character(s).`,
      [`${fieldName} must be at most ${options.maxLength} character(s).`],
    );
  }

  return trimmed;
}

function readRequiredInteger(value: unknown, fieldName: string, minValue: number, maxValue: number): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new GenerateChallengeCritiqueValidationError(`${fieldName} must be an integer.`, [`${fieldName} must be an integer.`]);
  }

  if (value < minValue || value > maxValue) {
    throw new GenerateChallengeCritiqueValidationError(
      `${fieldName} must be between ${minValue} and ${maxValue}.`,
      [`${fieldName} must be between ${minValue} and ${maxValue}.`],
    );
  }

  return value;
}

function readNullableInteger(value: unknown, fieldName: string, minValue: number, maxValue: number): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  return readRequiredInteger(value, fieldName, minValue, maxValue);
}

function readNullableNumber(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return value;
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GenerateChallengeCritiqueValidationError(message, [message]);
  }

  return value as Record<string, unknown>;
}

function addNullableNumbers(a: number | null, b: number | null): number | null {
  if (a == null && b == null) {
    return null;
  }

  return (a ?? 0) + (b ?? 0);
}
