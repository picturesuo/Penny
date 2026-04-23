import { type NextRequest } from "next/server";
import { z } from "zod";
import { listChallengeCritiqueJobs } from "@/server/challenge-critique-job-monitor";
import {
  buildRateLimitJsonResponse,
  checkWorkspaceRouteRateLimit,
  createRouteErrorResponse,
  getAuthenticatedRouteUserId,
} from "@/server/workspace-route-helpers";

const QuerySchema = z.object({
  mapId: z.string().uuid("Invalid mapId.").nullable().optional().default(null),
  claimId: z.string().uuid("Invalid claimId.").nullable().optional().default(null),
  roundId: z.string().uuid("Invalid roundId.").nullable().optional().default(null),
  status: z.enum(["queued", "running", "succeeded", "failed", "validation_failed"]).nullable().optional().default(null),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
});

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedRouteUserId();
  const rateLimit = checkWorkspaceRouteRateLimit(userId);

  if (!rateLimit.allowed) {
    return buildRateLimitJsonResponse(rateLimit);
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const query = QuerySchema.parse({
      mapId: searchParams.get("mapId") ?? undefined,
      claimId: searchParams.get("claimId") ?? undefined,
      roundId: searchParams.get("roundId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    const monitor = await listChallengeCritiqueJobs({
      userId,
      ...query,
    });

    return Response.json({ monitor }, { status: 200 });
  } catch (error) {
    return createRouteErrorResponse(error, request, {
      userId,
      featureId: "challenge-critique-job-monitor-route",
      logMessage: "challenge_critique_job_monitor_route_failed",
    });
  }
}
