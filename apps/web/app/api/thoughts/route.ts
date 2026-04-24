import { and, desc, eq } from "drizzle-orm";

import { apiError, apiOk } from "../../../lib/api/response";
import { logBackendError } from "../../../lib/backend-error-logging";
import {
  RequestUserNotAuthenticatedError,
  getRequestUserId,
} from "../../../../../server/auth/get-request-user-id.ts";
import { getDb } from "../../../../../server/db/client.ts";
import { thoughts } from "../../../../../server/db/schema.ts";

class ThoughtsQueryValidationError extends Error {}

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function readOptionalUuid(value: string | null, name: string) {
  if (!value?.trim()) {
    return null;
  }

  const trimmed = value.trim();

  if (!isUuid(trimmed)) {
    throw new ThoughtsQueryValidationError(`Invalid ${name}. Expected a UUID.`);
  }

  return trimmed;
}

function readLimit(value: string | null) {
  if (!value?.trim()) {
    return DEFAULT_LIMIT;
  }

  const limit = Number(value);

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new ThoughtsQueryValidationError(`limit must be an integer between 1 and ${MAX_LIMIT}.`);
  }

  return limit;
}

export async function GET(request: Request) {
  try {
    const userId = getRequestUserId(request.headers);
    const { searchParams } = new URL(request.url);
    const conditions = [eq(thoughts.userId, userId)];
    const mapId = readOptionalUuid(searchParams.get("mapId"), "mapId");
    const sessionId = readOptionalUuid(searchParams.get("sessionId"), "sessionId");

    if (mapId) {
      conditions.push(eq(thoughts.mapId, mapId));
    }

    if (sessionId) {
      conditions.push(eq(thoughts.sessionId, sessionId));
    }

    const rows = await getDb()
      .select({
        id: thoughts.id,
        sessionId: thoughts.sessionId,
        mapId: thoughts.mapId,
        rawText: thoughts.rawText,
        source: thoughts.source,
        metadataJson: thoughts.metadataJson,
        createdAt: thoughts.createdAt,
        updatedAt: thoughts.updatedAt,
      })
      .from(thoughts)
      .where(and(...conditions))
      .orderBy(desc(thoughts.updatedAt), desc(thoughts.createdAt), desc(thoughts.id))
      .limit(readLimit(searchParams.get("limit")));

    return apiOk(
      {
        thoughts: rows.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        })),
      },
    );
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return apiError(error.message, 401);
    }

    if (error instanceof ThoughtsQueryValidationError) {
      return apiError(error.message, 400);
    }

    logBackendError({ error, request, route: "GET /api/thoughts" });
    return apiError("Failed to list thoughts.", 500);
  }
}
