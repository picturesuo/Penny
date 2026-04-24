import {
  AiProviderError as ProviderError,
  type AiProviderCost as StructuredProviderCost,
  type AiProviderErrorReason as ProviderErrorReason,
  type AiProviderRequest as StructuredProviderRequest,
  type AiProviderResponse as StructuredProviderResponse,
  type AiProviderUsage as StructuredProviderUsage,
} from "./types.ts";

type JsonRecord = Record<string, unknown>;

export { ProviderError };

export type AnthropicProviderRequest = StructuredProviderRequest;
export type AnthropicProviderResponse = StructuredProviderResponse;

export async function invokeAnthropicStructured(
  request: StructuredProviderRequest,
): Promise<StructuredProviderResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();

  if (!apiKey) {
    throw new ProviderError({
      message: "ANTHROPIC_API_KEY is not configured.",
      provider: "anthropic",
      reason: "configuration",
    });
  }

  let response: Response;

  try {
    response = await fetch(`${resolveAnthropicBaseUrl()}/messages`, {
      method: "POST",
      headers: {
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        model: request.model,
        max_tokens: normalizeMaxTokens(request.maxTokens),
        temperature: normalizeTemperature(request.temperature),
        system: request.systemPrompt,
        messages: [
          {
            role: "user",
            content: request.userPrompt,
          },
        ],
        tools: [
          {
            name: request.schemaName,
            description: "Return the final structured JSON result for this task.",
            input_schema: request.jsonSchema,
          },
        ],
        tool_choice: {
          type: "tool",
          name: request.schemaName,
        },
      }),
    });
  } catch (error) {
    throw new ProviderError({
      message: error instanceof Error ? error.message : "Anthropic request failed before receiving a response.",
      provider: "anthropic",
      reason: "network",
      retryable: true,
    });
  }

  const payload = await parseJsonResponse(response, "anthropic");

  if (!response.ok) {
    throw new ProviderError({
      message: `Anthropic request failed with status ${response.status}: ${extractErrorMessage(payload)}`,
      provider: "anthropic",
      reason: "http",
      retryable: isRetryableStatus(response.status),
      status: response.status,
      details: payload,
    });
  }

  const text = extractTextContent(payload);
  const json = extractStructuredJson(payload, text);

  if (json == null) {
    throw new ProviderError({
      message: "Anthropic response did not contain structured JSON.",
      provider: "anthropic",
      reason: "invalid_response",
      retryable: false,
      status: response.status,
      details: payload,
    });
  }

  const inputTokens = readNumber(payload.usage, "input_tokens");
  const outputTokens = readNumber(payload.usage, "output_tokens");

  return {
    text,
    json,
    output: json,
    usage: {
      inputTokens,
      outputTokens,
      totalTokens: addNullableNumbers(inputTokens, outputTokens),
    },
    cost: {
      totalUsd: readNumber(payload.usage, "cost_usd"),
      currency: readString(payload.usage, "currency"),
    },
    stopReason: readString(payload, "stop_reason"),
    raw: payload,
  };
}

export const invokeAnthropic = invokeAnthropicStructured;

async function parseJsonResponse(response: Response, provider: string): Promise<JsonRecord> {
  const text = await response.text();

  if (!text.trim()) {
    return {};
  }

  try {
    return asRecord(JSON.parse(text), `${provider} provider returned invalid JSON.`);
  } catch {
    throw new ProviderError({
      message: `Anthropic provider returned non-JSON response (${response.status}).`,
      provider,
      reason: "invalid_response",
      retryable: false,
      status: response.status,
    });
  }
}

function extractTextContent(payload: JsonRecord): string | null {
  const content = Array.isArray(payload.content) ? payload.content : [];
  const textBlocks: string[] = [];

  for (const block of content) {
    if (block && typeof block === "object" && block.type === "text" && typeof block.text === "string") {
      const trimmed = block.text.trim();

      if (trimmed) {
        textBlocks.push(trimmed);
      }
    }
  }

  return textBlocks.length ? textBlocks.join("\n\n") : null;
}

function extractStructuredJson(payload: JsonRecord, rawText: string | null): unknown {
  const content = Array.isArray(payload.content) ? payload.content : [];

  for (const block of content) {
    if (block && typeof block === "object" && block.type === "tool_use" && "input" in block) {
      return block.input;
    }
  }

  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

function extractErrorMessage(payload: JsonRecord): string {
  if (payload.error && typeof payload.error === "object") {
    return readString(payload.error as JsonRecord, "message") ?? JSON.stringify(payload.error);
  }

  return JSON.stringify(payload);
}

function asRecord(value: unknown, message: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }

  return value as JsonRecord;
}

function readNumber(source: unknown, key: string): number | null {
  if (!source || typeof source !== "object") {
    return null;
  }

  const value = (source as JsonRecord)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(source: unknown, key: string): string | null {
  if (!source || typeof source !== "object") {
    return null;
  }

  const value = (source as JsonRecord)[key];
  return typeof value === "string" && value.trim().length ? value.trim() : null;
}

function normalizeMaxTokens(value: number): number {
  if (!Number.isFinite(value)) {
    return 1024;
  }

  return Math.max(1, Math.trunc(value));
}

function normalizeTemperature(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return value;
}

function addNullableNumbers(a: number | null, b: number | null): number | null {
  if (a == null && b == null) {
    return null;
  }

  return (a ?? 0) + (b ?? 0);
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function resolveAnthropicBaseUrl(): string {
  return (process.env.ANTHROPIC_BASE_URL?.trim() || "https://api.anthropic.com/v1").replace(/\/+$/, "");
}
