import { apiError, apiOk } from "../../../../lib/api/response";
import { logBackendError } from "../../../../lib/backend-error-logging";
import {
  RequestUserNotAuthenticatedError,
  getRequestUserId,
} from "../../../../../../server/auth/get-request-user-id.ts";
import { buildBrainView } from "../../../../../../server/projections/build-brain-view.ts";

export async function GET(request: Request) {
  try {
    const userId = getRequestUserId(request.headers);
    const brainView = await buildBrainView({ userId });

    return apiOk(brainView);
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return apiError(error.message, 401);
    }

    logBackendError({ error, request, route: "GET /api/workspace/brain" });
    return apiError("Failed to build workspace brain view.", 500);
  }
}
