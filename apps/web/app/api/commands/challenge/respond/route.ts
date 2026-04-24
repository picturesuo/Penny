import { NextResponse } from "next/server";

import {
  RecordChallengeResponseRoundNotFoundError,
  RecordChallengeResponseValidationError,
  recordChallengeResponse,
} from "../../../../../../../server/commands/record-challenge-response.ts";
import { getRequestUserId } from "../../../../../../../server/auth/get-request-user-id.ts";

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
    const requestId = request.headers.get("x-request-id");
    const result = await recordChallengeResponse({
      ...body,
      userId,
      requestId,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof RecordChallengeResponseValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof RecordChallengeResponseRoundNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("POST /api/commands/challenge/respond failed", error);
    return NextResponse.json({ error: "Failed to record challenge response." }, { status: 500 });
  }
}
