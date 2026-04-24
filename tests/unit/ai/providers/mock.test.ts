import assert from "node:assert/strict";
import test from "node:test";

import { createMockAiProvider } from "../../../../server/ai/providers/mock.ts";
import type { AiProvider } from "../../../../server/ai/providers/types.ts";

test("mock AI provider implements the shared provider interface", async () => {
  const provider: AiProvider = createMockAiProvider({
    output: {
      confidence: 0.82,
      result: {
        summary: "Mocked result.",
      },
      notes: ["deterministic"],
    },
  });

  const result = await provider.invokeStructured({
    jsonSchema: { type: "object" },
    maxTokens: 128,
    model: "mock-model",
    schemaName: "summarize_map",
    systemPrompt: "System prompt",
    temperature: 0,
    userPrompt: "User prompt",
  });

  assert.equal(provider.name, "mock");
  assert.deepEqual(result.output, {
    confidence: 0.82,
    result: {
      summary: "Mocked result.",
    },
    notes: ["deterministic"],
  });
  assert.deepEqual(result.raw, {
    callIndex: 0,
    provider: "mock",
    schemaName: "summarize_map",
  });
  assert.equal(result.cost.totalUsd, 0);
  assert.equal(result.usage.totalTokens, result.usage.inputTokens! + result.usage.outputTokens!);
});

test("mock AI provider records calls and can generate per-request output", async () => {
  const provider = createMockAiProvider({
    output: (request, callIndex) => ({
      callIndex,
      schemaName: request.schemaName,
    }),
  });

  await provider.invokeStructured({
    jsonSchema: { type: "object" },
    maxTokens: 64,
    model: "mock-model",
    schemaName: "capture_thought",
    systemPrompt: "System",
    temperature: 0,
    userPrompt: "First thought",
  });
  const second = await provider.invokeStructured({
    jsonSchema: { type: "object" },
    maxTokens: 64,
    model: "mock-model",
    schemaName: "extract_claims",
    systemPrompt: "System",
    temperature: 0,
    userPrompt: "Second thought",
  });

  assert.equal(provider.calls.length, 2);
  assert.equal(provider.calls[0]?.request.schemaName, "capture_thought");
  assert.deepEqual(second.output, {
    callIndex: 1,
    schemaName: "extract_claims",
  });
});
