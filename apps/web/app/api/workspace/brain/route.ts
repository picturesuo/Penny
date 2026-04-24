import { NextResponse } from "next/server";
import {
  RequestUserNotAuthenticatedError,
  getRequestUserId,
} from "../../../../../../server/auth/get-request-user-id.ts";
import { buildBrainView } from "../../../../../../server/projections/build-brain-view.ts";

export async function GET(request: Request) {
  try {
    const userId = getRequestUserId(request.headers);
    const brainView = await buildBrainView({ userId });

    return NextResponse.json(brainView, { status: 200 });
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error("GET /api/workspace/brain failed", error);
    return NextResponse.json({ error: "Failed to build workspace brain view." }, { status: 500 });
  }
}
