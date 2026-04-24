import assert from "node:assert/strict";
import test from "node:test";

import {
  PennyApiError,
  createPennyApiClient,
  createWorkspaceApiClient,
  workspaceProjectionPaths,
  type FetchLike,
} from "../../../apps/web/lib/api/index";

const userId = "00000000-0000-4000-8000-000000000123";

function jsonResponse(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

test("Penny API client sends typed JSON requests with the workspace user header", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetcher: FetchLike = async (input, init) => {
    calls.push({ input, init });
    return jsonResponse({ mode: "brain", mapId: null, claimId: null, breadcrumb: [], breadcrumbItems: [] });
  };
  const client = createPennyApiClient({ userId, fetcher });

  const result = await client.get<{ mode: string }>("/api/workspace/shell");

  assert.equal(result.mode, "brain");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.input, "/api/workspace/shell");
  const headers = new Headers(calls[0]?.init?.headers);
  assert.equal(headers.get("x-user-id"), userId);
  assert.equal(headers.get("accept"), "application/json");
});

test("Penny API client surfaces server errors with status and payload", async () => {
  const fetcher: FetchLike = async () => jsonResponse({ error: "Authenticated user is required." }, { status: 401 });
  const client = createPennyApiClient({ userId, fetcher });

  await assert.rejects(client.get("/api/workspace/shell"), (error) => {
    assert.ok(error instanceof PennyApiError);
    assert.equal(error.status, 401);
    assert.deepEqual(error.payload, { error: "Authenticated user is required." });
    assert.equal(error.message, "Authenticated user is required.");
    return true;
  });
});

test("workspace API client maps mode-aware helpers to the projection routes", async () => {
  const paths: string[] = [];
  const fetcher: FetchLike = async (input) => {
    paths.push(String(input));

    if (String(input).endsWith("/challenge")) {
      return jsonResponse({
        shellContext: { mode: "challenge", mapId: null, claimId: null, breadcrumb: [], breadcrumbItems: [] },
        currentContext: { mode: "challenge", mapId: null, claimId: null, breadcrumb: [], breadcrumbItems: [] },
        workspaceContext: { mode: "challenge", mapId: null, claimId: null, breadcrumb: [], breadcrumbItems: [] },
        activeClaim: null,
        selectedClaim: null,
        activeChallengeRound: null,
        latestChallengeRound: null,
        critiqueState: { status: "not_requested", critiqueId: null },
        critiqueStatus: "not_requested",
        responseState: { status: "not_recorded" },
        responseStatus: "not_recorded",
      });
    }

    return jsonResponse({ ok: true });
  };
  const client = createWorkspaceApiClient({ baseUrl: "http://penny.local", userId, fetcher });

  await client.getShellView();
  await client.getWorkspaceView("challenge");

  assert.deepEqual(paths, [
    `http://penny.local${workspaceProjectionPaths.shell}`,
    `http://penny.local${workspaceProjectionPaths.challenge}`,
  ]);
});
