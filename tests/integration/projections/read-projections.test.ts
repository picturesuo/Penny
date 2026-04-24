import assert from "node:assert/strict";
import { test } from "node:test";

import { GET as getBrainView } from "../../../apps/web/app/api/workspace/brain/route.ts";
import { GET as getChallengeView } from "../../../apps/web/app/api/workspace/challenge/route.ts";
import { GET as getLearnView } from "../../../apps/web/app/api/workspace/learn/route.ts";
import { GET as getShellView } from "../../../apps/web/app/api/workspace/shell/route.ts";
import { buildBrainView } from "../../../server/projections/build-brain-view.ts";
import { buildChallengeView } from "../../../server/projections/build-challenge-view.ts";
import { buildLearnView } from "../../../server/projections/build-learn-view.ts";
import { buildShellView } from "../../../server/projections/build-shell-view.ts";

test("read projection builders are exported for the workspace route surface", () => {
  assert.equal(typeof buildShellView, "function");
  assert.equal(typeof buildBrainView, "function");
  assert.equal(typeof buildChallengeView, "function");
  assert.equal(typeof buildLearnView, "function");
});

test("workspace read routes are wired before database access", async () => {
  const request = new Request("http://localhost/api/workspace/read-projection-smoke", {
    method: "GET",
  });

  const responses = await Promise.all([
    getShellView(request),
    getBrainView(request),
    getChallengeView(request),
    getLearnView(request),
  ]);

  for (const response of responses) {
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: "Authenticated user is required.",
    });
  }
});
