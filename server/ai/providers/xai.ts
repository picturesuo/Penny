import {
  type AiProvider,
  AiProviderError as ProviderError,
  type AiProviderCost as StructuredProviderCost,
  type AiProviderRequest as StructuredProviderRequest,
  type AiProviderResponse as StructuredProviderResponse,
  type AiProviderUsage as StructuredProviderUsage,
} from "./types.ts";

type JsonRecord = Record<string, unknown>;

export { ProviderError };

export type XaiProviderRequest = StructuredProviderRequest;
export type XaiProviderResponse = StructuredProviderResponse;

export async function invokeXaiStructured(request: StructuredProviderRequest): Promise<StructuredProviderResponse> {
  const apiKey = process.env.XAI_API_KEY?.trim();

  if (!apiKey) {
    throw new ProviderError({
      message: "XAI_API_KEY is not configured.",
      provider: "xai",
      reason: "configuration",
    });
  }

  let response: Response;

  try {
    response = await fetch(`${resolveXaiBaseUrl()}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: request.model,
        input: `${request.systemPrompt}\n\n${request.userPrompt}`,
        max_output_tokens: normalizeMaxTokens(request.maxTokens),
        temperature: normalizeTemperature(request.temperature),
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
  } catch (error) {
    throw new ProviderError({
      message: error instanceof Error ? error.message : "xAI request failed before receiving a response.",
      provider: "xai",
      reason: "network",
      retryable: true,
    });
  }

  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new ProviderError({
      message: `xAI request failed with status ${response.status}: ${extractErrorMessage(payload)}`,
      provider: "xai",
      reason: "http",
      retryable: isRetryableStatus(response.status),
      status: response.status,
      details: payload,
    });
  }

  const text = extractXaiOutputText(payload);
  const json = parseStructuredOutput(text, response.status, payload);

  return {
    text,
    json,
    output: json,
    usage: {
      inputTokens: readNumber(payload.usage, "input_tokens"),
      outputTokens: readNumber(payload.usage, "output_tokens"),
      totalTokens: readNumber(payload.usage, "total_tokens"),
    },
    cost: {
      totalUsd: readNumber(payload.usage, "cost_usd"),
      currency: readString(payload.usage, "currency"),
    },
    stopReason: readString(payload, "status") ?? readString(payload, "stop_reason"),
    raw: payload,
  };
}

export const xaiProvider = {
  name: "xai",
  invokeStructured: invokeXaiStructured,
} satisfies AiProvider;

async function parseJsonResponse(response: Response): Promise<JsonRecord> {
  const text = await response.text();

  if (!text.trim()) {
    return {};
  }

  try {
    return asRecord(JSON.parse(text), "xAI provider returned invalid JSON.");
  } catch {
    throw new ProviderError({
      message: `xAI provider returned non-JSON response (${response.status}).`,
      provider: "xai",
      reason: "invalid_response",
      retryable: false,
      status: response.status,
    });
  }
}

function parseStructuredOutput(text: string, status: number, payload: JsonRecord): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderError({
      message: "xAI provider returned invalid structured JSON.",
      provider: "xai",
      reason: "invalid_response",
      retryable: false,
      status,
      details: payload,
    });
  }
}

function extractXaiOutputText(payload: JsonRecord): string {
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

  throw new ProviderError({
    message: "xAI response did not contain structured output text.",
    provider: "xai",
    reason: "invalid_response",
    retryable: false,
    details: payload,
  });
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

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function resolveXaiBaseUrl(): string {
  return (process.env.XAI_BASE_URL?.trim() || "https://api.x.ai/v1").replace(/\/+$/, "");
}
