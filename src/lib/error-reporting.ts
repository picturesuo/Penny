import { DEMO_USER_ID } from "@/lib/penny";
import { logger } from "@/lib/logger";

export type ErrorReportContext = {
  userId?: string;
  featureId?: string;
  requestPath?: string;
  requestMethod?: string;
  additionalData?: Record<string, unknown>;
};

export type ErrorLocation = {
  file: string;
  line: number;
  column: number;
};

export type ErrorReportEvent = {
  id: string;
  errorName: string;
  message: string;
  stack: string | null;
  location: ErrorLocation | null;
  userId: string | null;
  featureId: string | null;
  request: {
    path: string | null;
    method: string | null;
  };
  additionalData: Record<string, unknown> | null;
  digest: string | null;
  environment: string;
  capturedAt: string;
};

export function reportError(error: Error, context?: ErrorReportContext): void {
  const event = buildErrorEvent(error, context);
  logger.error(event.message, {
    userId: event.userId ?? undefined,
    featureId: event.featureId ?? undefined,
    error: event.errorName,
    data: {
      id: event.id,
      stack: event.stack,
      location: event.location,
      request: event.request,
      additionalData: event.additionalData,
      digest: event.digest,
      environment: event.environment,
      capturedAt: event.capturedAt,
    },
  });
}

export function buildErrorEvent(error: Error, context?: ErrorReportContext): ErrorReportEvent {
  const stack = typeof error.stack === "string" && error.stack.trim().length > 0 ? error.stack : null;

  return {
    id: crypto.randomUUID(),
    errorName: error.name || "Error",
    message: error.message || "Unknown error",
    stack,
    location: extractLocation(stack),
    userId: context?.userId?.trim() || getDefaultUserId(),
    featureId: context?.featureId?.trim() || null,
    request: {
      path: context?.requestPath?.trim() || null,
      method: context?.requestMethod?.trim() || null,
    },
    additionalData: context?.additionalData ?? null,
    digest: getErrorDigest(error),
    environment: process.env.NODE_ENV ?? "unknown",
    capturedAt: new Date().toISOString(),
  };
}

export function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "string") {
    return new Error(error);
  }

  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error("Unknown error");
  }
}

export function getClientUserId(): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const userId = document.body?.dataset.userId?.trim();
  return userId && userId.length > 0 ? userId : null;
}

export function getRequestUserId(input: { path: string; headers?: Headers | Record<string, string | string[] | undefined> }): string {
  const headerUserId = getHeaderValue(input.headers, ["x-user-id", "x-penny-user-id", "x-demo-user-id"]);
  if (headerUserId) {
    return headerUserId;
  }

  const fromPath = input.path.match(/\/users\/([^/]+)/)?.[1]?.trim();
  return fromPath || DEMO_USER_ID;
}

function getHeaderValue(
  headers: Headers | Record<string, string | string[] | undefined> | undefined,
  names: string[],
): string | null {
  if (!headers) {
    return null;
  }

  for (const name of names) {
    if (headers instanceof Headers) {
      const value = headers.get(name);
      if (value?.trim()) {
        return value.trim();
      }
      continue;
    }

    const value = headers[name] ?? headers[name.toLowerCase()];
    if (Array.isArray(value)) {
      const first = value[0]?.trim();
      if (first) {
        return first;
      }
      continue;
    }

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function getErrorDigest(error: Error): string | null {
  const digest = (error as Error & { digest?: string }).digest;
  return typeof digest === "string" && digest.trim().length > 0 ? digest : null;
}

function extractLocation(stack: string | null): ErrorLocation | null {
  if (!stack) {
    return null;
  }

  const lines = stack.split("\n").map((line) => line.trim());
  for (const line of lines.slice(1)) {
    const match = line.match(/\(?(.+?):(\d+):(\d+)\)?$/);
    if (!match) {
      continue;
    }

    const [, file, lineNumber, columnNumber] = match;
    if (!file || file.includes("node:internal")) {
      continue;
    }

    const parsedLine = Number(lineNumber);
    const parsedColumn = Number(columnNumber);
    if (Number.isNaN(parsedLine) || Number.isNaN(parsedColumn)) {
      continue;
    }

    return {
      file,
      line: parsedLine,
      column: parsedColumn,
    };
  }

  return null;
}

function getDefaultUserId(): string {
  return DEMO_USER_ID;
}
