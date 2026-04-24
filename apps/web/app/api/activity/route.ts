import { and, desc, eq } from "drizzle-orm";

import { apiError, apiOk } from "../../../lib/api/response";
import { logBackendError } from "../../../lib/backend-error-logging";
import {
  RequestUserNotAuthenticatedError,
  getRequestUserId,
} from "../../../../../server/auth/get-request-user-id.ts";
import { getDb } from "../../../../../server/db/client.ts";
import { activityEvents } from "../../../../../server/db/schema.ts";

class ActivityQueryValidationError extends Error {}

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function readOptionalUuid(value: string | null, name: string) {
  if (!value?.trim()) {
    return null;
  }

  const trimmed = value.trim();

  if (!isUuid(trimmed)) {
    throw new ActivityQueryValidationError(`Invalid ${name}. Expected a UUID.`);
  }

  return trimmed;
}

function readOptionalText(value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 120) : null;
}

function readLimit(value: string | null) {
  if (!value?.trim()) {
    return DEFAULT_LIMIT;
  }

  const limit = Number(value);

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new ActivityQueryValidationError(`limit must be an integer between 1 and ${MAX_LIMIT}.`);
  }

  return limit;
}

function readOffset(value: string | null) {
  if (!value?.trim()) {
    return DEFAULT_OFFSET;
  }

  const offset = Number(value);

  if (!Number.isInteger(offset) || offset < 0) {
    throw new ActivityQueryValidationError("offset must be a non-negative integer.");
  }

  return offset;
}

export async function GET(request: Request) {
  try {
    const userId = getRequestUserId(request.headers);
    const { searchParams } = new URL(request.url);
    const conditions = [eq(activityEvents.userId, userId)];
    const sessionId = readOptionalUuid(searchParams.get("sessionId"), "sessionId");
    const mapId = readOptionalUuid(searchParams.get("mapId"), "mapId");
    const thoughtId = readOptionalUuid(searchParams.get("thoughtId"), "thoughtId");
    const claimId = readOptionalUuid(searchParams.get("claimId"), "claimId");
    const type = readOptionalText(searchParams.get("type"));
    const limit = readLimit(searchParams.get("limit"));
    const offset = readOffset(searchParams.get("offset"));

    if (sessionId) {
      conditions.push(eq(activityEvents.sessionId, sessionId));
    }

    if (mapId) {
      conditions.push(eq(activityEvents.mapId, mapId));
    }

    if (thoughtId) {
      conditions.push(eq(activityEvents.thoughtId, thoughtId));
    }

    if (claimId) {
      conditions.push(eq(activityEvents.claimId, claimId));
    }

    if (type) {
      conditions.push(eq(activityEvents.type, type));
    }

    const rows = await getDb()
      .select({
        id: activityEvents.id,
        sessionId: activityEvents.sessionId,
        mapId: activityEvents.mapId,
        thoughtId: activityEvents.thoughtId,
        claimId: activityEvents.claimId,
        graphNodeId: activityEvents.graphNodeId,
        graphEdgeId: activityEvents.graphEdgeId,
        confidenceRatingId: activityEvents.confidenceRatingId,
        promptVersionId: activityEvents.promptVersionId,
        aiJobId: activityEvents.aiJobId,
        aggregateType: activityEvents.aggregateType,
        aggregateId: activityEvents.aggregateId,
        type: activityEvents.type,
        payloadJson: activityEvents.payloadJson,
        requestId: activityEvents.requestId,
        createdAt: activityEvents.createdAt,
      })
      .from(activityEvents)
      .where(and(...conditions))
      .orderBy(desc(activityEvents.createdAt), desc(activityEvents.id))
      .limit(limit)
      .offset(offset);

    return apiOk({
      activity: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
      pagination: {
        limit,
        offset,
        nextOffset: rows.length === limit ? offset + limit : null,
      },
    });
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return apiError(error.message, 401);
    }

    if (error instanceof ActivityQueryValidationError) {
      return apiError(error.message, 400);
    }

    logBackendError({ error, request, route: "GET /api/activity" });
    return apiError("Failed to list activity.", 500);
  }
}
