import { NextResponse, type NextRequest } from "next/server";
import {
  buildBrainView,
  buildChallengeView,
  buildLearnView,
  buildWorkspaceShellView,
} from "@/server/workspace-projections";
import {
  WorkspaceViewSchema,
  buildRateLimitJsonResponse,
  checkWorkspaceRouteRateLimit,
  createRouteErrorResponse,
  createWorkspaceReadResponse,
  getAuthenticatedRouteUserId,
  parseWorkspaceProjectionInput,
} from "@/server/workspace-route-helpers";

export async function GET(request: NextRequest, context: RouteContext<"/api/workspace/[view]">) {
  const userId = await getAuthenticatedRouteUserId();
  const rateLimit = checkWorkspaceRouteRateLimit(userId);

  if (!rateLimit.allowed) {
    return buildRateLimitJsonResponse(rateLimit);
  }

  try {
    const { view } = await context.params;
    const parsedView = WorkspaceViewSchema.parse(view);
    const input = {
      userId,
      ...parseWorkspaceProjectionInput(request, parsedView),
    };

    switch (parsedView) {
      case "shell":
        return createWorkspaceReadResponse(parsedView, await buildWorkspaceShellView(input));
      case "brain":
        return createWorkspaceReadResponse(parsedView, await buildBrainView(input));
      case "challenge":
        return createWorkspaceReadResponse(parsedView, await buildChallengeView(input));
      case "learn":
        return createWorkspaceReadResponse(parsedView, await buildLearnView(input));
      default:
        return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
  } catch (error) {
    return createRouteErrorResponse(error, request, {
      userId,
      featureId: "workspace-read-route",
      logMessage: "workspace_read_route_failed",
    });
  }
}
