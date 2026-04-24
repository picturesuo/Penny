import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "../../../apps/web/app/ai/capture-thought/route.ts";
import { captureThoughtDeps } from "../../../server/ai/operations/captureThought.ts";
import { PROMPT_VERSION } from "../../../server/ai/prompts/captureThought/v1.ts";

function snapshotDeps() {
  return { ...captureThoughtDeps };
}

function restoreDeps(originalDeps: ReturnType<typeof snapshotDeps>) {
  Object.assign(captureThoughtDeps, originalDeps);
}

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/ai/capture-thought", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test("POST /ai/capture-thought authenticates before AI execution", async () => {
  const originalDeps = snapshotDeps();

  captureThoughtDeps.invokeAnthropicStructured = async () => {
    throw new Error("provider should not be called");
  };

  try {
    const response = await POST(request({ text: "Capture this." }));

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: "Authenticated user is required.",
    });
  } finally {
    restoreDeps(originalDeps);
  }
});

test("POST /ai/capture-thought returns extracted thought and claims", async () => {
  const originalDeps = snapshotDeps();

  captureThoughtDeps.resolveModelPolicy = () => [
    {
      provider: "anthropic",
      model: "claude-capture-test",
      promptVersion: PROMPT_VERSION,
      tier: "default",
    },
  ];
  captureThoughtDeps.invokeAnthropicStructured = async () => ({
    output: {
      thought: {
        title: "Capture loop",
        summary: "The thought says Penny should capture raw ideas and extract reviewable claims.",
      },
      claims: [
        {
          text: "Penny should extract reviewable claims from raw captured thoughts.",
          confidenceBps: 8100,
          rationale: "The submitted text directly asks for capture and extraction.",
        },
      ],
    },
    usage: {
      inputTokens: 30,
      outputTokens: 20,
      totalTokens: 50,
    },
    cost: {
      totalUsd: 0.002,
      currency: "USD",
    },
  });
  captureThoughtDeps.invokeXaiStructured = async () => {
    throw new Error("xai should not be called");
  };

  try {
    const response = await POST(
      request(
        {
          text: "Penny should capture raw ideas and extract reviewable claims.",
          sessionId: "session-route-1",
        },
        {
          "x-user-id": "00000000-0000-0000-0000-000000000123",
          "x-request-id": "capture-route-1",
        },
      ),
    );

    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      rawText: string;
      sessionId: string | null;
      thought: {
        title: string;
        summary: string;
      };
      claims: Array<{
        text: string;
        confidenceBps: number;
        rationale: string | null;
      }>;
      meta: {
        provider: string;
        model: string;
      };
    };

    assert.equal(payload.rawText, "Penny should capture raw ideas and extract reviewable claims.");
    assert.equal(payload.sessionId, "session-route-1");
    assert.equal(payload.thought.title, "Capture loop");
    assert.equal(payload.claims.length, 1);
    assert.equal(payload.claims[0]?.confidenceBps, 8100);
    assert.equal(payload.meta.provider, "anthropic");
    assert.equal(payload.meta.model, "claude-capture-test");
  } finally {
    restoreDeps(originalDeps);
  }
});

test("POST /ai/capture-thought validates request body shape", async () => {
  const response = await POST(
    request(
      {
        text: "",
      },
      {
        "x-user-id": "00000000-0000-0000-0000-000000000123",
      },
    ),
  );

  assert.equal(response.status, 400);

  const payload = (await response.json()) as { error: string; issues: string[] };

  assert.equal(payload.error, "text must be at least 1 character(s).");
  assert.deepEqual(payload.issues, ["text must be at least 1 character(s)."]);
});
