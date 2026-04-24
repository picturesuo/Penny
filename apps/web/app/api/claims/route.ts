import { and, desc, eq } from "drizzle-orm";

import { apiError, apiOk } from "../../../lib/api/response";
import { logBackendError } from "../../../lib/backend-error-logging";
import {
  RequestUserNotAuthenticatedError,
  getRequestUserId,
} from "../../../../../server/auth/get-request-user-id.ts";
import { getDb } from "../../../../../server/db/client.ts";
import { claims } from "../../../../../server/db/schema.ts";

class ClaimsQueryValidationError extends Error {}

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
    throw new ClaimsQueryValidationError(`Invalid ${name}. Expected a UUID.`);
  }

  return trimmed;
}

function readLimit(value: string | null) {
  if (!value?.trim()) {
    return DEFAULT_LIMIT;
  }

  const limit = Number(value);

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new ClaimsQueryValidationError(`limit must be an integer between 1 and ${MAX_LIMIT}.`);
  }

  return limit;
}

function readOffset(value: string | null) {
  if (!value?.trim()) {
    return DEFAULT_OFFSET;
  }

  const offset = Number(value);

  if (!Number.isInteger(offset) || offset < 0) {
    throw new ClaimsQueryValidationError("offset must be a non-negative integer.");
  }

  return offset;
}

export async function GET(request: Request) {
  try {
    const userId = getRequestUserId(request.headers);
    const { searchParams } = new URL(request.url);
    const conditions = [eq(claims.userId, userId)];
    const mapId = readOptionalUuid(searchParams.get("mapId"), "mapId");
    const thoughtId = readOptionalUuid(searchParams.get("thoughtId"), "thoughtId");
    const limit = readLimit(searchParams.get("limit"));
    const offset = readOffset(searchParams.get("offset"));

    if (mapId) {
      conditions.push(eq(claims.mapId, mapId));
    }

    if (thoughtId) {
      conditions.push(eq(claims.thoughtId, thoughtId));
    }

    const rows = await getDb()
      .select({
        id: claims.id,
        mapId: claims.mapId,
        thoughtId: claims.thoughtId,
        body: claims.body,
        confidenceBps: claims.confidenceBps,
        createdAt: claims.createdAt,
        updatedAt: claims.updatedAt,
      })
      .from(claims)
      .where(and(...conditions))
      .orderBy(desc(claims.updatedAt), desc(claims.createdAt), desc(claims.id))
      .limit(limit)
      .offset(offset);

    return apiOk(
      {
        claims: rows.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        })),
        pagination: {
          limit,
          offset,
          nextOffset: rows.length === limit ? offset + limit : null,
        },
      },
    );
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return apiError(error.message, 401);
    }

    if (error instanceof ClaimsQueryValidationError) {
      return apiError(error.message, 400);
    }

    logBackendError({ error, request, route: "GET /api/claims" });
    return apiError("Failed to list claims.", 500);
  }
}
