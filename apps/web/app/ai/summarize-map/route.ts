import { NextResponse } from "next/server";

import {
  SummarizeMapNotFoundError,
  SummarizeMapValidationError,
  summarizeMap,
} from "../../../../../server/ai/operations/summarizeMap.ts";
import { aiOperationLogDeps } from "../../../../../server/ai/services/ai-operation-log.ts";
import { AI_OPERATIONS } from "../../../../../server/ai/services/operation-names.ts";
import {
  RequestUserNotAuthenticatedError,
  getRequestUserId,
} from "../../../../../server/auth/get-request-user-id.ts";
import { getIdempotencyKey } from "../../../../../server/idempotency/get-idempotency-key.ts";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readBodyString(body: Record<string, unknown>, fieldName: string) {
  const value = body[fieldName];
  return typeof value === "string" ? value.trim() : undefined;
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
    const mapId = readBodyString(body, "mapId") ?? "";

    if (!mapId) {
      return NextResponse.json({ error: "mapId must not be blank.", issues: ["mapId must not be blank."] }, { status: 400 });
    }

    const inputJson = { mapId };
    const output = await aiOperationLogDeps.runLoggedAIOperation({
      userId,
      operation: AI_OPERATIONS.summarizeMap,
      inputJson,
      run: () => summarizeMap({ userId, mapId }),
      eventType: "ai.summarize_map.completed",
      requestId,
      mapId,
    });

    return NextResponse.json(output.output, { status: 200 });
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof SummarizeMapValidationError) {
      return NextResponse.json({ error: error.message, issues: error.issues }, { status: 400 });
    }

    if (error instanceof SummarizeMapNotFoundError) {
      return NextResponse.json({ error: "Map not found." }, { status: 404 });
    }

    console.error("POST /ai/summarize-map failed", error);
    return NextResponse.json({ error: "Failed to summarize map." }, { status: 500 });
  }
}
