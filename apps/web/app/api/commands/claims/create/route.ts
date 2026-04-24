import { apiError, apiOk, invalidJsonResponse, invalidObjectResponse } from "../../../../../lib/api/response";
import { logBackendError } from "../../../../../lib/backend-error-logging";
import {
  CreateClaimMapForbiddenError,
  CreateClaimMapNotFoundError,
  CreateClaimValidationError,
  createClaim,
} from "../../../../../../../server/commands/create-claim.ts";
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
    const result = await createClaim({
      ...body,
      userId,
      requestId,
    });

    return apiOk(result, 201);
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return apiError(error.message, 401);
    }

    if (error instanceof CreateClaimValidationError) {
      return apiError(error.message, 400);
    }

    if (error instanceof CreateClaimMapForbiddenError) {
      return apiError(error.message, 403);
    }

    if (error instanceof CreateClaimMapNotFoundError) {
      return apiError(error.message, 404);
    }

    logBackendError({ error, request, route: "POST /api/commands/claims/create" });
    return apiError("Failed to create claim.", 500);
  }
}
