import { apiError, apiOk } from "../../../../lib/api/response";
import { logBackendError } from "../../../../lib/backend-error-logging";
import {
  RequestUserNotAuthenticatedError,
  getRequestUserId,
} from "../../../../../../server/auth/get-request-user-id.ts";
import { buildChallengeView } from "../../../../../../server/projections/build-challenge-view.ts";

export async function GET(request: Request) {
  try {
    const userId = getRequestUserId(request.headers);
    const challengeView = await buildChallengeView({ userId });

    return apiOk(challengeView);
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return apiError(error.message, 401);
    }

    logBackendError({ error, request, route: "GET /api/workspace/challenge" });
    return apiError("Failed to build workspace challenge view.", 500);
  }
}
