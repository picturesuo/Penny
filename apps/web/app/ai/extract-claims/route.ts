import { NextResponse } from "next/server";

import {
  ExtractClaimsError,
  ExtractClaimsNotFoundError,
  ExtractClaimsValidationError,
  ExtractClaimsWorkspaceError,
  extractClaims,
} from "../../../../../server/ai/operations/extractClaims.ts";
import {
  RequestUserNotAuthenticatedError,
  getRequestUserId,
} from "../../../../../server/auth/get-request-user-id.ts";
import { getIdempotencyKey } from "../../../../../server/idempotency/get-idempotency-key.ts";

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
    const result = await extractClaims(
      {
        thoughtId: body.thoughtId,
      },
      {
        userId,
        requestId,
      },
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof ExtractClaimsValidationError) {
      return NextResponse.json({ error: error.message, issues: error.issues }, { status: 400 });
    }

    if (error instanceof ExtractClaimsNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof ExtractClaimsWorkspaceError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    if (error instanceof ExtractClaimsError) {
      console.error("POST /ai/extract-claims failed", error);
      return NextResponse.json({ error: "Failed to extract claims." }, { status: 502 });
    }

    console.error("POST /ai/extract-claims failed", error);
    return NextResponse.json({ error: "Failed to extract claims." }, { status: 500 });
  }
}
