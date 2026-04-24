import assert from "node:assert/strict";
import test from "node:test";

import { endAiTraceFailure, endAiTraceSuccess, startAiTrace } from "../../server/ai/tracing/langfuse.ts";

test("Langfuse helpers no-op safely in local dev without credentials", () => {
  const originalPublicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const originalSecretKey = process.env.LANGFUSE_SECRET_KEY;
  const originalBaseUrl = process.env.LANGFUSE_BASE_URL;
  const originalNodeEnv = process.env.NODE_ENV;

  delete process.env.LANGFUSE_PUBLIC_KEY;
  delete process.env.LANGFUSE_SECRET_KEY;
  delete process.env.LANGFUSE_BASE_URL;
  process.env.NODE_ENV = "development";

  try {
    const handle = startAiTrace({
      name: "generateChallengeCritique",
      provider: "anthropic",
      model: "claude-test",
      promptVersion: "generateChallengeCritique.v1",
      requestId: "request-1",
      userId: "user-1",
    });

    assert.equal(handle.enabled, false);
    assert.equal(handle.traceId, null);
    assert.equal(handle.observationId, null);
    assert.equal(handle.baseUrl, "https://cloud.langfuse.com");

    const success = endAiTraceSuccess(handle, {
      output: {
        status: "ready",
      },
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
      },
    });

    assert.equal(success.enabled, false);
    assert.equal(success.status, "success");
    assert.equal(success.traceId, null);
    assert.deepEqual(success.usage, {
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    });
    assert.deepEqual(success.metadata.output, {
      status: "ready",
    });

    const failure = endAiTraceFailure(handle, {
      error: new Error("synthetic failure"),
    });

    assert.equal(failure.enabled, false);
    assert.equal(failure.status, "failure");
    assert.equal(failure.errorMessage, "synthetic failure");
    assert.equal(failure.traceId, null);
  } finally {
    if (originalPublicKey === undefined) {
      delete process.env.LANGFUSE_PUBLIC_KEY;
    } else {
      process.env.LANGFUSE_PUBLIC_KEY = originalPublicKey;
    }

    if (originalSecretKey === undefined) {
      delete process.env.LANGFUSE_SECRET_KEY;
    } else {
      process.env.LANGFUSE_SECRET_KEY = originalSecretKey;
    }

    if (originalBaseUrl === undefined) {
      delete process.env.LANGFUSE_BASE_URL;
    } else {
      process.env.LANGFUSE_BASE_URL = originalBaseUrl;
    }

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  }
});
