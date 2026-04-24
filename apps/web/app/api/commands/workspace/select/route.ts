import { NextResponse } from "next/server";
import { pathToFileURL } from "node:url";

import {
  RequestUserNotAuthenticatedError,
  getRequestUserId,
} from "../../../../../../../server/auth/get-request-user-id.ts";
import { getIdempotencyKey } from "../../../../../../../server/idempotency/get-idempotency-key.ts";

type SetWorkspaceSelectionModule = {
  setWorkspaceSelection(input: unknown): Promise<unknown>;
};

const importServerModule = new Function("specifier", "return import(specifier);") as (
  specifier: string,
) => Promise<SetWorkspaceSelectionModule>;
const setWorkspaceSelectionUrl = pathToFileURL(
  `${process.cwd()}/../../server/commands/set-workspace-selection.ts`,
).href;

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
    const { setWorkspaceSelection } = await importServerModule(setWorkspaceSelectionUrl);
    const result = await setWorkspaceSelection({
      ...body,
      userId,
      requestId,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof Error && error.name === "SetWorkspaceSelectionValidationError") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (
      error instanceof Error &&
      (error.name === "SetWorkspaceSelectionMapForbiddenError" ||
        error.name === "SetWorkspaceSelectionClaimForbiddenError")
    ) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (
      error instanceof Error &&
      (error.name === "SetWorkspaceSelectionMapNotFoundError" || error.name === "SetWorkspaceSelectionClaimNotFoundError")
    ) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("POST /api/commands/workspace/select failed", error);
    return NextResponse.json({ error: "Failed to set workspace selection." }, { status: 500 });
  }
}
