import { apiError, apiOk } from "../../../../lib/api/response";
import { logBackendError } from "../../../../lib/backend-error-logging";
import {
  RequestUserNotAuthenticatedError,
  getRequestUserId,
} from "../../../../../../server/auth/get-request-user-id.ts";
import { buildLearnView } from "../../../../../../server/projections/build-learn-view.ts";

export async function GET(request: Request) {
  try {
    const userId = getRequestUserId(request.headers);
    const learnView = await buildLearnView({ userId });

    return apiOk(learnView);
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return apiError(error.message, 401);
    }

    logBackendError({ error, request, route: "GET /api/workspace/learn" });
    return apiError("Failed to build workspace learn view.", 500);
  }
}
