import { NextResponse } from "next/server";

import { explainBlocker, ExplainBlockerValidationError } from "../../../../../server/ai/operations/explainBlocker.ts";
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
    const output = explainBlocker(body);
    const inputJson = {
      ...(readBodyString(body, "thoughtId") ? { thoughtId: readBodyString(body, "thoughtId") } : {}),
      ...(readBodyString(body, "claimId") ? { claimId: readBodyString(body, "claimId") } : {}),
      ...(readBodyString(body, "text") ? { text: readBodyString(body, "text") } : {}),
      ...(readBodyString(body, "blocker") ? { blocker: readBodyString(body, "blocker") } : {}),
    };

    await aiOperationLogDeps.runLoggedAIOperation({
      userId,
      operation: AI_OPERATIONS.explainBlocker,
      inputJson,
      run: () => output,
      eventType: "ai.explain_blocker.completed",
      requestId,
      thoughtId: readBodyString(body, "thoughtId") ?? null,
      claimId: readBodyString(body, "claimId") ?? null,
    });

    return NextResponse.json(output, { status: 200 });
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof ExplainBlockerValidationError) {
      return NextResponse.json({ error: error.message, issues: error.issues }, { status: 400 });
    }

    console.error("POST /ai/explain-blocker failed", error);
    return NextResponse.json({ error: "Failed to explain blocker." }, { status: 500 });
  }
}
