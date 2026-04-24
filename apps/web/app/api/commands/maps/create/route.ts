import { apiError, apiOk, invalidJsonResponse, invalidObjectResponse } from "../../../../../lib/api/response";
import { logBackendError } from "../../../../../lib/backend-error-logging";
import { CreateMapValidationError, createMap } from "../../../../../../../server/commands/create-map.ts";
import {
  RequestUserNotAuthenticatedError,
  getRequestUserId,
} from "../../../../../../../server/auth/get-request-user-id.ts";
import { getIdempotencyKey } from "../../../../../../../server/idempotency/get-idempotency-key.ts";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return invalidJsonResponse();
  }

  if (!isObject(body)) {
    return invalidObjectResponse();
  }

  try {
    const userId = getRequestUserId(request.headers);
    const requestId = getIdempotencyKey(request.headers, body);
    const result = await createMap({
      ...body,
      userId,
      requestId,
    });

    return apiOk(result, 201);
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return apiError(error.message, 401);
    }

    if (error instanceof CreateMapValidationError) {
      return apiError(error.message, 400);
    }

    logBackendError({ error, request, route: "POST /api/commands/maps/create" });
    return apiError("Failed to create map.", 500);
  }
}
