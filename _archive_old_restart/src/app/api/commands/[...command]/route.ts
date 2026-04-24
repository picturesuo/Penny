import { type NextRequest } from "next/server";
import {
  createClaim,
  createMap,
  generateLearningPrompt,
  recordChallengeResponse,
  requestChallengeCritique,
  setWorkspaceSelection,
  startChallengeRound,
  submitTeachback,
  updateClaim,
  workspaceCommandSchemas,
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

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: RouteContext<"/api/commands/[...command]">) {
  const userId = await getAuthenticatedRouteUserId();
  const rateLimit = checkWorkspaceRouteRateLimit(userId);

  if (!rateLimit.allowed) {
    return buildRateLimitJsonResponse(rateLimit);
  }

  try {
    const { command } = await context.params;
    const parsedCommand = WorkspaceCommandSchema.parse(command.join("/"));
    const rawBody = withUserId(await parseJsonObjectBody(request), userId);

    switch (parsedCommand) {
      case "maps/create": {
        const result = await createMap(workspaceCommandSchemas.createMap.parse(rawBody));
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
        const result = await createClaim(workspaceCommandSchemas.createClaim.parse(rawBody));
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
        const result = await updateClaim(workspaceCommandSchemas.updateClaim.parse(rawBody));
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
        const result = await setWorkspaceSelection(workspaceCommandSchemas.setWorkspaceSelection.parse(rawBody));
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
        const result = await startChallengeRound(workspaceCommandSchemas.startChallengeRound.parse(rawBody));
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
        const result = await requestChallengeCritique(workspaceCommandSchemas.requestChallengeCritique.parse(rawBody));
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
        const result = await recordChallengeResponse(workspaceCommandSchemas.recordChallengeResponse.parse(rawBody));
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

      case "learning/generate-prompt": {
        const result = await generateLearningPrompt(workspaceCommandSchemas.generateLearningPrompt.parse(rawBody));
        return createWorkspaceCommandResponse(
          "learningPrompt",
          {
            learningPrompt: result.record,
            events: result.events,
            invalidation: result.invalidation,
          },
          201,
        );
      }

      case "learning/submit-teachback": {
        const result = await submitTeachback(workspaceCommandSchemas.submitTeachback.parse(rawBody));
        return createWorkspaceCommandResponse(
          "learningPrompt",
          {
            learningPrompt: result.record,
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
