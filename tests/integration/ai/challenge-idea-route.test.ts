import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "../../../apps/web/app/ai/challenge-idea/route.ts";

test("POST /ai/challenge-idea returns the challenge idea contract", async () => {
  const response = await POST(
    new Request("http://localhost/ai/challenge-idea", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        claimId: "claim-123",
        text: "Penny should use challenges because they improve learning.",
      }),
    }),
  );

  assert.equal(response.status, 200);

  const payload = (await response.json()) as Record<string, unknown>;

  assert.equal(typeof payload.strongestObjection, "string");
  assert.equal(typeof payload.hiddenAssumption, "string");
  assert.equal(typeof payload.counterexample, "string");
  assert.equal(typeof payload.betterVersion, "string");
  assert.equal(typeof payload.confidenceQuestion, "string");
  assert.deepEqual(Object.keys(payload).sort(), [
    "betterVersion",
    "confidenceQuestion",
    "counterexample",
    "hiddenAssumption",
    "strongestObjection",
  ]);
});

test("POST /ai/challenge-idea rejects invalid input", async () => {
  const response = await POST(
    new Request("http://localhost/ai/challenge-idea", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ text: "   " }),
    }),
  );

  assert.equal(response.status, 400);
  const payload = (await response.json()) as { error?: string; issues?: string[] };

  assert.equal(payload.error, "text must not be blank.");
  assert.deepEqual(payload.issues, ["text must not be blank."]);
});

test("POST /ai/challenge-idea rejects malformed JSON", async () => {
  const response = await POST(
    new Request("http://localhost/ai/challenge-idea", {
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
