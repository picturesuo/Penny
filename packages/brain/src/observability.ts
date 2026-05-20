export type PennyLogLevel = "info" | "warn" | "error";

export type PennyLogEventName =
  | "auth.failure"
  | "brain.import"
  | "brain.memory_review"
  | "brain.retrieve"
  | "brain.source_delete"
  | "create.generate"
  | "create.model_fallback"
  | "create.prompt_export"
  | "create.schema_validation_failure";

export type PennyLogValue = string | number | boolean | null | string[] | number[] | boolean[];
export type PennyLogPayload = Record<string, PennyLogValue | undefined>;

export type PennyLogEvent = {
  event: PennyLogEventName;
  level: PennyLogLevel;
  timestamp: string;
  payload: PennyLogPayload;
};

type PennyLogSink = (event: PennyLogEvent) => void;

const blockedPayloadKeyPattern = /(content|raw|text|excerpt|summary|prompt|comment|query|token|secret|password)/i;
const explicitlySafePayloadKeyPattern = /^(contentLength|contentHash|contentCount)$/i;
let testSink: PennyLogSink | null = null;

export function emitPennyLog(
  event: PennyLogEventName,
  payload: PennyLogPayload = {},
  options: { level?: PennyLogLevel; env?: NodeJS.ProcessEnv } = {},
): void {
  const env = options.env ?? process.env;

  if (!pennyLogsEnabled(env)) {
    return;
  }

  const logEvent: PennyLogEvent = {
    event,
    level: options.level ?? "info",
    timestamp: new Date().toISOString(),
    payload: safeLogPayload(payload),
  };

  if (testSink) {
    testSink(logEvent);
    return;
  }

  const line = JSON.stringify({ source: "penny", ...logEvent });

  if (logEvent.level === "error") {
    console.error(line);
  } else if (logEvent.level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function setPennyLogSinkForTests(sink: PennyLogSink | null): void {
  testSink = sink;
}

export function safeLogPayload(payload: PennyLogPayload): PennyLogPayload {
  const safe: PennyLogPayload = {};

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || isBlockedPayloadKey(key)) {
      continue;
    }

    safe[key] = Array.isArray(value) ? value.slice(0, 12) : value;
  }

  return safe;
}

function isBlockedPayloadKey(key: string): boolean {
  return !explicitlySafePayloadKeyPattern.test(key) && blockedPayloadKeyPattern.test(key);
}

function pennyLogsEnabled(env: NodeJS.ProcessEnv): boolean {
  const configured = env.PENNY_STRUCTURED_LOGS?.trim().toLowerCase();

  if (configured) {
    return ["1", "true", "yes", "on"].includes(configured);
  }

  return env.NODE_ENV === "production" || ["staging", "production", "private-alpha"].includes(env.PENNY_DEPLOY_ENV?.trim().toLowerCase() ?? "");
}
