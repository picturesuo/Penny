import assert from "node:assert/strict";
import test from "node:test";

import { AiProviderError, type AiProvider } from "../../../../server/ai/providers/types.ts";

test("AiProviderError preserves normalized provider failure metadata", () => {
  const error = new AiProviderError({
    message: "Service unavailable.",
    provider: "anthropic",
    reason: "http",
    retryable: true,
    status: 503,
    details: {
      requestId: "req_123",
    },
  });

  assert.equal(error.name, "ProviderError");
  assert.equal(error.code, "PROVIDER_ERROR");
  assert.equal(error.message, "Service unavailable.");
  assert.equal(error.provider, "anthropic");
  assert.equal(error.reason, "http");
  assert.equal(error.retryable, true);
  assert.equal(error.status, 503);
  assert.deepEqual(error.details, {
    requestId: "req_123",
  });
});

test("AiProvider describes the shared structured provider contract", async () => {
  const provider: AiProvider = {
    name: "contract-test",
    async invokeStructured(request) {
      return {
        cost: {
          currency: "USD",
          totalUsd: 0,
        },
        json: {
          schemaName: request.schemaName,
        },
        output: {
          schemaName: request.schemaName,
        },
        raw: {
          provider: "contract-test",
        },
        stopReason: "completed",
        text: "{\"schemaName\":\"test_schema\"}",
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          totalTokens: 2,
        },
      };
    },
  };

  const result = await provider.invokeStructured({
    jsonSchema: { type: "object" },
    maxTokens: 64,
    model: "test-model",
    schemaName: "test_schema",
    systemPrompt: "System",
    temperature: 0,
    userPrompt: "User",
  });

  assert.equal(provider.name, "contract-test");
  assert.deepEqual(result.output, {
    schemaName: "test_schema",
  });
});
