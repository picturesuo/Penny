const JsonObjectSchema = {
  parse(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("xAI provider returned invalid JSON.");
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

export async function invokeXaiStructured(request: StructuredProviderRequest): Promise<StructuredProviderResponse> {
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
      model: request.model,
      input: `${request.systemPrompt}\n\n${request.userPrompt}`,
      max_output_tokens: request.maxTokens,
      temperature: request.temperature,
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
    throw new Error(`xAI request failed with status ${response.status}: ${extractErrorMessage(payload)}`);
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

async function parseJsonResponse(response: Response) {
  const text = await response.text();

  if (!text.trim()) {
    return {};
  }

  try {
    return JsonObjectSchema.parse(JSON.parse(text));
  } catch {
    throw new Error(`xAI provider returned non-JSON response (${response.status}).`);
  }
}

function parseStructuredOutput(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("xAI provider returned invalid structured JSON.");
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

  throw new Error("xAI response did not contain structured output text.");
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

function resolveXaiBaseUrl() {
  return (process.env.XAI_BASE_URL?.trim() || "https://api.x.ai/v1").replace(/\/+$/, "");
}
