import { randomUUID } from "node:crypto";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type AiTraceUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type AiTraceCost = {
  currency: string | null;
  totalUsd: number | null;
};

export type AiTraceStartInput = {
  input?: JsonValue;
  metadata?: Record<string, JsonValue>;
  model?: string | null;
  name: string;
  observationType?: "event" | "generation" | "span";
  promptVersion?: string | null;
  provider?: string | null;
  requestId?: string | null;
  sessionId?: string | null;
  tags?: string[];
  userId?: string | null;
};

export type AiTraceHandle = {
  baseUrl: string | null;
  enabled: boolean;
  environment: string;
  input: JsonValue | null;
  metadata: Record<string, JsonValue>;
  model: string | null;
  name: string;
  observationId: string | null;
  observationType: "event" | "generation" | "span";
  promptVersion: string | null;
  provider: string | null;
  release: string;
  requestId: string | null;
  sessionId: string | null;
  startedAt: number;
  tags: string[];
  traceId: string | null;
  userId: string | null;
};

export type AiTraceSuccessInput = {
  cost?: Partial<AiTraceCost> | null;
  metadata?: Record<string, JsonValue>;
  output?: JsonValue;
  statusMessage?: string | null;
  usage?: Partial<AiTraceUsage> | null;
};

export type AiTraceFailureInput = {
  error: unknown;
  metadata?: Record<string, JsonValue>;
  statusMessage?: string | null;
};

export type AiTraceResult = {
  cost: AiTraceCost;
  enabled: boolean;
  environment: string;
  errorMessage: string | null;
  latencyMs: number;
  metadata: Record<string, JsonValue>;
  model: string | null;
  name: string;
  observationId: string | null;
  promptVersion: string | null;
  provider: string | null;
  release: string;
  requestId: string | null;
  sessionId: string | null;
  status: "failure" | "success";
  statusMessage: string | null;
  tags: string[];
  traceId: string | null;
  usage: AiTraceUsage;
  userId: string | null;
};

export function startAiTrace(input: AiTraceStartInput): AiTraceHandle {
  const config = readLangfuseConfig();

  return {
    enabled: config.enabled,
    traceId: config.enabled ? randomUUID() : null,
    observationId: config.enabled ? randomUUID() : null,
    startedAt: Date.now(),
    name: input.name.trim(),
    observationType: input.observationType ?? "generation",
    provider: readOptionalString(input.provider),
    model: readOptionalString(input.model),
    promptVersion: readOptionalString(input.promptVersion),
    requestId: readOptionalString(input.requestId),
    sessionId: readOptionalString(input.sessionId),
    userId: readOptionalString(input.userId),
    tags: normalizeTags(input.tags),
    input: input.input ?? null,
    metadata: sanitizeMetadata(input.metadata),
    environment: readEnvironment(),
    release: readRelease(),
    baseUrl: config.baseUrl,
  };
}

export function endAiTraceSuccess(handle: AiTraceHandle, input: AiTraceSuccessInput = {}): AiTraceResult {
  return buildTraceResult(handle, {
    status: "success",
    errorMessage: null,
    output: input.output,
    statusMessage: readOptionalString(input.statusMessage),
    usage: normalizeUsage(input.usage),
    cost: normalizeCost(input.cost),
    metadata: sanitizeMetadata(input.metadata),
  });
}

export function endAiTraceFailure(handle: AiTraceHandle, input: AiTraceFailureInput): AiTraceResult {
  return buildTraceResult(handle, {
    status: "failure",
    errorMessage: getErrorMessage(input.error),
    output: null,
    statusMessage: readOptionalString(input.statusMessage),
    usage: emptyUsage(),
    cost: emptyCost(),
    metadata: {
      ...sanitizeMetadata(input.metadata),
      errorName: getErrorName(input.error),
    },
  });
}

function buildTraceResult(
  handle: AiTraceHandle,
  input: {
    cost: AiTraceCost;
    errorMessage: string | null;
    metadata: Record<string, JsonValue>;
    output: JsonValue | null | undefined;
    status: "failure" | "success";
    statusMessage: string | null;
    usage: AiTraceUsage;
  },
): AiTraceResult {
  const metadata =
    input.output === undefined
      ? { ...handle.metadata, ...input.metadata }
      : { ...handle.metadata, ...input.metadata, output: input.output };

  return {
    enabled: handle.enabled,
    traceId: handle.traceId,
    observationId: handle.observationId,
    latencyMs: Math.max(0, Date.now() - handle.startedAt),
    status: input.status,
    statusMessage: input.statusMessage,
    errorMessage: input.errorMessage,
    provider: handle.provider,
    model: handle.model,
    promptVersion: handle.promptVersion,
    requestId: handle.requestId,
    sessionId: handle.sessionId,
    userId: handle.userId,
    tags: handle.tags,
    environment: handle.environment,
    release: handle.release,
    usage: input.usage,
    cost: input.cost,
    metadata,
    name: handle.name,
  };
}

function readLangfuseConfig() {
  const publicKey = readOptionalString(process.env.LANGFUSE_PUBLIC_KEY);
  const secretKey = readOptionalString(process.env.LANGFUSE_SECRET_KEY);
  const baseUrl =
    readOptionalString(process.env.LANGFUSE_BASE_URL) ?? "https://cloud.langfuse.com";

  return {
    enabled: Boolean(publicKey && secretKey),
    baseUrl,
  };
}

function readEnvironment() {
  return readOptionalString(process.env.NODE_ENV) ?? "development";
}

function readRelease() {
  return (
    readOptionalString(process.env.VERCEL_GIT_COMMIT_SHA) ??
    readOptionalString(process.env.GITHUB_SHA) ??
    "local"
  );
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeTags(value: string[] | undefined) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(value.map((entry) => entry.trim()).filter((entry) => entry.length > 0)),
  );
}

function sanitizeMetadata(value: Record<string, JsonValue> | undefined) {
  if (!value) {
    return {};
  }

  const entries = Object.entries(value).filter(([key]) => key.trim().length > 0);
  return Object.fromEntries(entries) as Record<string, JsonValue>;
}

function normalizeUsage(value: Partial<AiTraceUsage> | null | undefined): AiTraceUsage {
  return {
    inputTokens: readOptionalNumber(value?.inputTokens),
    outputTokens: readOptionalNumber(value?.outputTokens),
    totalTokens: readOptionalNumber(value?.totalTokens),
  };
}

function normalizeCost(value: Partial<AiTraceCost> | null | undefined): AiTraceCost {
  return {
    totalUsd: readOptionalNumber(value?.totalUsd),
    currency: readOptionalString(value?.currency),
  };
}

function emptyUsage(): AiTraceUsage {
  return {
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
  };
}

function emptyCost(): AiTraceCost {
  return {
    totalUsd: null,
    currency: null,
  };
}

function readOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return "Unknown AI trace failure.";
}

function getErrorName(error: unknown): JsonValue {
  if (error instanceof Error && error.name.trim()) {
    return error.name;
  }

  return "Error";
}
