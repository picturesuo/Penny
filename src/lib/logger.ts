export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEntry = {
  level: LogLevel;
  message: string;
  timestamp: string;
  userId?: string;
  featureId?: string;
  durationMs?: number;
  error?: string;
  data?: Record<string, unknown>;
};

export function log(level: LogLevel, message: string, context?: Omit<LogEntry, "level" | "message" | "timestamp">): void {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };

  if (process.env.NODE_ENV === "development") {
    const prefix = {
      debug: "🔵",
      info: "🟢",
      warn: "🟡",
      error: "🔴",
    }[level];

    console.log(`${prefix} [${entry.timestamp}] ${message}`, context || "");
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
