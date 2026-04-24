function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export class RequestUserNotAuthenticatedError extends Error {
  constructor() {
    super("Authenticated user is required.");
    this.name = "RequestUserNotAuthenticatedError";
  }
}

export function getRequestUserId(headers: Headers) {
  const headerValue = headers.get("x-user-id") ?? headers.get("x-penny-user-id");

  if (!headerValue) {
    throw new RequestUserNotAuthenticatedError();
  }

  const trimmed = headerValue.trim();

  if (!isUuid(trimmed)) {
    throw new RequestUserNotAuthenticatedError();
  }

  return trimmed;
}
