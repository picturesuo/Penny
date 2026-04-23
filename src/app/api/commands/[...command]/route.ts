import { type NextRequest } from "next/server";
import {
  createClaim,
  createMap,
  recordChallengeResponse,
  requestChallengeCritique,
  setWorkspaceSelection,
  startChallengeRound,
  updateClaim,
} from "@/server/workspace-commands";
import {
  WorkspaceCommandSchema,
  buildRateLimitJsonResponse,
  checkWorkspaceRouteRateLimit,
  createRouteErrorResponse,
  createWorkspaceCommandResponse,
  getAuthenticatedRouteUserId,
  parseJsonObjectBody,
  withUserId,
} from "@/server/workspace-route-helpers";

export async function POST(request: NextRequest, context: RouteContext<"/api/commands/[...command]">) {
  const userId = await getAuthenticatedRouteUserId();
  const rateLimit = checkWorkspaceRouteRateLimit(userId);

  if (!rateLimit.allowed) {
    return buildRateLimitJsonResponse(rateLimit);
  }

  try {
    const { command } = await context.params;
    const parsedCommand = WorkspaceCommandSchema.parse(command.join("/"));
    const body = withUserId(await parseJsonObjectBody(request), userId);

    switch (parsedCommand) {
      case "maps/create": {
        const result = await createMap(body);
        return createWorkspaceCommandResponse(
          "map",
          {
            map: result.record,
            events: result.events,
            invalidation: result.invalidation,
          },
          201,
        );
      }

      case "claims/create": {
        const result = await createClaim(body);
        return createWorkspaceCommandResponse(
          "claim",
          {
            claim: result.record,
            events: result.events,
            invalidation: result.invalidation,
          },
          201,
        );
      }

      case "claims/update": {
        const result = await updateClaim(body);
        return createWorkspaceCommandResponse(
          "claim",
          {
            claim: result.record,
            events: result.events,
            invalidation: result.invalidation,
          },
          200,
        );
      }

      case "workspace/set-selection": {
        const result = await setWorkspaceSelection(body);
        return createWorkspaceCommandResponse(
          "workspaceContext",
          {
            workspaceContext: result.record,
            events: result.events,
            invalidation: result.invalidation,
          },
          200,
        );
      }

      case "challenge/start-round": {
        const result = await startChallengeRound(body);
        return createWorkspaceCommandResponse(
          "round",
          {
            round: result.record,
            events: result.events,
            invalidation: result.invalidation,
          },
          201,
        );
      }

      case "challenge/generate-critique": {
        const result = await requestChallengeCritique(body);
        return createWorkspaceCommandResponse(
          "critique",
          {
            critique: result.record,
            events: result.events,
            invalidation: result.invalidation,
          },
          202,
        );
      }

      case "challenge/respond": {
        const result = await recordChallengeResponse(body);
        return createWorkspaceCommandResponse(
          "round",
          {
            round: result.record,
            events: result.events,
            invalidation: result.invalidation,
          },
          200,
        );
      }

      default:
        return Response.json({ error: "not_found" }, { status: 404 });
    }
  } catch (error) {
    return createRouteErrorResponse(error, request, {
      userId,
      featureId: "workspace-command-route",
      logMessage: "workspace_command_route_failed",
    });
  }
}
