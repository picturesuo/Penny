import { desc, eq } from "drizzle-orm";

import { apiError, apiOk } from "../../../lib/api/response";
import { logBackendError } from "../../../lib/backend-error-logging";
import {
  RequestUserNotAuthenticatedError,
  getRequestUserId,
} from "../../../../../server/auth/get-request-user-id.ts";
import { getDb } from "../../../../../server/db/client.ts";
import { sessions } from "../../../../../server/db/schema.ts";

class SessionsQueryValidationError extends Error {}

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

function readLimit(value: string | null) {
  if (!value?.trim()) {
    return DEFAULT_LIMIT;
  }

  const limit = Number(value);

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new SessionsQueryValidationError(`limit must be an integer between 1 and ${MAX_LIMIT}.`);
  }

  return limit;
}

export async function GET(request: Request) {
  try {
    const userId = getRequestUserId(request.headers);
    const { searchParams } = new URL(request.url);
    const rows = await getDb()
      .select({
        id: sessions.id,
        expiresAt: sessions.expiresAt,
        revokedAt: sessions.revokedAt,
        createdAt: sessions.createdAt,
        updatedAt: sessions.updatedAt,
      })
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.createdAt), desc(sessions.id))
      .limit(readLimit(searchParams.get("limit")));

    return apiOk(
      {
        sessions: rows.map((row) => ({
          ...row,
          expiresAt: row.expiresAt.toISOString(),
          revokedAt: row.revokedAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        })),
      },
    );
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return apiError(error.message, 401);
    }

    if (error instanceof SessionsQueryValidationError) {
      return apiError(error.message, 400);
    }

    logBackendError({ error, request, route: "GET /api/sessions" });
    return apiError("Failed to list sessions.", 500);
  }
}
