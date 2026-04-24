import { NextResponse } from "next/server";

import { logBackendError } from "../../../../../lib/backend-error-logging";
import { CreateMapValidationError, createMap } from "../../../../../../../server/commands/create-map.ts";
import {
  RequestUserNotAuthenticatedError,
  getRequestUserId,
} from "../../../../../../../server/auth/get-request-user-id.ts";
import { getIdempotencyKey } from "../../../../../../../server/idempotency/get-idempotency-key.ts";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!isObject(body)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  try {
    const userId = getRequestUserId(request.headers);
    const requestId = getIdempotencyKey(request.headers, body);
    const result = await createMap({
      ...body,
      userId,
      requestId,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof CreateMapValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    logBackendError({ error, request, route: "POST /api/commands/maps/create" });
    return NextResponse.json({ error: "Failed to create map." }, { status: 500 });
  }
}
