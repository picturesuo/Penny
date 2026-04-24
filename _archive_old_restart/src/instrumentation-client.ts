import { getClientUserId, normalizeError, reportError } from "@/lib/error-reporting";
import { getDemoThoughtUserId } from "@/lib/thought-map";

function captureClientError(error: Error, additionalData: Record<string, unknown>) {
  reportError(error, {
    userId: getClientUserId() ?? getDemoThoughtUserId(),
    requestPath: window.location.pathname + window.location.search,
    requestMethod: "CLIENT",
    featureId: "client-runtime",
    additionalData,
  });
}

window.addEventListener("error", (event) => {
  const error = event.error instanceof Error ? event.error : new Error(event.message || "Unhandled client error");
  captureClientError(error, {
    source: "window.error",
    filename: event.filename || null,
    lineNumber: event.lineno || null,
    columnNumber: event.colno || null,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  const error = event.reason instanceof Error ? event.reason : normalizeError(event.reason);
  captureClientError(error, {
    source: "window.unhandledrejection",
    reasonType: typeof event.reason,
  });
});
