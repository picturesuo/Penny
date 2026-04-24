import { NextResponse } from "next/server";
import { getRequestUserId } from "../../../../../../server/auth/get-request-user-id.ts";
import { buildShellView } from "../../../../../../server/projections/build-shell-view.ts";

export async function GET(request: Request) {
  try {
    const userId = getRequestUserId(request.headers);
    const shellView = await buildShellView({ userId });

    return NextResponse.json(shellView, { status: 200 });
  } catch (error) {
    console.error("GET /api/workspace/shell failed", error);
    return NextResponse.json({ error: "Failed to build workspace shell view." }, { status: 500 });
  }
}
