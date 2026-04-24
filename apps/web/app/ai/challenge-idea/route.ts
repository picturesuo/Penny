import { NextResponse } from "next/server";

import { challengeIdea, ChallengeIdeaValidationError } from "../../../../../server/ai/operations/challengeIdea.ts";

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
    return NextResponse.json(challengeIdea(body), { status: 200 });
  } catch (error) {
    if (error instanceof ChallengeIdeaValidationError) {
      return NextResponse.json({ error: error.message, issues: error.issues }, { status: 400 });
    }

    console.error("POST /ai/challenge-idea failed", error);
    return NextResponse.json({ error: "Failed to challenge idea." }, { status: 500 });
  }
}
