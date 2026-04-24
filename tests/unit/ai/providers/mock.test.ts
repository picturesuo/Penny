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

test("mock AI provider returns useful capture thought demo data by default", async () => {
  const provider = createMockAiProvider();

  const result = await provider.invokeStructured({
    jsonSchema: { type: "object" },
    maxTokens: 128,
    model: "mock-model",
    schemaName: "captureThought",
    systemPrompt: "System",
    temperature: 0,
    userPrompt: JSON.stringify({
      input: {
        text: "Penny should make every claim easy to challenge before the investor demo.",
      },
    }),
  });

  assert.deepEqual(result.output, {
    thought: {
      title: "Penny Should Make Every Claim Easy",
      summary: "Demo capture: Penny should make every claim easy to challenge before the investor demo.",
    },
    claims: [
      {
        text: "Penny should pressure-test whether \"Penny should make every claim easy to challenge before the investor demo.\" is true before treating it as a core claim.",
        confidenceBps: 8100,
        rationale: "The mock provider turns the captured thought into a reviewable claim candidate.",
      },
      {
        text: "Useful demo output should stay deterministic so local acceptance flows are repeatable.",
        confidenceBps: 7600,
        rationale: "The provider is running without a live model key.",
      },
    ],
  });
});

test("mock AI provider returns valid challenge critique demo data by default", async () => {
  const provider = createMockAiProvider();

  const result = await provider.invokeStructured({
    jsonSchema: { type: "object" },
    maxTokens: 128,
    model: "mock-model",
    schemaName: "generateChallengeCritique",
    systemPrompt: "System",
    temperature: 0,
    userPrompt: JSON.stringify({
      context: {
        claim: {
          text: "Self-serve onboarding will keep retention high after the pilot.",
        },
      },
    }),
  });

  assert.deepEqual(result.output, {
    summary: "The claim needs clearer evidence before Penny should increase confidence in \"Self-serve onboarding will keep retention high after the pilot.\".",
    strongestCounterargument:
      "The observed signal may be caused by selection bias, manual founder effort, or a narrow pilot context rather than the claim itself.",
    assumptions: [
      "The current evidence represents the broader target audience.",
      "The outcome would persist without extra manual intervention.",
    ],
    failureModes: [
      "The claim works only for the highest-intent users.",
      "A missing counterexample reverses the conclusion once tested.",
    ],
    followUpQuestions: [
      "What is the fastest experiment that could disprove this claim?",
      "Which user segment would be the first place this breaks?",
    ],
    suggestedConfidenceBps: 5400,
    uncertaintyNote: "This is deterministic mock critique data for local demo flows, not a live model judgment.",
  });
});
