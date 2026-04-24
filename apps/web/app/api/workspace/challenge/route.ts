import { NextResponse } from "next/server";

import {
  RequestUserNotAuthenticatedError,
  getRequestUserId,
} from "../../../../../../server/auth/get-request-user-id.ts";
import { buildChallengeView } from "../../../../../../server/projections/build-challenge-view.ts";

export async function GET(request: Request) {
  try {
    const userId = getRequestUserId(request.headers);
    const challengeView = await buildChallengeView({ userId });

    return NextResponse.json(challengeView, { status: 200 });
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error("GET /api/workspace/challenge failed", error);
    return NextResponse.json({ error: "Failed to build workspace challenge view." }, { status: 500 });
  }
}
