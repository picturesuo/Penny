import assert from "node:assert/strict";
import test from "node:test";

import { POST as createClaim } from "../../apps/web/app/api/commands/claims/create/route.ts";
import { POST as createMap } from "../../apps/web/app/api/commands/maps/create/route.ts";
import { POST as requestChallengeCritique } from "../../apps/web/app/api/commands/challenge/request-critique/route.ts";
import { POST as respondToChallenge } from "../../apps/web/app/api/commands/challenge/respond/route.ts";
import { GET as getBrainView } from "../../apps/web/app/api/workspace/brain/route.ts";
import { GET as getChallengeView } from "../../apps/web/app/api/workspace/challenge/route.ts";
import { GET as getLearnView } from "../../apps/web/app/api/workspace/learn/route.ts";
import { GET as getShellView } from "../../apps/web/app/api/workspace/shell/route.ts";

test("command routes reject requests without an authenticated user", async () => {
  const responses = await Promise.all([
    createMap(
      new Request("http://localhost/api/commands/maps/create", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ title: "Unauthenticated map" }),
      }),
    ),
    createClaim(
      new Request("http://localhost/api/commands/claims/create", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ mapId: "00000000-0000-0000-0000-000000000321", text: "Unauthenticated claim" }),
      }),
    ),
    requestChallengeCritique(
      new Request("http://localhost/api/commands/challenge/request-critique", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ roundId: "00000000-0000-0000-0000-000000000654" }),
      }),
    ),
    respondToChallenge(
      new Request("http://localhost/api/commands/challenge/respond", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          roundId: "00000000-0000-0000-0000-000000000654",
          response: "Unauthenticated challenge response",
        }),
      }),
    ),
  ]);

  for (const response of responses) {
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: "Authenticated user is required.",
    });
  }
});

test("workspace routes reject invalid user identity headers", async () => {
  const headers = {
    "x-user-id": "not-a-uuid",
  };

  const responses = await Promise.all([
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
