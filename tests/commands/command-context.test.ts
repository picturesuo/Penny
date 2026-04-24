import assert from "node:assert/strict";
import test from "node:test";

import { resolveCommandContext } from "../../server/commands/command-context.ts";

test("resolveCommandContext returns the shared actor, request, and now shape", () => {
  const timestamp = new Date("2026-04-24T16:00:00.000Z");

  assert.deepEqual(
    resolveCommandContext({
      actorUserId: "user-1",
      requestId: " request-1 ",
      now: timestamp,
      createId: () => "unexpected-request-id",
    }),
    {
      actorUserId: "user-1",
      requestId: "request-1",
      now: timestamp,
    },
  );
});

test("resolveCommandContext fills missing requestId and now", () => {
  const context = resolveCommandContext({
    actorUserId: "user-2",
    createId: () => "request-2",
  });

  assert.equal(context.actorUserId, "user-2");
  assert.equal(context.requestId, "request-2");
  assert.ok(context.now instanceof Date);
});
