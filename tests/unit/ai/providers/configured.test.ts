import assert from "node:assert/strict";
import test from "node:test";

import { createConfiguredAiProvider, hasOpenAIKey } from "../../../../server/ai/providers/configured.ts";

test("configured AI provider uses mock when OPENAI_API_KEY is absent", () => {
  const provider = createConfiguredAiProvider({});

  assert.equal(provider.name, "mock");
});

test("configured AI provider uses mock when OPENAI_API_KEY is blank", () => {
  const provider = createConfiguredAiProvider({ OPENAI_API_KEY: "   " });

  assert.equal(provider.name, "mock");
  assert.equal(hasOpenAIKey({ OPENAI_API_KEY: "   " }), false);
});

test("configured AI provider uses OpenAI when OPENAI_API_KEY exists", () => {
  const provider = createConfiguredAiProvider({ OPENAI_API_KEY: "sk-test" });

  assert.equal(provider.name, "openai");
  assert.equal(hasOpenAIKey({ OPENAI_API_KEY: "sk-test" }), true);
});
