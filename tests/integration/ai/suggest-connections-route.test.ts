import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "../../../apps/web/app/ai/suggest-connections/route.ts";

const validUserId = "11111111-1111-4111-8111-111111111111";

test("POST /ai/suggest-connections requires an authenticated user", async () => {
  const response = await POST(
    new Request("http://localhost/ai/suggest-connections", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        targetType: "claim",
        targetId: "claim-123",
      }),
    }),
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: "Authenticated user is required.",
  });
});

test("POST /ai/suggest-connections rejects invalid input", async () => {
  const response = await POST(
    new Request("http://localhost/ai/suggest-connections", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": validUserId,
      },
      body: JSON.stringify({
        targetType: "note",
        targetId: "claim-123",
      }),
    }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "targetType must be either thought or claim.",
  });
});

test("POST /ai/suggest-connections rejects malformed JSON", async () => {
  const response = await POST(
    new Request("http://localhost/ai/suggest-connections", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{",
    }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Request body must be valid JSON.",
  });
});
