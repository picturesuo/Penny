import { apiError, apiOk, invalidJsonResponse, invalidObjectResponse } from "../../../lib/api/response";
import { logBackendError } from "../../../lib/backend-error-logging";
import {
  ExtractClaimsError,
  ExtractClaimsNotFoundError,
  ExtractClaimsValidationError,
  ExtractClaimsWorkspaceError,
  extractClaims,
} from "../../../../../server/ai/operations/extractClaims.ts";
import {
  RequestUserNotAuthenticatedError,
  getRequestUserId,
} from "../../../../../server/auth/get-request-user-id.ts";
import { getIdempotencyKey } from "../../../../../server/idempotency/get-idempotency-key.ts";

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
    const result = await extractClaims(
      {
        thoughtId: body.thoughtId,
      },
      {
        userId,
        requestId,
      },
    );

    return apiOk(result, 201);
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return apiError(error.message, 401);
    }

    if (error instanceof ExtractClaimsValidationError) {
      return apiError(error.message, 400, error.issues);
    }

    if (error instanceof ExtractClaimsNotFoundError) {
      return apiError(error.message, 404);
    }

    if (error instanceof ExtractClaimsWorkspaceError) {
      return apiError(error.message, 409);
    }

    if (error instanceof ExtractClaimsError) {
      logBackendError({ error, request, route: "POST /ai/extract-claims" });
      return apiError("Failed to extract claims.", 502);
    }

    logBackendError({ error, request, route: "POST /ai/extract-claims" });
    return apiError("Failed to extract claims.", 500);
  }
}
