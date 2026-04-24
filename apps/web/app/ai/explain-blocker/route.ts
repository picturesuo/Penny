import { apiError, apiOk, invalidJsonResponse, invalidObjectResponse } from "../../lib/api/response";
import { explainBlocker, ExplainBlockerValidationError } from "../../../../../server/ai/operations/explainBlocker.ts";
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
    const output = explainBlocker(body);
    const inputJson = {
      text: readBodyString(body, "text") ?? "",
      ...(readBodyString(body, "sessionId") ? { sessionId: readBodyString(body, "sessionId") } : {}),
    };

    await aiOperationLogDeps.runLoggedAIOperation({
      userId,
      operation: AI_OPERATIONS.explainBlocker,
      inputJson,
      run: () => output,
      eventType: "ai.explain_blocker.completed",
      requestId,
      sessionId: readBodyString(body, "sessionId") ?? null,
    });

    return apiOk(output);
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return apiError(error.message, 401);
    }

    if (error instanceof ExplainBlockerValidationError) {
      return apiError(error.message, 400, error.issues);
    }

    console.error("POST /ai/explain-blocker failed", error);
    return apiError("Failed to explain blocker.", 500);
  }
}
