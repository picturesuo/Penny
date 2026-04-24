import assert from "node:assert/strict";
import test from "node:test";

import { endAiTraceFailure, endAiTraceSuccess, startAiTrace } from "../../../../server/ai/tracing/langfuse.ts";

test("Langfuse tracing no-ops safely when credentials are missing", () => {
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
    restoreEnv("LANGFUSE_PUBLIC_KEY", originalPublicKey);
    restoreEnv("LANGFUSE_SECRET_KEY", originalSecretKey);
    restoreEnv("LANGFUSE_BASE_URL", originalBaseUrl);
    restoreEnv("NODE_ENV", originalNodeEnv);
  }
});

test("Langfuse tracing starts enabled traces and records success metadata when credentials exist", () => {
  const originalPublicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const originalSecretKey = process.env.LANGFUSE_SECRET_KEY;
  const originalBaseUrl = process.env.LANGFUSE_BASE_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalGithubSha = process.env.GITHUB_SHA;

  process.env.LANGFUSE_PUBLIC_KEY = "lf_public";
  process.env.LANGFUSE_SECRET_KEY = "lf_secret";
  process.env.LANGFUSE_BASE_URL = "https://langfuse.example";
  process.env.NODE_ENV = "test";
  process.env.GITHUB_SHA = "abc123";

  try {
    const handle = startAiTrace({
      name: " generateChallengeCritique ",
      provider: "anthropic",
      model: "claude-test",
      promptVersion: "generateChallengeCritique.v1",
      requestId: "request-2",
      sessionId: "session-2",
      userId: "user-2",
      tags: ["critical", " critical ", "ai"],
      metadata: {
        stage: "provider_call",
      },
      input: {
        claimId: "claim-1",
      },
    });

    assert.equal(handle.enabled, true);
    assert.equal(typeof handle.traceId, "string");
    assert.equal(typeof handle.observationId, "string");
    assert.equal(handle.baseUrl, "https://langfuse.example");
    assert.equal(handle.environment, "test");
    assert.equal(handle.release, "abc123");
    assert.equal(handle.name, "generateChallengeCritique");
    assert.deepEqual(handle.tags, ["critical", "ai"]);
    assert.deepEqual(handle.metadata, {
      stage: "provider_call",
    });

    const success = endAiTraceSuccess(handle, {
      statusMessage: "completed",
      metadata: {
        providerStatus: "ok",
      },
      output: {
        status: "ready",
      },
      usage: {
        inputTokens: 21,
        outputTokens: 9,
        totalTokens: 30,
      },
      cost: {
        totalUsd: 0.01,
        currency: "USD",
      },
    });

    assert.equal(success.enabled, true);
    assert.equal(success.status, "success");
    assert.equal(success.statusMessage, "completed");
    assert.equal(success.provider, "anthropic");
    assert.equal(success.model, "claude-test");
    assert.equal(success.promptVersion, "generateChallengeCritique.v1");
    assert.equal(success.requestId, "request-2");
    assert.equal(success.sessionId, "session-2");
    assert.equal(success.userId, "user-2");
    assert.equal(success.environment, "test");
    assert.equal(success.release, "abc123");
    assert.equal(success.traceId, handle.traceId);
    assert.equal(success.observationId, handle.observationId);
    assert.ok(success.latencyMs >= 0);
    assert.deepEqual(success.usage, {
      inputTokens: 21,
      outputTokens: 9,
      totalTokens: 30,
    });
    assert.deepEqual(success.cost, {
      totalUsd: 0.01,
      currency: "USD",
    });
    assert.deepEqual(success.metadata, {
      stage: "provider_call",
      providerStatus: "ok",
      output: {
        status: "ready",
      },
    });
  } finally {
    restoreEnv("LANGFUSE_PUBLIC_KEY", originalPublicKey);
    restoreEnv("LANGFUSE_SECRET_KEY", originalSecretKey);
    restoreEnv("LANGFUSE_BASE_URL", originalBaseUrl);
    restoreEnv("NODE_ENV", originalNodeEnv);
    restoreEnv("GITHUB_SHA", originalGithubSha);
  }
});

test("Langfuse tracing records failure details", () => {
  const originalPublicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const originalSecretKey = process.env.LANGFUSE_SECRET_KEY;

  process.env.LANGFUSE_PUBLIC_KEY = "lf_public";
  process.env.LANGFUSE_SECRET_KEY = "lf_secret";

  try {
    const handle = startAiTrace({
      name: "generateChallengeCritique",
      provider: "xai",
      model: "grok-test",
      metadata: {
        stage: "provider_call",
      },
    });

    const failure = endAiTraceFailure(handle, {
      error: new Error("provider timeout"),
      statusMessage: "failed",
      metadata: {
        retryable: "true",
      },
    });

    assert.equal(failure.enabled, true);
    assert.equal(failure.status, "failure");
    assert.equal(failure.statusMessage, "failed");
    assert.equal(failure.errorMessage, "provider timeout");
    assert.equal(failure.provider, "xai");
    assert.equal(failure.model, "grok-test");
    assert.deepEqual(failure.usage, {
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
    });
    assert.deepEqual(failure.cost, {
      totalUsd: null,
      currency: null,
    });
    assert.deepEqual(failure.metadata, {
      stage: "provider_call",
      retryable: "true",
      errorName: "Error",
      output: null,
    });
  } finally {
    restoreEnv("LANGFUSE_PUBLIC_KEY", originalPublicKey);
    restoreEnv("LANGFUSE_SECRET_KEY", originalSecretKey);
  }
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
