import assert from "node:assert/strict";
import test from "node:test";

import { invokeOpenAIStructured, ProviderError } from "../../../../server/ai/providers/openai.ts";

test("invokeOpenAIStructured calls the Responses API and returns normalized structured output", async () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalBaseUrl = process.env.OPENAI_BASE_URL;
  const originalFetch = globalThis.fetch;

  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.OPENAI_BASE_URL = "https://openai.example/v1/";

  let requestBody: Record<string, unknown> | null = null;

  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body));

    return new Response(
      JSON.stringify({
        id: "resp_test",
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  summary: "Structured OpenAI result.",
                }),
              },
            ],
          },
        ],
        usage: {
          input_tokens: 13,
          output_tokens: 5,
          total_tokens: 18,
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
    const result = await invokeOpenAIStructured({
      jsonSchema: {
        type: "object",
        properties: {
          summary: { type: "string" },
        },
        required: ["summary"],
        additionalProperties: false,
      },
      maxTokens: 256,
      model: "gpt-test",
      schemaName: "summarize_map",
      systemPrompt: "System prompt",
      temperature: 0.2,
      userPrompt: "User prompt",
    });

    assert.equal(requestBody?.model, "gpt-test");
    assert.deepEqual(requestBody?.text, {
      format: {
        type: "json_schema",
        name: "summarize_map",
        schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
          },
          required: ["summary"],
          additionalProperties: false,
        },
        strict: true,
      },
    });
    assert.deepEqual(result.output, {
      summary: "Structured OpenAI result.",
    });
    assert.deepEqual(result.usage, {
      inputTokens: 13,
      outputTokens: 5,
      totalTokens: 18,
    });
    assert.equal(result.stopReason, "completed");
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("OPENAI_API_KEY", originalApiKey);
    restoreEnv("OPENAI_BASE_URL", originalBaseUrl);
  }
});

test("invokeOpenAIStructured throws a structured ProviderError without OPENAI_API_KEY", async () => {
  const originalApiKey = process.env.OPENAI_API_KEY;

  delete process.env.OPENAI_API_KEY;

  try {
    await assert.rejects(
      invokeOpenAIStructured({
        jsonSchema: { type: "object" },
        maxTokens: 64,
        model: "gpt-test",
        schemaName: "summarize_map",
        systemPrompt: "System",
        temperature: 0,
        userPrompt: "User",
      }),
      (error: unknown) => {
        assert.equal(error instanceof ProviderError, true);
        assert.equal((error as ProviderError).provider, "openai");
        assert.equal((error as ProviderError).reason, "configuration");
        return true;
      },
    );
  } finally {
    restoreEnv("OPENAI_API_KEY", originalApiKey);
  }
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
