import { NextResponse } from "next/server";

import {
  RequestChallengeCritiqueRoundNotFoundError,
  RequestChallengeCritiqueValidationError,
  requestChallengeCritique,
} from "../../../../../../../server/commands/request-challenge-critique.ts";
import { getRequestUserId } from "../../../../../../../server/auth/get-request-user-id.ts";
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
    const result = await requestChallengeCritique({
      ...body,
      userId,
      requestId,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof RequestChallengeCritiqueValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof RequestChallengeCritiqueRoundNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("POST /api/commands/challenge/request-critique failed", error);
    return NextResponse.json({ error: "Failed to request challenge critique." }, { status: 500 });
  }
}
