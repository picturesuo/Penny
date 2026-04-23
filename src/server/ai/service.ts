import "server-only";

import { getActiveSpanId, getActiveTraceId, startActiveObservation } from "@langfuse/tracing";
import { z } from "zod";
import { getDeployMetadata } from "@/lib/deploy-metadata";
import { generateChallengeCritique as generateChallengeCritiqueOperation } from "@/server/ai/operations/generate-challenge-critique";
import {
  GenerateChallengeCritiqueInputSchema,
  GenerateChallengeCritiqueOutputSchema,
} from "@/server/ai/schemas/challenge-critique";

type AiProviderName = "grok" | "claude" | "xai" | "anthropic";
type AiTaskName =
  | "summarizeClaim"
  | "generateSteelman"
  | "generateChallengeCritique"
  | "extractConceptCandidates"
  | "generateTeachbackPrompt"
  | "evaluateTeachback";

type AiTaskContext = {
  userId?: string | null;
  mapId?: string | null;
  claimId?: string | null;
  conceptId?: string | null;
  workspaceContextId?: string | null;
  sessionId?: string | null;
  tags?: string[];
};

type AiCallUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

type AiCallCost = {
  totalUsd: number | null;
  currency: string | null;
};

export type AiCallMeta = {
  provider: AiProviderName;
  model: string;
  promptVersion: string;
  release: string;
  environment: string;
  latencyMs: number;
  traceId: string | null;
  observationId: string | null;
  usage: AiCallUsage;
  cost: AiCallCost;
};

export type AiCallResult<TOutput> = {
  output: TOutput;
  meta: AiCallMeta;
};

type StructuredProviderRequest = {
  context: AiTaskContext;
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  route: AiRouteDefinition;
};

type StructuredProviderResponse = {
  output: unknown;
  usage: AiCallUsage;
  cost: AiCallCost;
};

type AiRouteDefinition = {
  maxTokens: number;
  model: string;
  promptVersion: string;
  provider: AiProviderName;
  temperature: number;
};

const JsonObjectSchema = z.record(z.string(), z.unknown());

const SummarizeClaimInputSchema = z.object({
  claimText: z.string().trim().min(1).max(4000),
  note: z.string().trim().max(4000).nullable().optional().default(null),
  provenance: z.string().trim().max(160).nullable().optional().default(null),
  confidence: z.number().int().min(0).max(100).nullable().optional().default(null),
});

const SummarizeClaimOutputSchema = z.object({
  summary: z.string(),
  confidenceDrivers: z.array(z.string()),
  openQuestions: z.array(z.string()),
});

const GenerateSteelmanInputSchema = z.object({
  claimText: z.string().trim().min(1).max(4000),
  currentReasoning: z.string().trim().max(6000).nullable().optional().default(null),
  evidenceNotes: z.array(z.string().trim().min(1).max(400)).max(8).optional().default([]),
});

const GenerateSteelmanOutputSchema = z.object({
  steelman: z.string(),
  strongestPremises: z.array(z.string()),
  testsToRespect: z.array(z.string()),
});

const ExtractConceptCandidatesInputSchema = z.object({
  claimText: z.string().trim().min(1).max(4000),
  supportingNotes: z.string().trim().max(6000).nullable().optional().default(null),
});

const ExtractConceptCandidatesOutputSchema = z.object({
  concepts: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      relationToClaim: z.string(),
      confidence: z.number(),
    }),
  ),
});

const GenerateTeachbackPromptInputSchema = z.object({
  claimText: z.string().trim().min(1).max(4000),
  conceptName: z.string().trim().min(1).max(160),
  conceptDescription: z.string().trim().max(4000).nullable().optional().default(null),
});

const GenerateTeachbackPromptOutputSchema = z.object({
  conceptTitle: z.string(),
  explanation: z.string(),
  promptText: z.string(),
  feedbackChecklist: z.array(z.string()),
  exampleText: z.string().nullable(),
});

const EvaluateTeachbackInputSchema = z.object({
  claimText: z.string().trim().min(1).max(4000),
  conceptName: z.string().trim().min(1).max(160),
  promptText: z.string().trim().min(1).max(8000),
  submission: z.string().trim().min(10).max(8000),
  feedbackChecklist: z.array(z.string().trim().min(1).max(240)).max(8).optional().default([]),
});

const EvaluateTeachbackOutputSchema = z.object({
  score: z.number(),
  overallAssessment: z.string(),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  completedChecklist: z.array(z.string()),
  missingChecklist: z.array(z.string()),
  suggestedRevision: z.string(),
});

export const aiTaskSchemas = {
  summarizeClaim: {
    input: SummarizeClaimInputSchema,
    output: SummarizeClaimOutputSchema,
  },
  generateSteelman: {
    input: GenerateSteelmanInputSchema,
    output: GenerateSteelmanOutputSchema,
  },
  generateChallengeCritique: {
    input: GenerateChallengeCritiqueInputSchema,
    output: GenerateChallengeCritiqueOutputSchema,
  },
  extractConceptCandidates: {
    input: ExtractConceptCandidatesInputSchema,
    output: ExtractConceptCandidatesOutputSchema,
  },
  generateTeachbackPrompt: {
    input: GenerateTeachbackPromptInputSchema,
    output: GenerateTeachbackPromptOutputSchema,
  },
  evaluateTeachback: {
    input: EvaluateTeachbackInputSchema,
    output: EvaluateTeachbackOutputSchema,
  },
};

export async function summarizeClaim(
  input: z.input<typeof SummarizeClaimInputSchema>,
  context: AiTaskContext = {},
): Promise<AiCallResult<z.infer<typeof SummarizeClaimOutputSchema>>> {
  const parsed = SummarizeClaimInputSchema.parse(input);

  return executeStructuredTask({
    context,
    input: parsed,
    outputSchema: SummarizeClaimOutputSchema,
    taskName: "summarizeClaim",
    buildPrompt: (data) => ({
      systemPrompt:
        "You summarize one claim for a pressure-tested second brain. Keep it concrete, faithful to the claim, and explicit about what still needs pressure.",
      userPrompt: [
        `Claim: ${data.claimText}`,
        data.note ? `Note: ${data.note}` : "",
        data.provenance ? `Provenance: ${data.provenance}` : "",
        data.confidence != null ? `Confidence: ${data.confidence}%` : "",
        'Return JSON with "summary", "confidenceDrivers", and "openQuestions".',
      ]
        .filter(Boolean)
        .join("\n"),
    }),
  });
}

export async function generateSteelman(
  input: z.input<typeof GenerateSteelmanInputSchema>,
  context: AiTaskContext = {},
): Promise<AiCallResult<z.infer<typeof GenerateSteelmanOutputSchema>>> {
  const parsed = GenerateSteelmanInputSchema.parse(input);

  return executeStructuredTask({
    context,
    input: parsed,
    outputSchema: GenerateSteelmanOutputSchema,
    taskName: "generateSteelman",
    buildPrompt: (data) => ({
      systemPrompt:
        "You produce the strongest opposing view of a claim. Be rigorous, fair, and as persuasive as possible without inventing facts.",
      userPrompt: [
        `Claim: ${data.claimText}`,
        data.currentReasoning ? `Current reasoning: ${data.currentReasoning}` : "",
        data.evidenceNotes.length ? `Evidence notes:\n- ${data.evidenceNotes.join("\n- ")}` : "",
        'Return JSON with "steelman", "strongestPremises", and "testsToRespect".',
      ]
        .filter(Boolean)
        .join("\n"),
    }),
  });
}

export async function generateChallengeCritique(
  input: z.input<typeof GenerateChallengeCritiqueInputSchema>,
  context: AiTaskContext = {},
): Promise<AiCallResult<z.infer<typeof GenerateChallengeCritiqueOutputSchema>>> {
  return generateChallengeCritiqueOperation(input, context);
}

export async function extractConceptCandidates(
  input: z.input<typeof ExtractConceptCandidatesInputSchema>,
  context: AiTaskContext = {},
): Promise<AiCallResult<z.infer<typeof ExtractConceptCandidatesOutputSchema>>> {
  const parsed = ExtractConceptCandidatesInputSchema.parse(input);

  return executeStructuredTask({
    context,
    input: parsed,
    outputSchema: ExtractConceptCandidatesOutputSchema,
    taskName: "extractConceptCandidates",
    buildPrompt: (data) => ({
      systemPrompt:
        "You extract concepts that the user may need to understand better in order to work on the current claim. Prefer high-signal concepts over broad themes.",
      userPrompt: [
        `Claim: ${data.claimText}`,
        data.supportingNotes ? `Supporting notes: ${data.supportingNotes}` : "",
        'Return JSON with "concepts", where each concept has "name", "description", "relationToClaim", and "confidence" from 0 to 1.',
      ]
        .filter(Boolean)
        .join("\n"),
    }),
  });
}

export async function generateTeachbackPrompt(
  input: z.input<typeof GenerateTeachbackPromptInputSchema>,
  context: AiTaskContext = {},
): Promise<AiCallResult<z.infer<typeof GenerateTeachbackPromptOutputSchema>>> {
  const parsed = GenerateTeachbackPromptInputSchema.parse(input);

  return executeStructuredTask({
    context,
    input: parsed,
    outputSchema: GenerateTeachbackPromptOutputSchema,
    taskName: "generateTeachbackPrompt",
    buildPrompt: (data) => ({
      systemPrompt:
        "You create a just-in-time teach-back prompt. Keep the explanation short, the prompt specific to the active claim, and the checklist usable by a real person.",
      userPrompt: [
        `Claim: ${data.claimText}`,
        `Concept: ${data.conceptName}`,
        data.conceptDescription ? `Concept description: ${data.conceptDescription}` : "",
        'Return JSON with "conceptTitle", "explanation", "promptText", "feedbackChecklist", and "exampleText".',
      ]
        .filter(Boolean)
        .join("\n"),
    }),
  });
}

export async function evaluateTeachback(
  input: z.input<typeof EvaluateTeachbackInputSchema>,
  context: AiTaskContext = {},
): Promise<AiCallResult<z.infer<typeof EvaluateTeachbackOutputSchema>>> {
  const parsed = EvaluateTeachbackInputSchema.parse(input);

  return executeStructuredTask({
    context,
    input: parsed,
    outputSchema: EvaluateTeachbackOutputSchema,
    taskName: "evaluateTeachback",
    buildPrompt: (data) => ({
      systemPrompt:
        "You evaluate a teach-back explanation. Be strict enough to surface the gap, but specific enough that the user can repair the answer immediately.",
      userPrompt: [
        `Claim: ${data.claimText}`,
        `Concept: ${data.conceptName}`,
        `Teach-back prompt: ${data.promptText}`,
        `Submission: ${data.submission}`,
        data.feedbackChecklist.length ? `Checklist:\n- ${data.feedbackChecklist.join("\n- ")}` : "",
        'Return JSON with "score" from 0 to 100, "overallAssessment", "strengths", "gaps", "completedChecklist", "missingChecklist", and "suggestedRevision".',
      ]
        .filter(Boolean)
        .join("\n"),
    }),
  });
}

async function executeStructuredTask<TInput, TOutput>(params: {
  buildPrompt: (input: TInput) => { systemPrompt: string; userPrompt: string };
  context: AiTaskContext;
  input: TInput;
  outputSchema: z.ZodType<TOutput>;
  taskName: AiTaskName;
}): Promise<AiCallResult<TOutput>> {
  const route = resolveRoute(params.taskName);
  const { systemPrompt, userPrompt } = params.buildPrompt(params.input);
  const jsonSchema = toProviderJsonSchema(params.outputSchema);
  const deploy = getDeployMetadata();

  return startActiveObservation(
    `ai.${params.taskName}`,
    async (generation) => {
      const startedAt = Date.now();

      try {
        const providerResponse = await invokeStructuredProvider({
          context: params.context,
          systemPrompt,
          userPrompt,
          schemaName: params.taskName,
          jsonSchema,
          route,
        });
        const validatedOutput = params.outputSchema.parse(providerResponse.output);
        const latencyMs = Date.now() - startedAt;
        const traceId = getActiveTraceId() ?? null;
        const observationId = getActiveSpanId() ?? null;

        generation.update({
          output: validatedOutput as JsonCompatibleValue,
          usageDetails: toLangfuseUsageDetails(providerResponse.usage),
          costDetails: toLangfuseCostDetails(providerResponse.cost),
          metadata: {
            taskName: params.taskName,
            provider: route.provider,
            promptVersion: route.promptVersion,
            release: deploy.release,
            environment: deploy.environment,
            ...toContextMetadata(params.context),
          },
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
            usage: providerResponse.usage,
            cost: providerResponse.cost,
          },
        };
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        generation.update({
          level: "ERROR",
          output: {
            error: normalized.message,
          },
          metadata: {
            taskName: params.taskName,
            provider: route.provider,
            promptVersion: route.promptVersion,
            release: deploy.release,
            environment: deploy.environment,
            ...toContextMetadata(params.context),
          },
          statusMessage: normalized.message,
        });
        throw normalized;
      }
    },
    {
      asType: "generation",
      model: route.model,
      modelParameters: {
        temperature: route.temperature,
        maxTokens: route.maxTokens,
      },
      prompt: {
        name: params.taskName,
        version: parsePromptVersion(route.promptVersion),
        isFallback: false,
      },
      input: {
        systemPrompt,
        userPrompt,
      },
      metadata: {
        taskName: params.taskName,
        provider: route.provider,
        promptVersion: route.promptVersion,
        release: deploy.release,
        environment: deploy.environment,
        ...toContextMetadata(params.context),
      },
    },
  );
}

async function invokeStructuredProvider(request: StructuredProviderRequest): Promise<StructuredProviderResponse> {
  switch (request.route.provider) {
    case "grok":
      return invokeGrokStructured(request);
    case "claude":
      return invokeClaudeStructured(request);
    default:
      throw new Error(`Unsupported AI provider: ${request.route.provider}`);
  }
}

async function invokeGrokStructured(request: StructuredProviderRequest): Promise<StructuredProviderResponse> {
  const apiKey = process.env.XAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("XAI_API_KEY is not configured.");
  }

  const response = await fetch(`${resolveXaiBaseUrl()}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: request.route.model,
      input: `${request.systemPrompt}\n\n${request.userPrompt}`,
      max_output_tokens: request.route.maxTokens,
      temperature: request.route.temperature,
      text: {
        format: {
          type: "json_schema",
          name: request.schemaName,
          schema: request.jsonSchema,
          strict: true,
        },
      },
    }),
  });

  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(`Grok request failed with status ${response.status}: ${extractErrorMessage(payload)}`);
  }

  const outputText = extractXaiOutputText(payload);

  return {
    output: parseStructuredOutput(outputText),
    usage: {
      inputTokens: readNumber(payload.usage, "input_tokens"),
      outputTokens: readNumber(payload.usage, "output_tokens"),
      totalTokens: readNumber(payload.usage, "total_tokens"),
    },
    cost: {
      totalUsd: readNumber(payload.usage, "cost_usd"),
      currency: readString(payload.usage, "currency"),
    },
  };
}

async function invokeClaudeStructured(request: StructuredProviderRequest): Promise<StructuredProviderResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const response = await fetch(`${resolveAnthropicBaseUrl()}/messages`, {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model: request.route.model,
      max_tokens: request.route.maxTokens,
      temperature: request.route.temperature,
      system: request.systemPrompt,
      messages: [
        {
          role: "user",
          content: request.userPrompt,
        },
      ],
      tools: [
        {
          name: "return_result",
          description: "Return the final structured JSON result for this task.",
          input_schema: request.jsonSchema,
        },
      ],
      tool_choice: {
        type: "tool",
        name: "return_result",
      },
    }),
  });

  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(`Claude request failed with status ${response.status}: ${extractErrorMessage(payload)}`);
  }

  const toolUseBlock = Array.isArray(payload.content)
    ? payload.content.find((entry) => entry && typeof entry === "object" && entry.type === "tool_use")
    : null;

  if (!toolUseBlock || typeof toolUseBlock !== "object" || !("input" in toolUseBlock)) {
    throw new Error("Claude response did not contain a structured tool result.");
  }

  return {
    output: toolUseBlock.input,
    usage: {
      inputTokens: readNumber(payload.usage, "input_tokens"),
      outputTokens: readNumber(payload.usage, "output_tokens"),
      totalTokens:
        addNullableNumbers(readNumber(payload.usage, "input_tokens"), readNumber(payload.usage, "output_tokens")),
    },
    cost: {
      totalUsd: readNumber(payload.usage, "cost_usd"),
      currency: readString(payload.usage, "currency"),
    },
  };
}

function resolveRoute(taskName: AiTaskName): AiRouteDefinition {
  switch (taskName) {
    case "summarizeClaim":
      return {
        provider: "grok",
        model: process.env.XAI_HIGH_VOLUME_MODEL?.trim() || "grok-4.20",
        promptVersion: "v1",
        maxTokens: 900,
        temperature: 0.2,
      };
    case "extractConceptCandidates":
      return {
        provider: "grok",
        model: process.env.XAI_HIGH_VOLUME_MODEL?.trim() || "grok-4.20",
        promptVersion: "v1",
        maxTokens: 1200,
        temperature: 0.2,
      };
    case "generateTeachbackPrompt":
      return {
        provider: "grok",
        model: process.env.XAI_HIGH_VOLUME_MODEL?.trim() || "grok-4.20",
        promptVersion: "v1",
        maxTokens: 1400,
        temperature: 0.25,
      };
    case "generateSteelman":
      return {
        provider: "claude",
        model: process.env.ANTHROPIC_DEEP_MODEL?.trim() || "claude-sonnet-4-0",
        promptVersion: "v1",
        maxTokens: 1600,
        temperature: 0.2,
      };
    case "generateChallengeCritique":
      return {
        provider: "claude",
        model: process.env.ANTHROPIC_DEEP_MODEL?.trim() || "claude-sonnet-4-0",
        promptVersion: "v1",
        maxTokens: 1800,
        temperature: 0.2,
      };
    case "evaluateTeachback":
      return {
        provider: "claude",
        model: process.env.ANTHROPIC_DEEP_MODEL?.trim() || "claude-sonnet-4-0",
        promptVersion: "v1",
        maxTokens: 1400,
        temperature: 0.1,
      };
    default:
      throw new Error(`Unsupported AI task: ${taskName satisfies never}`);
  }
}

function toProviderJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const rawSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  return sanitizeJsonSchema(rawSchema);
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

function toLangfuseUsageDetails(usage: AiCallUsage) {
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

function toLangfuseCostDetails(cost: AiCallCost) {
  const details: Record<string, number> = {};

  if (cost.totalUsd != null) {
    details.totalCost = cost.totalUsd;
  }

  return Object.keys(details).length ? details : undefined;
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

function parsePromptVersion(promptVersion: string) {
  const numeric = Number.parseInt(promptVersion.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();

  if (!text.trim()) {
    return {};
  }

  try {
    return JsonObjectSchema.parse(JSON.parse(text));
  } catch {
    throw new Error(`AI provider returned non-JSON response (${response.status}).`);
  }
}

function parseStructuredOutput(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("AI provider returned invalid structured JSON.");
  }
}

function extractXaiOutputText(payload: Record<string, unknown>) {
  const output = Array.isArray(payload.output) ? payload.output : [];

  for (const item of output) {
    if (!item || typeof item !== "object" || item.type !== "message") {
      continue;
    }

    const content = Array.isArray(item.content) ? item.content : [];

    for (const block of content) {
      if (block && typeof block === "object" && block.type === "output_text" && typeof block.text === "string") {
        return block.text;
      }
    }
  }

  throw new Error("Grok response did not contain structured output text.");
}

function extractErrorMessage(payload: Record<string, unknown>) {
  if (payload.error && typeof payload.error === "object") {
    return readString(payload.error as Record<string, unknown>, "message") ?? JSON.stringify(payload.error);
  }

  return JSON.stringify(payload);
}

function readNumber(source: unknown, key: string): number | null {
  if (!source || typeof source !== "object") {
    return null;
  }

  const value = (source as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(source: unknown, key: string): string | null {
  if (!source || typeof source !== "object") {
    return null;
  }

  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length ? value.trim() : null;
}

function addNullableNumbers(a: number | null, b: number | null) {
  if (a == null && b == null) {
    return null;
  }

  return (a ?? 0) + (b ?? 0);
}

function resolveXaiBaseUrl() {
  return (process.env.XAI_BASE_URL?.trim() || "https://api.x.ai/v1").replace(/\/+$/, "");
}

function resolveAnthropicBaseUrl() {
  return (process.env.ANTHROPIC_BASE_URL?.trim() || "https://api.anthropic.com/v1").replace(/\/+$/, "");
}

type JsonCompatibleValue =
  | string
  | number
  | boolean
  | null
  | JsonCompatibleValue[]
  | { [key: string]: JsonCompatibleValue };
