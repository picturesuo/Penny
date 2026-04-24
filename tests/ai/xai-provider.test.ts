import assert from "node:assert/strict";
import test from "node:test";

import { invokeXaiStructured } from "../../server/ai/providers/xai.ts";

test("invokeXaiStructured posts a schema-formatted request and parses structured output", async () => {
  const originalApiKey = process.env.XAI_API_KEY;
  const originalBaseUrl = process.env.XAI_BASE_URL;
  const originalFetch = globalThis.fetch;

  process.env.XAI_API_KEY = "test-xai-key";
  process.env.XAI_BASE_URL = "https://xai.example/v1/";

  let fetchInput: RequestInfo | URL | null = null;
  let fetchInit: RequestInit | undefined;

  globalThis.fetch = async (input, init) => {
    fetchInput = input;
    fetchInit = init;

    return new Response(
      JSON.stringify({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  conciseCritiqueSummary: "Structured critique summary.",
                }),
              },
            ],
          },
        ],
        usage: {
          input_tokens: 11,
          output_tokens: 7,
          total_tokens: 18,
          cost_usd: 0.0042,
          currency: "USD",
        },
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
    const result = await invokeXaiStructured({
      jsonSchema: {
        type: "object",
        properties: {
          conciseCritiqueSummary: { type: "string" },
        },
        required: ["conciseCritiqueSummary"],
        additionalProperties: false,
      },
      maxTokens: 256,
      model: "grok-test",
      schemaName: "challenge_critique",
      systemPrompt: "System prompt",
      temperature: 0.2,
      userPrompt: "User prompt",
    });

    assert.deepEqual(result, {
      output: {
        conciseCritiqueSummary: "Structured critique summary.",
      },
      usage: {
        inputTokens: 11,
        outputTokens: 7,
        totalTokens: 18,
      },
      cost: {
        totalUsd: 0.0042,
        currency: "USD",
      },
    });

    if (fetchInput === null) {
      throw new Error("Expected fetch to be called.");
    }

    assert.equal(fetchInput, "https://xai.example/v1/responses");
    assert.equal(fetchInit?.method, "POST");
    assert.equal((fetchInit?.headers as Record<string, string>).Authorization, "Bearer test-xai-key");
    assert.equal((fetchInit?.headers as Record<string, string>)["Content-Type"], "application/json");

    const body = JSON.parse(String(fetchInit?.body)) as Record<string, unknown>;

    assert.deepEqual(body, {
      model: "grok-test",
      input: "System prompt\n\nUser prompt",
      max_output_tokens: 256,
      temperature: 0.2,
      text: {
        format: {
          type: "json_schema",
          name: "challenge_critique",
          schema: {
            type: "object",
            properties: {
              conciseCritiqueSummary: { type: "string" },
            },
            required: ["conciseCritiqueSummary"],
            additionalProperties: false,
          },
          strict: true,
        },
      },
    });
  } finally {
    globalThis.fetch = originalFetch;

    if (originalApiKey === undefined) {
      delete process.env.XAI_API_KEY;
    } else {
      process.env.XAI_API_KEY = originalApiKey;
    }

    if (originalBaseUrl === undefined) {
      delete process.env.XAI_BASE_URL;
    } else {
      process.env.XAI_BASE_URL = originalBaseUrl;
    }
  }
});
