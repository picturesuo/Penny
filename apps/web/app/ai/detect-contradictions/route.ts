import { apiError, apiOk, invalidJsonResponse, invalidObjectResponse } from "../../../lib/api/response";
import {
  DetectContradictionsTargetNotFoundError,
  DetectContradictionsValidationError,
  detectContradictions,
} from "../../../../../server/ai/operations/detectContradictions.ts";
import {
  RequestUserNotAuthenticatedError,
  getRequestUserId,
} from "../../../../../server/auth/get-request-user-id.ts";

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
    const result = await detectContradictions({
      userId,
      targetType: body.targetType,
      targetId: body.targetId,
      autoCreate: body.autoCreate,
    });

    return apiOk(result);
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return apiError(error.message, 401);
    }

    if (error instanceof DetectContradictionsValidationError) {
      return apiError(error.message, 400);
    }

    if (error instanceof DetectContradictionsTargetNotFoundError) {
      return apiError("Target not found.", 404);
    }

    console.error("POST /ai/detect-contradictions failed", error);
    return apiError("Failed to detect contradictions.", 500);
  }
}
