import { pathToFileURL } from "node:url";

import { apiError, apiOk, invalidJsonResponse, invalidObjectResponse } from "../../../../../lib/api/response";
import { logBackendError } from "../../../../../lib/backend-error-logging";
import {
  RequestUserNotAuthenticatedError,
  getRequestUserId,
} from "../../../../../../../server/auth/get-request-user-id.ts";
import { getIdempotencyKey } from "../../../../../../../server/idempotency/get-idempotency-key.ts";

type StartChallengeRoundModule = {
  startChallengeRound(input: unknown): Promise<unknown>;
};

const importServerModule = new Function("specifier", "return import(specifier);") as (
  specifier: string,
) => Promise<StartChallengeRoundModule>;
const startChallengeRoundUrl = pathToFileURL(`${process.cwd()}/../../server/commands/start-challenge-round.ts`).href;

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
    const { startChallengeRound } = await importServerModule(startChallengeRoundUrl);
    const result = await startChallengeRound({
      ...body,
      userId,
      requestId,
    });

    return apiOk(result, 201);
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return apiError(error.message, 401);
    }

    if (error instanceof Error && error.name === "StartChallengeRoundValidationError") {
      return apiError(error.message, 400);
    }

    if (error instanceof Error && error.name === "StartChallengeRoundClaimForbiddenError") {
      return apiError(error.message, 403);
    }

    if (error instanceof Error && error.name === "StartChallengeRoundClaimNotFoundError") {
      return apiError(error.message, 404);
    }

    logBackendError({ error, request, route: "POST /api/commands/challenge/start" });
    return apiError("Failed to start challenge round.", 500);
  }
}
