export type RequestLogEntry = {
  type: "request";
  method: string;
  path: string;
  requestId: string;
  timestamp: string;
};

export function getRequestId(headers: Headers) {
  return headers.get("x-request-id")?.trim() || crypto.randomUUID();
}

export function buildRequestLogEntry(request: Request, requestId: string, now = new Date()): RequestLogEntry {
  const url = new URL(request.url);

  return {
    type: "request",
    method: request.method,
    path: `${url.pathname}${url.search}`,
    requestId,
    timestamp: now.toISOString(),
  };
}

export function logRequest(request: Request, requestId: string, now = new Date()) {
  const entry = buildRequestLogEntry(request, requestId, now);

  console.info(JSON.stringify(entry));

  return entry;
}
