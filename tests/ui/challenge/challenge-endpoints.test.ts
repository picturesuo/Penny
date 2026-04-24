import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { POST as startRound } from "../../../apps/web/app/api/commands/challenge/start-round/route.ts";

test("Challenge UI uses the start-round command endpoint", () => {
  const shellSource = readFileSync("apps/web/components/penny-shell.tsx", "utf8");

  assert.match(shellSource, /`\/api\/workspace\/\$\{mode\}`/);
  assert.match(shellSource, /\/api\/commands\/challenge\/start-round/);
  assert.match(shellSource, /\/api\/commands\/challenge\/request-critique/);
  assert.match(shellSource, /\/api\/commands\/challenge\/respond/);
});

test("POST /api/commands/challenge/start-round is mounted and requires auth", async () => {
  const response = await startRound(
    new Request("http://localhost/api/commands/challenge/start-round", {
      method: "POST",
      body: JSON.stringify({ claimId: "claim-1", requestId: "request-1" }),
    }),
  );

  assert.equal(response.status, 401);
});
