import assert from "node:assert/strict";
import test from "node:test";

import {
  UnknownModelPolicyOperationError,
  selectModelForOperation,
} from "../../server/ai/routing/modelPolicy.ts";

test("selectModelForOperation returns Claude by default for generateChallengeCritique", () => {
  const previousClaude = process.env.ANTHROPIC_CHALLENGE_MODEL;

  try {
    delete process.env.ANTHROPIC_CHALLENGE_MODEL;

    const selection = selectModelForOperation("generateChallengeCritique");

    assert.deepEqual(selection, {
      operationName: "generateChallengeCritique",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      qualityTier: "default",
    });
  } finally {
    if (previousClaude === undefined) {
      delete process.env.ANTHROPIC_CHALLENGE_MODEL;
    } else {
      process.env.ANTHROPIC_CHALLENGE_MODEL = previousClaude;
    }
  }
});

test("selectModelForOperation returns Grok for the fallback tier", () => {
  const previousFallback = process.env.XAI_CHALLENGE_FALLBACK_MODEL;

  try {
    delete process.env.XAI_CHALLENGE_FALLBACK_MODEL;

    const selection = selectModelForOperation("generateChallengeCritique", "fallback");

    assert.deepEqual(selection, {
      operationName: "generateChallengeCritique",
      provider: "xai",
      model: "grok-4.20",
      qualityTier: "fallback",
    });
  } finally {
    if (previousFallback === undefined) {
      delete process.env.XAI_CHALLENGE_FALLBACK_MODEL;
    } else {
      process.env.XAI_CHALLENGE_FALLBACK_MODEL = previousFallback;
    }
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
