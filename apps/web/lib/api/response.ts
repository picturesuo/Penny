import { NextResponse } from "next/server";

export type ApiErrorBody = {
  error: string;
  issues?: string[];
};

export function apiOk<T>(body: T, status = 200) {
  return NextResponse.json(body, { status });
}

export function apiError(message: string, status: number, issues?: string[]) {
  const body: ApiErrorBody = issues?.length ? { error: message, issues } : { error: message };

  return NextResponse.json(body, { status });
}

export function invalidJsonResponse() {
  return apiError("Request body must be valid JSON.", 400);
}

export function invalidObjectResponse() {
  return apiError("Request body must be a JSON object.", 400);
}
