import { NextResponse } from "next/server";

import {
  DetectContradictionsTargetNotFoundError,
  DetectContradictionsValidationError,
  detectContradictions,
} from "../../../../../server/ai/operations/detectContradictions.ts";
import {
  RequestUserNotAuthenticatedError,
  getRequestUserId,
} from "../../../../../server/auth/get-request-user-id.ts";

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
    const result = await detectContradictions({
      userId,
      targetType: body.targetType,
      targetId: body.targetId,
      autoCreate: body.autoCreate,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof DetectContradictionsValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof DetectContradictionsTargetNotFoundError) {
      return NextResponse.json({ error: "Target not found." }, { status: 404 });
    }

    console.error("POST /ai/detect-contradictions failed", error);
    return NextResponse.json({ error: "Failed to detect contradictions." }, { status: 500 });
  }
}
