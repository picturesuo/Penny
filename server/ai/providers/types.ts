export type AiProviderRequest = {
  jsonSchema: Record<string, unknown>;
  maxTokens: number;
  model: string;
  schemaName: string;
  systemPrompt: string;
  temperature: number;
  userPrompt: string;
};

export type AiProviderUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type AiProviderCost = {
  currency: string | null;
  totalUsd: number | null;
};

export type AiProviderResponse = {
  cost: AiProviderCost;
  json: unknown;
  output: unknown;
  raw: Record<string, unknown>;
  stopReason: string | null;
  text: string | null;
  usage: AiProviderUsage;
};

export type AiProviderName = "anthropic" | "mock" | "openai" | "xai" | (string & {});

export type AiProvider = {
  invokeStructured(request: AiProviderRequest): Promise<AiProviderResponse>;
  name: AiProviderName;
};

export type AiProviderErrorReason = "configuration" | "http" | "invalid_response" | "network";

export class AiProviderError extends Error {
  code: "PROVIDER_ERROR";
  details: Record<string, unknown> | null;
  provider: string;
  reason: AiProviderErrorReason;
  retryable: boolean;
  status: number | null;

  constructor(params: {
    details?: Record<string, unknown> | null;
    message: string;
    provider: string;
    reason: AiProviderErrorReason;
    retryable?: boolean;
    status?: number | null;
  }) {
    super(params.message);
    this.name = "ProviderError";
    this.code = "PROVIDER_ERROR";
    this.provider = params.provider;
    this.reason = params.reason;
    this.status = params.status ?? null;
    this.details = params.details ?? null;
    this.retryable = params.retryable ?? false;
  }
}
