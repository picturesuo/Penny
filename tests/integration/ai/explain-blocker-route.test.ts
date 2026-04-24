import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "../../../apps/web/app/ai/explain-blocker/route.ts";
import { aiOperationLogDeps } from "../../../server/ai/services/ai-operation-log.ts";

function snapshotDeps() {
  return { ...aiOperationLogDeps };
}

function restoreDeps(originalDeps: ReturnType<typeof snapshotDeps>) {
  Object.assign(aiOperationLogDeps, originalDeps);
}

const validUserId = "11111111-1111-4111-8111-111111111111";

test("POST /ai/explain-blocker returns the blocker explanation contract", async () => {
  const originalDeps = snapshotDeps();
  const logCalls: Array<Record<string, unknown>> = [];

  aiOperationLogDeps.runLoggedAIOperation = async (input) => {
    logCalls.push(input as unknown as Record<string, unknown>);
    return {
      aiJob: {} as never,
      output: await input.run(),
    };
  };

  try {
    const response = await POST(
      new Request("http://localhost/ai/explain-blocker", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": validUserId,
          "x-request-id": "blocker-route-1",
        },
        body: JSON.stringify({
          claimId: "claim-123",
          blocker: "I am stuck because the user evidence is unclear.",
        }),
      }),
    );

    assert.equal(response.status, 200);

    const payload = (await response.json()) as Record<string, unknown>;

    assert.equal(typeof payload.blockerSummary, "string");
    assert.equal(typeof payload.likelyCause, "string");
    assert.equal(typeof payload.missingInformation, "string");
    assert.equal(typeof payload.nextStep, "string");
    assert.equal(typeof payload.confidenceQuestion, "string");
    assert.deepEqual(Object.keys(payload).sort(), [
      "blockerSummary",
      "confidenceQuestion",
      "likelyCause",
      "missingInformation",
      "nextStep",
    ]);

    assert.equal(logCalls.length, 1);
    assert.equal(logCalls[0]?.operation, "explain_blocker");
    assert.equal(logCalls[0]?.eventType, "ai.explain_blocker.completed");
    assert.equal(logCalls[0]?.requestId, "blocker-route-1");
    assert.deepEqual(logCalls[0]?.inputJson, {
      claimId: "claim-123",
      blocker: "I am stuck because the user evidence is unclear.",
    });
  } finally {
    restoreDeps(originalDeps);
  }
});

test("POST /ai/explain-blocker requires an authenticated user before logging", async () => {
  const originalDeps = snapshotDeps();

  aiOperationLogDeps.runLoggedAIOperation = async () => {
    throw new Error("AI job logging should not run");
  };

  try {
    const response = await POST(
      new Request("http://localhost/ai/explain-blocker", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          blocker: "I am stuck.",
        }),
      }),
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: "Authenticated user is required.",
    });
  } finally {
    restoreDeps(originalDeps);
  }
});

test("POST /ai/explain-blocker rejects invalid input", async () => {
  const response = await POST(
    new Request("http://localhost/ai/explain-blocker", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": validUserId,
      },
      body: JSON.stringify({ blocker: "   " }),
    }),
  );

  assert.equal(response.status, 400);
  const payload = (await response.json()) as { error?: string; issues?: string[] };

  assert.equal(payload.error, "blocker must not be blank.");
  assert.deepEqual(payload.issues, ["blocker must not be blank."]);
});

test("POST /ai/explain-blocker rejects malformed JSON", async () => {
  const response = await POST(
    new Request("http://localhost/ai/explain-blocker", {
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
