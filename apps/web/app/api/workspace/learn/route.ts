import { NextResponse } from "next/server";

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

    return NextResponse.json(learnView, { status: 200 });
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    logBackendError({ error, request, route: "GET /api/workspace/learn" });
    return NextResponse.json({ error: "Failed to build workspace learn view." }, { status: 500 });
  }
}
