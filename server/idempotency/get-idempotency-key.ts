function readTrimmedHeader(headers: Headers, name: string): string | null {
  const value = headers.get(name);

  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readTrimmedBodyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function getIdempotencyKey(headers: Headers, body?: Record<string, unknown>): string | null {
  return (
    readTrimmedHeader(headers, "idempotency-key") ??
    readTrimmedHeader(headers, "x-idempotency-key") ??
    readTrimmedHeader(headers, "x-request-id") ??
    readTrimmedBodyString(body?.idempotencyKey) ??
    readTrimmedBodyString(body?.requestId) ??
    null
  );
}
