import "server-only";

const JsonObjectSchema = {
  parse(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Anthropic provider returned invalid JSON.");
    }

    return value as Record<string, unknown>;
  },
};

export type StructuredProviderRequest = {
  jsonSchema: Record<string, unknown>;
  maxTokens: number;
  model: string;
  schemaName: string;
  systemPrompt: string;
  temperature: number;
  userPrompt: string;
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

export async function invokeAnthropicStructured(
  request: StructuredProviderRequest,
): Promise<StructuredProviderResponse> {
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
      max_tokens: request.maxTokens,
      temperature: request.temperature,
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
    throw new Error(`Anthropic request failed with status ${response.status}: ${extractErrorMessage(payload)}`);
  }

  const toolUseBlock = Array.isArray(payload.content)
    ? payload.content.find((entry) => entry && typeof entry === "object" && entry.type === "tool_use")
    : null;

  if (!toolUseBlock || typeof toolUseBlock !== "object" || !("input" in toolUseBlock)) {
    throw new Error("Anthropic response did not contain a structured tool result.");
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

async function parseJsonResponse(response: Response) {
  const text = await response.text();

  if (!text.trim()) {
    return {};
  }

  try {
    return JsonObjectSchema.parse(JSON.parse(text));
  } catch {
    throw new Error(`Anthropic provider returned non-JSON response (${response.status}).`);
  }
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

function resolveAnthropicBaseUrl() {
  return (process.env.ANTHROPIC_BASE_URL?.trim() || "https://api.anthropic.com/v1").replace(/\/+$/, "");
}
