import { NextResponse } from "next/server";

import { createBrainGraph, createChallengeGraph, createLearnGraph } from "../../../components/graph/graph-adapters.ts";
import {
  RequestUserNotAuthenticatedError,
  getRequestUserId,
} from "../../../../../server/auth/get-request-user-id.ts";
import { buildBrainView } from "../../../../../server/projections/build-brain-view.ts";
import { buildChallengeView } from "../../../../../server/projections/build-challenge-view.ts";
import { buildLearnView } from "../../../../../server/projections/build-learn-view.ts";
import { buildShellView } from "../../../../../server/projections/build-shell-view.ts";

async function buildGraph(userId: string) {
  const shellView = await buildShellView({ userId });

  if (shellView.mode === "challenge") {
    return createChallengeGraph(await buildChallengeView({ userId }));
  }

  if (shellView.mode === "learn") {
    return createLearnGraph(await buildLearnView({ userId }));
  }

  return createBrainGraph(await buildBrainView({ userId }));
}

export async function GET(request: Request) {
  try {
    const userId = getRequestUserId(request.headers);
    const graph = await buildGraph(userId);

    return NextResponse.json(graph, { status: 200 });
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error("GET /api/graph failed", error);
    return NextResponse.json({ error: "Failed to build graph view." }, { status: 500 });
  }
}
