import { apiError, apiOk } from "../../../../lib/api/response";
import { logBackendError } from "../../../../lib/backend-error-logging";
import {
  RequestUserNotAuthenticatedError,
  getRequestUserId,
} from "../../../../../../server/auth/get-request-user-id.ts";
import { buildShellView } from "../../../../../../server/projections/build-shell-view.ts";

export async function GET(request: Request) {
  try {
    const userId = getRequestUserId(request.headers);
    const shellView = await buildShellView({ userId });

    return apiOk(shellView);
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return apiError(error.message, 401);
    }

    logBackendError({ error, request, route: "GET /api/workspace/shell" });
    return apiError("Failed to build workspace shell view.", 500);
  }
}
