import assert from "node:assert/strict";
import test from "node:test";

import {
  UnknownModelPolicyOperationError,
  selectModelForOperation,
} from "../../server/ai/routing/modelPolicy.ts";

test("selectModelForOperation returns mock by default when OpenAI is not configured", () => {
  const previousOpenAIKey = process.env.OPENAI_API_KEY;
  const previousMockModel = process.env.MOCK_AI_MODEL;

  try {
    delete process.env.OPENAI_API_KEY;
    delete process.env.MOCK_AI_MODEL;

    const selection = selectModelForOperation("generateChallengeCritique");

    assert.deepEqual(selection, {
      operationName: "generateChallengeCritique",
      provider: "mock",
      model: "mock-demo",
      qualityTier: "default",
    });
  } finally {
    restoreEnv("OPENAI_API_KEY", previousOpenAIKey);
    restoreEnv("MOCK_AI_MODEL", previousMockModel);
  }
});

test("selectModelForOperation returns OpenAI when configured", () => {
  const previousOpenAIKey = process.env.OPENAI_API_KEY;
  const previousOpenAIModel = process.env.OPENAI_MODEL;
  const previousChallengeModel = process.env.OPENAI_CHALLENGE_MODEL;

  try {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_MODEL = "gpt-shared-test";
    process.env.OPENAI_CHALLENGE_MODEL = "gpt-challenge-test";

    const selection = selectModelForOperation("generateChallengeCritique", "fallback");

    assert.deepEqual(selection, {
      operationName: "generateChallengeCritique",
      provider: "openai",
      model: "gpt-challenge-test",
      qualityTier: "fallback",
    });
  } finally {
    restoreEnv("OPENAI_API_KEY", previousOpenAIKey);
    restoreEnv("OPENAI_MODEL", previousOpenAIModel);
    restoreEnv("OPENAI_CHALLENGE_MODEL", previousChallengeModel);
  }
});

test("selectModelForOperation fails safely for an unknown operation", () => {
  assert.throws(
    () => selectModelForOperation("unknownOperation"),
    (error: unknown) =>
      error instanceof UnknownModelPolicyOperationError &&
      error.message === "No model policy is defined for operation: unknownOperation",
  );
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
