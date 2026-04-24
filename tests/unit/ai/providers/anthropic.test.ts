import assert from "node:assert/strict";
import test from "node:test";

import { invokeAnthropicStructured, ProviderError } from "../../../../server/ai/providers/anthropic.ts";

test("invokeAnthropicStructured accepts the normalized request shape and returns the normalized response shape", async () => {
  const originalApiKey = process.env.ANTHROPIC_API_KEY;
  const originalBaseUrl = process.env.ANTHROPIC_BASE_URL;
  const originalFetch = globalThis.fetch;

  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  process.env.ANTHROPIC_BASE_URL = "https://anthropic.example/v1/";

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        id: "msg_test",
        stop_reason: "tool_use",
        usage: {
          input_tokens: 17,
          output_tokens: 9,
          cost_usd: 0.0051,
          currency: "USD",
        },
        content: [
          {
            type: "text",
            text: "Structured critique response.",
          },
          {
            type: "tool_use",
            id: "toolu_test",
            name: "challenge_critique",
            input: {
              conciseCritiqueSummary: "Structured critique summary.",
            },
          },
        ],
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );

  try {
    const result = await invokeAnthropicStructured({
      jsonSchema: {
        type: "object",
        properties: {
          conciseCritiqueSummary: { type: "string" },
        },
        required: ["conciseCritiqueSummary"],
        additionalProperties: false,
      },
      maxTokens: 256,
      model: "claude-test",
      schemaName: "challenge_critique",
      systemPrompt: "System prompt",
      temperature: 0.2,
      userPrompt: "User prompt",
    });

    assert.deepEqual(result, {
      text: "Structured critique response.",
      json: {
        conciseCritiqueSummary: "Structured critique summary.",
      },
      output: {
        conciseCritiqueSummary: "Structured critique summary.",
      },
      usage: {
        inputTokens: 17,
        outputTokens: 9,
        totalTokens: 26,
      },
      cost: {
        totalUsd: 0.0051,
        currency: "USD",
      },
      stopReason: "tool_use",
      raw: {
        id: "msg_test",
        stop_reason: "tool_use",
        usage: {
          input_tokens: 17,
          output_tokens: 9,
          cost_usd: 0.0051,
          currency: "USD",
        },
        content: [
          {
            type: "text",
            text: "Structured critique response.",
          },
          {
            type: "tool_use",
            id: "toolu_test",
            name: "challenge_critique",
            input: {
              conciseCritiqueSummary: "Structured critique summary.",
            },
          },
        ],
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("ANTHROPIC_API_KEY", originalApiKey);
    restoreEnv("ANTHROPIC_BASE_URL", originalBaseUrl);
  }
});

test("invokeAnthropicStructured throws a structured ProviderError for provider failures", async () => {
  const originalApiKey = process.env.ANTHROPIC_API_KEY;
  const originalBaseUrl = process.env.ANTHROPIC_BASE_URL;
  const originalFetch = globalThis.fetch;

  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  process.env.ANTHROPIC_BASE_URL = "https://anthropic.example/v1/";

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        error: {
          message: "Service unavailable",
        },
      }),
      {
        status: 503,
        headers: {
          "content-type": "application/json",
        },
      },
    );

  try {
    await assert.rejects(
      invokeAnthropicStructured({
        jsonSchema: { type: "object" },
        maxTokens: 64,
        model: "claude-test",
        schemaName: "challenge_critique",
        systemPrompt: "System prompt",
        temperature: 0,
        userPrompt: "User prompt",
      }),
      (error: unknown) => {
        assert.equal(error instanceof ProviderError, true);
        assert.equal((error as ProviderError).name, "ProviderError");
        assert.equal((error as ProviderError).code, "PROVIDER_ERROR");
        assert.equal((error as ProviderError).provider, "anthropic");
        assert.equal((error as ProviderError).reason, "http");
        assert.equal((error as ProviderError).status, 503);
        assert.equal((error as ProviderError).retryable, true);
        assert.deepEqual((error as ProviderError).details, {
          error: {
            message: "Service unavailable",
          },
        });
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("ANTHROPIC_API_KEY", originalApiKey);
    restoreEnv("ANTHROPIC_BASE_URL", originalBaseUrl);
  }
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
