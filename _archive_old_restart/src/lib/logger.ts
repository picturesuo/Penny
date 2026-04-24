import { getDeployMetadata } from "@/lib/deploy-metadata";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEntry = {
  level: LogLevel;
  message: string;
  timestamp: string;
  release: string;
  environment: string;
  userId?: string;
  featureId?: string;
  durationMs?: number;
  error?: string;
  data?: Record<string, unknown>;
};

export function log(level: LogLevel, message: string, context?: Omit<LogEntry, "level" | "message" | "timestamp">): void {
  const deploy = getDeployMetadata();
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    release: deploy.release,
    environment: deploy.environment,
    ...context,
  };

  if (process.env.NODE_ENV === "development") {
    const prefix = {
      debug: "🔵",
      info: "🟢",
      warn: "🟡",
      error: "🔴",
    }[level];

    console.log(`${prefix} [${entry.timestamp}] ${message}`, {
      release: entry.release,
      environment: entry.environment,
      ...(context || {}),
    });
    return;
  }

  console.log(JSON.stringify(entry));
}

export const logger = {
  debug: (msg: string, ctx?: Omit<LogEntry, "level" | "message" | "timestamp">) => log("debug", msg, ctx),
  info: (msg: string, ctx?: Omit<LogEntry, "level" | "message" | "timestamp">) => log("info", msg, ctx),
  warn: (msg: string, ctx?: Omit<LogEntry, "level" | "message" | "timestamp">) => log("warn", msg, ctx),
  error: (msg: string, ctx?: Omit<LogEntry, "level" | "message" | "timestamp">) => log("error", msg, ctx),
};
