import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "../../../apps/web/app/ai/summarize-map/route.ts";
import { summarizeMapDeps } from "../../../server/ai/operations/summarizeMap.ts";
import { aiOperationLogDeps } from "../../../server/ai/services/ai-operation-log.ts";

function snapshotLogDeps() {
  return { ...aiOperationLogDeps };
}

function restoreLogDeps(originalDeps: ReturnType<typeof snapshotLogDeps>) {
  Object.assign(aiOperationLogDeps, originalDeps);
}

function snapshotSummarizeDeps() {
  return { ...summarizeMapDeps };
}

function restoreSummarizeDeps(originalDeps: ReturnType<typeof snapshotSummarizeDeps>) {
  summarizeMapDeps.repository = originalDeps.repository;
}

const validUserId = "11111111-1111-4111-8111-111111111111";
const validMapId = "22222222-2222-4222-8222-222222222222";

test("POST /ai/summarize-map returns the map summary contract", async () => {
  const originalLogDeps = snapshotLogDeps();
  const originalSummarizeDeps = snapshotSummarizeDeps();
  const logCalls: Array<Record<string, unknown>> = [];

  summarizeMapDeps.repository = {
    async findMap() {
      return {
        id: validMapId,
        title: "Onboarding Map",
      };
    },
    async findClaims() {
      return [
        {
          id: "claim-1",
          body: "Penny should shorten onboarding because activation improves when setup is fast.",
          confidenceBps: 7600,
        },
      ];
    },
  };
  aiOperationLogDeps.runLoggedAIOperation = async (input) => {
    logCalls.push(input as unknown as Record<string, unknown>);
    return {
      aiJob: {} as never,
      output: await input.run(),
    };
  };

  try {
    const response = await POST(
      new Request("http://localhost/ai/summarize-map", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": validUserId,
          "x-request-id": "summarize-route-1",
        },
        body: JSON.stringify({
          mapId: validMapId,
        }),
      }),
    );

    assert.equal(response.status, 200);

    const payload = (await response.json()) as Record<string, unknown>;

    assert.equal(typeof payload.summary, "string");
    assert.ok(Array.isArray(payload.keyClaims));
    assert.ok(Array.isArray(payload.tensions));
    assert.ok(Array.isArray(payload.nextQuestions));
    assert.deepEqual(Object.keys(payload).sort(), ["keyClaims", "nextQuestions", "summary", "tensions"]);

    assert.equal(logCalls.length, 1);
    assert.equal(logCalls[0]?.operation, "summarize_map");
    assert.equal(logCalls[0]?.eventType, "ai.summarize_map.completed");
    assert.equal(logCalls[0]?.requestId, "summarize-route-1");
    assert.equal(logCalls[0]?.mapId, validMapId);
    assert.deepEqual(logCalls[0]?.inputJson, {
      mapId: validMapId,
    });
  } finally {
    restoreLogDeps(originalLogDeps);
    restoreSummarizeDeps(originalSummarizeDeps);
  }
});

test("POST /ai/summarize-map requires an authenticated user before logging", async () => {
  const originalLogDeps = snapshotLogDeps();

  aiOperationLogDeps.runLoggedAIOperation = async () => {
    throw new Error("AI job logging should not run");
  };

  try {
    const response = await POST(
      new Request("http://localhost/ai/summarize-map", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          mapId: validMapId,
        }),
      }),
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: "Authenticated user is required.",
    });
  } finally {
    restoreLogDeps(originalLogDeps);
  }
});

test("POST /ai/summarize-map rejects invalid input", async () => {
  const response = await POST(
    new Request("http://localhost/ai/summarize-map", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": validUserId,
      },
      body: JSON.stringify({ mapId: "   " }),
    }),
  );

  assert.equal(response.status, 400);
  const payload = (await response.json()) as { error?: string; issues?: string[] };

  assert.equal(payload.error, "mapId must not be blank.");
  assert.deepEqual(payload.issues, ["mapId must not be blank."]);
});

test("POST /ai/summarize-map rejects malformed JSON", async () => {
  const response = await POST(
    new Request("http://localhost/ai/summarize-map", {
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
