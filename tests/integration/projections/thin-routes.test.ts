import assert from "node:assert/strict";
import { test } from "node:test";

import { POST as requestChallengeCritique } from "../../../apps/web/app/api/commands/challenge/request-critique/route.ts";
import { POST as respondToChallenge } from "../../../apps/web/app/api/commands/challenge/respond/route.ts";
import { POST as createClaim } from "../../../apps/web/app/api/commands/claims/create/route.ts";
import { POST as createMap } from "../../../apps/web/app/api/commands/maps/create/route.ts";
import { POST as selectWorkspace } from "../../../apps/web/app/api/commands/workspace/select/route.ts";
import { POST as captureThought } from "../../../apps/web/app/ai/capture-thought/route.ts";
import { GET as getGraphView } from "../../../apps/web/app/api/graph/route.ts";
import { GET as getBrainView } from "../../../apps/web/app/api/workspace/brain/route.ts";
import { GET as getChallengeView } from "../../../apps/web/app/api/workspace/challenge/route.ts";
import { GET as getLearnView } from "../../../apps/web/app/api/workspace/learn/route.ts";
import { GET as getShellView } from "../../../apps/web/app/api/workspace/shell/route.ts";

function commandRequest(route: string, body: Record<string, unknown>) {
  return new Request(`http://localhost${route}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

test("command route handlers authenticate before command execution", async () => {
  const responses = await Promise.all([
    createMap(commandRequest("/api/commands/maps/create", { title: "Unauthenticated map" })),
    createClaim(
      commandRequest("/api/commands/claims/create", {
        mapId: "00000000-0000-0000-0000-000000000001",
        text: "Unauthenticated claim",
      }),
    ),
    requestChallengeCritique(
      commandRequest("/api/commands/challenge/request-critique", {
        roundId: "00000000-0000-0000-0000-000000000002",
      }),
    ),
    respondToChallenge(
      commandRequest("/api/commands/challenge/respond", {
        roundId: "00000000-0000-0000-0000-000000000003",
        response: "Unauthenticated response",
      }),
    ),
    selectWorkspace(
      commandRequest("/api/commands/workspace/select", {
        mode: "Brain",
        mapId: "00000000-0000-0000-0000-000000000004",
      }),
    ),
    captureThought(commandRequest("/ai/capture-thought", { text: "Unauthenticated capture." })),
  ]);

  for (const response of responses) {
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: "Authenticated user is required.",
    });
  }
});

test("workspace projection route handlers authenticate before projection execution", async () => {
  const headers = {
    "x-user-id": "not-a-uuid",
  };

  const responses = await Promise.all([
    getGraphView(new Request("http://localhost/api/graph", { method: "GET", headers })),
    getShellView(new Request("http://localhost/api/workspace/shell", { method: "GET", headers })),
    getBrainView(new Request("http://localhost/api/workspace/brain", { method: "GET", headers })),
    getChallengeView(new Request("http://localhost/api/workspace/challenge", { method: "GET", headers })),
    getLearnView(new Request("http://localhost/api/workspace/learn", { method: "GET", headers })),
  ]);

  for (const response of responses) {
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: "Authenticated user is required.",
    });
  }
});
