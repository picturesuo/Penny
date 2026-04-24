import { NextResponse } from "next/server";

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

    return NextResponse.json(shellView, { status: 200 });
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    logBackendError({ error, request, route: "GET /api/workspace/shell" });
    return NextResponse.json({ error: "Failed to build workspace shell view." }, { status: 500 });
  }
}
