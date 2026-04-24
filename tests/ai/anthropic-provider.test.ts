import assert from "node:assert/strict";
import test from "node:test";

import { invokeAnthropicStructured } from "../../server/ai/providers/anthropic.ts";

test("invokeAnthropicStructured posts a tool-schema request and parses structured output", async () => {
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
  };

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

    if (fetchInput === null) {
      throw new Error("Expected fetch to be called.");
    }

    assert.equal(fetchInput, "https://anthropic.example/v1/messages");
    assert.equal(fetchInit?.method, "POST");
    assert.equal((fetchInit?.headers as Record<string, string>)["x-api-key"], "test-anthropic-key");
    assert.equal((fetchInit?.headers as Record<string, string>)["anthropic-version"], "2023-06-01");
    assert.equal((fetchInit?.headers as Record<string, string>)["content-type"], "application/json");

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

    if (originalApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    }

    if (originalBaseUrl === undefined) {
      delete process.env.ANTHROPIC_BASE_URL;
    } else {
      process.env.ANTHROPIC_BASE_URL = originalBaseUrl;
    }
  }
});
