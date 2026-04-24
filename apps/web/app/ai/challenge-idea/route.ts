import { apiError, apiOk, invalidJsonResponse, invalidObjectResponse } from "../../../lib/api/response";
import { logBackendError } from "../../../lib/backend-error-logging";
import { challengeIdea, ChallengeIdeaValidationError } from "../../../../../server/ai/operations/challengeIdea.ts";
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
    const output = challengeIdea(body);
    const inputJson = {
      ...(typeof body.thoughtId === "string" ? { thoughtId: body.thoughtId.trim() } : {}),
      ...(typeof body.claimId === "string" ? { claimId: body.claimId.trim() } : {}),
      ...(typeof body.text === "string" ? { text: body.text.trim() } : {}),
    };

    await aiOperationLogDeps.runLoggedAIOperation({
      userId,
      operation: AI_OPERATIONS.challengeIdea,
      inputJson,
      run: () => output,
      eventType: "ai.challenge_idea.completed",
      requestId,
      thoughtId: typeof body.thoughtId === "string" ? body.thoughtId.trim() : null,
      claimId: typeof body.claimId === "string" ? body.claimId.trim() : null,
    });

    return apiOk(output);
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return apiError(error.message, 401);
    }

    if (error instanceof ChallengeIdeaValidationError) {
      return apiError(error.message, 400, error.issues);
    }

    logBackendError({ error, request, route: "POST /ai/challenge-idea" });
    return apiError("Failed to challenge idea.", 500);
  }
}
