import { apiError, apiOk, invalidJsonResponse, invalidObjectResponse } from "../../../lib/api/response";
import { logBackendError } from "../../../lib/backend-error-logging";
import {
  SummarizeMapNotFoundError,
  SummarizeMapValidationError,
  summarizeMap,
} from "../../../../../server/ai/operations/summarizeMap.ts";
import { aiOperationLogDeps } from "../../../../../server/ai/services/ai-operation-log.ts";
import { AI_OPERATIONS } from "../../../../../server/ai/services/operation-names.ts";
import {
  RequestUserNotAuthenticatedError,
  getRequestUserId,
} from "../../../../../server/auth/get-request-user-id.ts";
import { getIdempotencyKey } from "../../../../../server/idempotency/get-idempotency-key.ts";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readBodyString(body: Record<string, unknown>, fieldName: string) {
  const value = body[fieldName];
  return typeof value === "string" ? value.trim() : undefined;
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
    const mapId = readBodyString(body, "mapId") ?? "";

    if (!mapId) {
      return apiError("mapId must not be blank.", 400, ["mapId must not be blank."]);
    }

    const inputJson = { mapId };
    const output = await aiOperationLogDeps.runLoggedAIOperation({
      userId,
      operation: AI_OPERATIONS.summarizeMap,
      inputJson,
      run: () => summarizeMap({ userId, mapId }),
      eventType: "ai.summarize_map.completed",
      requestId,
      mapId,
    });

    return apiOk(output.output);
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return apiError(error.message, 401);
    }

    if (error instanceof SummarizeMapValidationError) {
      return apiError(error.message, 400, error.issues);
    }

    if (error instanceof SummarizeMapNotFoundError) {
      return apiError("Map not found.", 404);
    }

    logBackendError({ error, request, route: "POST /ai/summarize-map" });
    return apiError("Failed to summarize map.", 500);
  }
}
