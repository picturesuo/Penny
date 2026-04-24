import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchBrainWorkspace } from "../../../apps/web/lib/viewmodels/brain/fetch-adapter.ts";
import type { BrainProjectionView } from "../../../apps/web/lib/viewmodels/brain/types.ts";

const shellPayload = {
  mode: "brain",
  mapId: "map-1",
  claimId: "claim-1",
  breadcrumb: [
    {
      kind: "map",
      id: "map-1",
      label: "Investor map",
    },
  ],
};

const brainPayload: BrainProjectionView = {
  currentContext: {
    mode: "brain",
    mapId: "map-1",
    claimId: "claim-1",
  },
  workspaceContext: {
    mode: "brain",
    mapId: "map-1",
    claimId: "claim-1",
  },
  mapSummary: {
    id: "map-1",
    title: "Investor map",
    claimCount: 1,
  },
  claims: [
    {
      id: "claim-1",
      mapId: "map-1",
      body: "Fetch adapter should read Brain projection.",
      confidenceBps: 7100,
      createdAt: "2026-04-24T12:00:00.000Z",
      updatedAt: "2026-04-24T12:05:00.000Z",
    },
  ],
  selectedClaim: null,
  recentEvents: [],
};

test("fetchBrainWorkspace reads shell and brain endpoints with user header", async () => {
  const calls: Array<{ path: string; userId: string | null }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const path = String(input);
    const headers = new Headers(init?.headers);
    calls.push({
      path,
      userId: headers.get("x-user-id"),
    });

    if (path === "/api/workspace/shell") {
      return Response.json(shellPayload);
    }

    if (path === "/api/workspace/brain") {
      return Response.json(brainPayload);
    }

    return Response.json({ error: "missing" }, { status: 404 });
  };

  const result = await fetchBrainWorkspace({
    userId: "00000000-0000-4000-8000-000000000001",
    fetcher,
  });

  assert.equal(result.shell.mapId, "map-1");
  assert.equal(result.brain.mapSummary?.title, "Investor map");
  assert.deepEqual(
    calls.map((call) => call.path).sort(),
    ["/api/workspace/brain", "/api/workspace/shell"],
  );
  assert.deepEqual(
    calls.map((call) => call.userId),
    ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000001"],
  );
});

test("fetchBrainWorkspace surfaces endpoint errors", async () => {
  const fetcher: typeof fetch = async (input) => {
    if (String(input) === "/api/workspace/shell") {
      return Response.json(shellPayload);
    }

    return Response.json({ error: "Brain unavailable." }, { status: 500 });
  };

  await assert.rejects(
    () =>
      fetchBrainWorkspace({
        userId: "00000000-0000-4000-8000-000000000001",
        fetcher,
      }),
    /Brain unavailable/,
  );
});
