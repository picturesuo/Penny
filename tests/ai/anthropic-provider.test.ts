import assert from "node:assert/strict";
import test from "node:test";

import { invokeAnthropic, ProviderError } from "../../server/ai/providers/anthropic.ts";

test("invokeAnthropic returns normalized text and json from a mocked Anthropic response", async () => {
  const originalApiKey = process.env.ANTHROPIC_API_KEY;
  const originalBaseUrl = process.env.ANTHROPIC_BASE_URL;
  const originalFetch = globalThis.fetch;

  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  process.env.ANTHROPIC_BASE_URL = "https://anthropic.example/v1/";

  let fetchInput: RequestInfo | URL | null = null;
  let fetchInit: RequestInit | undefined;

  globalThis.fetch = async (input, init) => {
    fetchInput = input;
    fetchInit = init;

    return new Response(
      JSON.stringify({
        content: [
          {
            type: "text",
            text: "Rigorous critique output.",
          },
          {
            type: "tool_use",
            input: {
              conciseCritiqueSummary: "Rigorous critique output.",
            },
          },
        ],
        usage: {
          input_tokens: 14,
          output_tokens: 9,
          cost_usd: 0.0031,
          currency: "USD",
        },
        stop_reason: "end_turn",
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  };

  try {
    const result = await invokeAnthropic({
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
      text: "Rigorous critique output.",
      json: {
        conciseCritiqueSummary: "Rigorous critique output.",
      },
      output: {
        conciseCritiqueSummary: "Rigorous critique output.",
      },
      usage: {
        inputTokens: 14,
        outputTokens: 9,
        totalTokens: 23,
      },
      cost: {
        totalUsd: 0.0031,
        currency: "USD",
      },
      stopReason: "end_turn",
      raw: {
        content: [
          {
            type: "text",
            text: "Rigorous critique output.",
          },
          {
            type: "tool_use",
            input: {
              conciseCritiqueSummary: "Rigorous critique output.",
            },
          },
        ],
        usage: {
          input_tokens: 14,
          output_tokens: 9,
          cost_usd: 0.0031,
          currency: "USD",
        },
        stop_reason: "end_turn",
      },
    });

    if (fetchInput === null) {
      throw new Error("Expected fetch to be called.");
    }

    assert.equal(fetchInput, "https://anthropic.example/v1/messages");
    assert.equal(fetchInit?.method, "POST");
    assert.equal((fetchInit?.headers as Record<string, string>)["x-api-key"], "test-anthropic-key");
    assert.equal((fetchInit?.headers as Record<string, string>)["anthropic-version"], "2023-06-01");

    const body = JSON.parse(String(fetchInit?.body)) as Record<string, unknown>;

    assert.deepEqual(body, {
      model: "claude-test",
      max_tokens: 256,
      temperature: 0.2,
      system: "System prompt",
      messages: [
        {
          role: "user",
          content: "User prompt",
        },
      ],
      tools: [
        {
          name: "challenge_critique",
          description: "Return the final structured JSON result for this task.",
          input_schema: {
            type: "object",
            properties: {
              conciseCritiqueSummary: { type: "string" },
            },
            required: ["conciseCritiqueSummary"],
            additionalProperties: false,
          },
        },
      ],
      tool_choice: {
        type: "tool",
        name: "challenge_critique",
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("ANTHROPIC_API_KEY", originalApiKey);
    restoreEnv("ANTHROPIC_BASE_URL", originalBaseUrl);
  }
});

test("invokeAnthropic throws a structured ProviderError for provider failures", async () => {
  const originalApiKey = process.env.ANTHROPIC_API_KEY;
  const originalBaseUrl = process.env.ANTHROPIC_BASE_URL;
  const originalFetch = globalThis.fetch;

  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  process.env.ANTHROPIC_BASE_URL = "https://anthropic.example/v1/";

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        error: {
          message: "Rate limited",
        },
      }),
      {
        status: 429,
        headers: {
          "content-type": "application/json",
        },
      },
    );

  try {
    await assert.rejects(
      invokeAnthropic({
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
        assert.equal((error as ProviderError).status, 429);
        assert.equal((error as ProviderError).retryable, true);
        assert.deepEqual((error as ProviderError).details, {
          error: {
            message: "Rate limited",
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
