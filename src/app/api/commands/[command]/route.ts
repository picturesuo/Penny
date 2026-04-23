import { NextResponse, type NextRequest } from "next/server";
import {
  createClaim,
  respondToChallengeRound,
  startChallenge,
  submitTeachback,
  updateWorkspaceSelection,
} from "@/server/workspace-commands";
import {
  WorkspaceCommandSchema,
  buildRateLimitJsonResponse,
  checkWorkspaceRouteRateLimit,
  createRouteErrorResponse,
  getAuthenticatedRouteUserId,
  parseJsonObjectBody,
  withUserId,
} from "@/server/workspace-route-helpers";

export async function POST(request: NextRequest, context: RouteContext<"/api/commands/[command]">) {
  const userId = await getAuthenticatedRouteUserId();
  const rateLimit = checkWorkspaceRouteRateLimit(userId);

  if (!rateLimit.allowed) {
    return buildRateLimitJsonResponse(rateLimit);
  }

  try {
    const { command } = await context.params;
    const parsedCommand = WorkspaceCommandSchema.parse(command);
    const body = withUserId(await parseJsonObjectBody(request), userId);

    switch (parsedCommand) {
      case "create-claim": {
        const result = await createClaim(body);
        return NextResponse.json(
          {
            claim: result.record,
            events: result.events,
            invalidation: result.invalidation,
          },
          { status: 201 },
        );
      }

      case "update-workspace-selection": {
        const result = await updateWorkspaceSelection(body);
        return NextResponse.json(
          {
            workspaceContext: result.record,
            events: result.events,
            invalidation: result.invalidation,
          },
          { status: 200 },
        );
      }

      case "start-challenge": {
        const result = await startChallenge(body);
        return NextResponse.json(
          {
            round: result.record,
            events: result.events,
            invalidation: result.invalidation,
          },
          { status: 201 },
        );
      }

      case "respond-to-challenge": {
        const result = await respondToChallengeRound(body);
        return NextResponse.json(
          {
            round: result.record,
            events: result.events,
            invalidation: result.invalidation,
          },
          { status: 200 },
        );
      }

      case "submit-teachback": {
        const result = await submitTeachback(body);
        return NextResponse.json(
          {
            learningPrompt: result.record,
            events: result.events,
            invalidation: result.invalidation,
          },
          { status: 200 },
        );
      }

      default:
        return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
  } catch (error) {
    return createRouteErrorResponse(error, request, {
      userId,
      featureId: "workspace-command-route",
      logMessage: "workspace_command_route_failed",
    });
  }
}
