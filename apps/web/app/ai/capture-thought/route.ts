import { apiError, apiOk, invalidJsonResponse, invalidObjectResponse } from "../../../lib/api/response";
import {
  CaptureThoughtError,
  CaptureThoughtValidationError,
  CaptureThoughtWorkspaceError,
  captureThoughtAndPersist,
} from "../../../../../server/ai/operations/captureThought.ts";
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
    const result = await captureThoughtAndPersist(
      {
        text: body.text,
        sessionId: body.sessionId,
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

    if (error instanceof CaptureThoughtValidationError) {
      return apiError(error.message, 400, error.issues);
    }

    if (error instanceof CaptureThoughtWorkspaceError) {
      return apiError(error.message, 409);
    }

    if (error instanceof CaptureThoughtError) {
      console.error("POST /ai/capture-thought failed", error);
      return apiError("Failed to capture thought.", 502);
    }

    console.error("POST /ai/capture-thought failed", error);
    return apiError("Failed to capture thought.", 500);
  }
}
