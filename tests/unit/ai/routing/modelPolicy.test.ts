import assert from "node:assert/strict";
import test from "node:test";

import {
  UnknownModelPolicyOperationError,
  selectModelForOperation,
} from "../../../../server/ai/routing/modelPolicy.ts";

test("selectModelForOperation routes generateChallengeCritique default traffic to Claude", () => {
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
    restoreEnv("ANTHROPIC_CHALLENGE_MODEL", previousClaude);
  }
});

test("selectModelForOperation routes generateChallengeCritique fallback traffic to Grok", () => {
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
    restoreEnv("XAI_CHALLENGE_FALLBACK_MODEL", previousFallback);
  }
});

test("selectModelForOperation routes cheap traffic to Grok fast when configured", () => {
  const previousFast = process.env.XAI_FAST_MODEL;
  const previousFallback = process.env.XAI_CHALLENGE_FALLBACK_MODEL;

  try {
    process.env.XAI_FAST_MODEL = "grok-4-fast";
    process.env.XAI_CHALLENGE_FALLBACK_MODEL = "grok-4.20";

    const selection = selectModelForOperation("generateChallengeCritique", "cheap");

    assert.deepEqual(selection, {
      operationName: "generateChallengeCritique",
      provider: "xai",
      model: "grok-4-fast",
      qualityTier: "cheap",
    });
  } finally {
    restoreEnv("XAI_FAST_MODEL", previousFast);
    restoreEnv("XAI_CHALLENGE_FALLBACK_MODEL", previousFallback);
  }
});

test("selectModelForOperation routes cheap traffic to Grok fallback when no fast model is configured", () => {
  const previousFast = process.env.XAI_FAST_MODEL;
  const previousFallback = process.env.XAI_CHALLENGE_FALLBACK_MODEL;

  try {
    delete process.env.XAI_FAST_MODEL;
    delete process.env.XAI_CHALLENGE_FALLBACK_MODEL;

    const selection = selectModelForOperation("generateChallengeCritique", "cheap");

    assert.deepEqual(selection, {
      operationName: "generateChallengeCritique",
      provider: "xai",
      model: "grok-4.20",
      qualityTier: "cheap",
    });
  } finally {
    restoreEnv("XAI_FAST_MODEL", previousFast);
    restoreEnv("XAI_CHALLENGE_FALLBACK_MODEL", previousFallback);
  }
});

test("selectModelForOperation routes captureThought default traffic to Claude", () => {
  const previousClaude = process.env.ANTHROPIC_CAPTURE_MODEL;

  try {
    process.env.ANTHROPIC_CAPTURE_MODEL = "claude-capture";

    const selection = selectModelForOperation("captureThought");

    assert.deepEqual(selection, {
      operationName: "captureThought",
      provider: "anthropic",
      model: "claude-capture",
      qualityTier: "default",
    });
  } finally {
    restoreEnv("ANTHROPIC_CAPTURE_MODEL", previousClaude);
  }
});

test("selectModelForOperation routes captureThought fallback traffic to Grok", () => {
  const previousFallback = process.env.XAI_CAPTURE_FALLBACK_MODEL;

  try {
    process.env.XAI_CAPTURE_FALLBACK_MODEL = "grok-capture";

    const selection = selectModelForOperation("captureThought", "fallback");

    assert.deepEqual(selection, {
      operationName: "captureThought",
      provider: "xai",
      model: "grok-capture",
      qualityTier: "fallback",
    });
  } finally {
    restoreEnv("XAI_CAPTURE_FALLBACK_MODEL", previousFallback);
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
