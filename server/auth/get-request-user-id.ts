const PLACEHOLDER_USER_ID = "00000000-0000-0000-0000-000000000001";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function getRequestUserId(headers: Headers) {
  const headerValue = headers.get("x-user-id") ?? headers.get("x-penny-user-id");

  if (!headerValue) {
    return PLACEHOLDER_USER_ID;
  }

  const trimmed = headerValue.trim();

  if (!isUuid(trimmed)) {
    return PLACEHOLDER_USER_ID;
  }

  return trimmed;
}
