export type BackendErrorLogEntry = {
  type: "backend_error";
  route: string;
  method: string;
  path: string;
  requestId: string | null;
  errorName: string;
  errorMessage: string;
  errorStack?: string;
  timestamp: string;
};

function readError(error: unknown) {
  if (error instanceof Error) {
    return {
      errorName: error.name || "Error",
      errorMessage: error.message || "Unknown backend error.",
      errorStack: error.stack,
    };
  }

  return {
    errorName: "NonError",
    errorMessage: typeof error === "string" && error.trim() ? error : "Unknown backend error.",
    errorStack: undefined,
  };
}

export function buildBackendErrorLogEntry(input: {
  error: unknown;
  request: Request;
  route: string;
  now?: Date;
}): BackendErrorLogEntry {
  const url = new URL(input.request.url);
  const parsedError = readError(input.error);
  const entry: BackendErrorLogEntry = {
    type: "backend_error",
    route: input.route,
    method: input.request.method,
    path: `${url.pathname}${url.search}`,
    requestId: input.request.headers.get("x-request-id")?.trim() || null,
    errorName: parsedError.errorName,
    errorMessage: parsedError.errorMessage,
    timestamp: (input.now ?? new Date()).toISOString(),
  };

  if (parsedError.errorStack) {
    entry.errorStack = parsedError.errorStack;
  }

  return entry;
}

export function logBackendError(input: { error: unknown; request: Request; route: string; now?: Date }) {
  const entry = buildBackendErrorLogEntry(input);

  console.error(JSON.stringify(entry));

  return entry;
}
