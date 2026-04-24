type JsonRecord = Record<string, unknown>;

export type AnthropicProviderRequest = {
  model: string;
  system: string;
  userContent: string;
  responseFormatInstructions: string;
  maxTokens?: number;
  temperature?: number;
};

export type AnthropicProviderUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type AnthropicProviderResponse = {
  rawText: string | null;
  structuredContent: unknown;
  stopReason: string | null;
  usage: AnthropicProviderUsage;
  raw: JsonRecord;
};

export async function invokeAnthropic(request: AnthropicProviderRequest): Promise<AnthropicProviderResponse> {
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
      model: request.model,
      max_tokens: normalizeMaxTokens(request.maxTokens),
      temperature: normalizeTemperature(request.temperature),
      system: request.system,
      messages: [
        {
          role: "user",
          content: buildUserMessage(request),
        },
      ],
    }),
  });

  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(`Anthropic request failed with status ${response.status}: ${extractErrorMessage(payload)}`);
  }

  const rawText = extractTextContent(payload);
  const structuredContent = extractStructuredContent(payload, rawText);
  const inputTokens = readNumber(payload.usage, "input_tokens");
  const outputTokens = readNumber(payload.usage, "output_tokens");

  return {
    rawText,
    structuredContent,
    stopReason: readString(payload, "stop_reason"),
    usage: {
      inputTokens,
      outputTokens,
      totalTokens: addNullableNumbers(inputTokens, outputTokens),
    },
    raw: payload,
  };
}

function buildUserMessage(request: AnthropicProviderRequest) {
  return [
    {
      type: "text",
      text: request.userContent,
    },
    {
      type: "text",
      text: `Response format instructions:\n${request.responseFormatInstructions}`,
    },
  ];
}

async function parseJsonResponse(response: Response): Promise<JsonRecord> {
  const text = await response.text();

  if (!text.trim()) {
    return {};
  }

  try {
    return asRecord(JSON.parse(text), "Anthropic provider returned invalid JSON.");
  } catch {
    throw new Error(`Anthropic provider returned non-JSON response (${response.status}).`);
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

  if (!textBlocks.length) {
    return null;
  }

  return textBlocks.join("\n\n");
}

function extractStructuredContent(payload: JsonRecord, rawText: string | null): unknown {
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

function normalizeMaxTokens(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 1024;
  }

  return Math.max(1, Math.trunc(value));
}

function normalizeTemperature(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
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

function resolveAnthropicBaseUrl(): string {
  return (process.env.ANTHROPIC_BASE_URL?.trim() || "https://api.anthropic.com/v1").replace(/\/+$/, "");
}
