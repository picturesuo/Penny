import assert from "node:assert/strict";
import test from "node:test";
import {
  commandRequestHash,
  commandScopeHash,
  createMemoryCommandIdempotencyStore,
  resolveCommandIdempotencyKey,
  runIdempotentCommand,
} from "./command-idempotency.ts";
import { scopeValues } from "./scope.ts";

test("runIdempotentCommand stores and replays the first command response", async () => {
  const store = createMemoryCommandIdempotencyStore();
  const route = "POST /brain/verify";
  const body = {
    claimId: uuidAt(101),
    sessionId: uuidAt(100),
    currentClaimText: "Cognitive load is the first bottleneck.",
  };
  const requestHash = commandRequestHash(route, body);
  let runs = 0;

  const first = await runIdempotentCommand({
    route,
    key: "verify-key-1",
    requestHash,
    scope: { userId: "user-1", projectId: "project-1" },
    store,
    execute: async () => {
      runs += 1;

      return jsonResponse({ data: { run: runs } }, 201);
    },
  });
  const second = await runIdempotentCommand({
    route,
    key: "verify-key-1",
    requestHash,
    scope: { userId: "user-1", projectId: "project-1" },
    store,
    execute: async () => {
      runs += 1;

      return jsonResponse({ data: { run: runs } }, 201);
    },
  });
  const firstPayload = (await first.json()) as { data: { run: number } };
  const secondPayload = (await second.json()) as { data: { run: number } };

  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(first.headers.get("x-penny-idempotency"), "created");
  assert.equal(second.headers.get("x-penny-idempotency"), "replayed");
  assert.equal(runs, 1);
  assert.deepEqual(secondPayload, firstPayload);
});

test("runIdempotentCommand rejects the same key for a different request", async () => {
  const store = createMemoryCommandIdempotencyStore();
  const route = "POST /brain/challenge";
  const scope = { userId: "user-1" };
  const firstHash = commandRequestHash(route, { targetClaimId: uuidAt(101) });
  const secondHash = commandRequestHash(route, { targetClaimId: uuidAt(102) });

  await runIdempotentCommand({
    route,
    key: "challenge-key-1",
    requestHash: firstHash,
    scope,
    store,
    execute: async () => jsonResponse({ data: { targetClaimId: uuidAt(101) } }, 201),
  });
  const conflict = await runIdempotentCommand({
    route,
    key: "challenge-key-1",
    requestHash: secondHash,
    scope,
    store,
    execute: async () => jsonResponse({ data: { targetClaimId: uuidAt(102) } }, 201),
  });
  const payload = (await conflict.json()) as { error: { code: string } };

  assert.equal(conflict.status, 409);
  assert.equal(conflict.headers.get("x-penny-idempotency"), "conflict");
  assert.equal(payload.error.code, "idempotency_key_conflict");
});

test("runIdempotentCommand rejects an in-flight duplicate command", async () => {
  const store = createMemoryCommandIdempotencyStore();
  const route = "POST /brain/seed";
  const scope = scopeValues({ userId: "user-1" });
  const requestHash = commandRequestHash(route, { rawIdea: "Penny should test founder strategy." });

  await store.reserve({
    route,
    key: "seed-key-1",
    scope,
    scopeHash: commandScopeHash(scope),
    requestHash,
  });

  const response = await runIdempotentCommand({
    route,
    key: "seed-key-1",
    requestHash,
    scope,
    store,
    execute: async () => jsonResponse({ data: { sessionId: uuidAt(100) } }, 201),
  });
  const payload = (await response.json()) as { error: { code: string } };

  assert.equal(response.status, 409);
  assert.equal(response.headers.get("x-penny-idempotency"), "running");
  assert.equal(payload.error.code, "idempotency_key_in_progress");
});

test("resolveCommandIdempotencyKey accepts one key source and rejects conflicting sources", async () => {
  const request = new Request("http://localhost/brain/seed", {
    method: "POST",
    headers: {
      "idempotency-key": "header-key",
    },
  });
  const bodyOnly = resolveCommandIdempotencyKey(new Request("http://localhost/brain/seed"), {
    customId: "body-key",
  });
  const sameKey = resolveCommandIdempotencyKey(request, {
    idempotencyKey: "header-key",
  });
  const conflict = resolveCommandIdempotencyKey(request, {
    commandId: "body-key",
  });
  const conflictPayload = conflict.ok ? null : ((await conflict.response.json()) as { error: { code: string } });

  assert.equal(bodyOnly.ok ? bodyOnly.key : null, "body-key");
  assert.equal(sameKey.ok ? sameKey.key : null, "header-key");
  assert.equal(conflict.ok, false);
  assert.equal(conflictPayload?.error.code, "conflicting_idempotency_keys");
});

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
