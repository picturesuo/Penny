import { NextResponse } from "next/server";
import {
  CaptureThoughtError,
  CaptureThoughtValidationError,
  captureThought,
} from "../../../../../server/ai/operations/captureThought.ts";
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
    const result = await captureThought(
      {
        text: body.text,
        sessionId: body.sessionId,
      },
      {
        userId,
        requestId,
      },
    );

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof CaptureThoughtValidationError) {
      return NextResponse.json({ error: error.message, issues: error.issues }, { status: 400 });
    }

    if (error instanceof CaptureThoughtError) {
      console.error("POST /ai/capture-thought failed", error);
      return NextResponse.json({ error: "Failed to capture thought." }, { status: 502 });
    }

    console.error("POST /ai/capture-thought failed", error);
    return NextResponse.json({ error: "Failed to capture thought." }, { status: 500 });
  }
}
