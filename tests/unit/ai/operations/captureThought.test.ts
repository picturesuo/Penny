import assert from "node:assert/strict";
import test from "node:test";

import {
  CaptureThoughtError,
  CaptureThoughtValidationError,
  captureThought,
  captureThoughtDeps,
} from "../../../../server/ai/operations/captureThought.ts";
import { PROMPT_VERSION } from "../../../../server/ai/prompts/captureThought/v1.ts";

const validProviderOutput = {
  thought: {
    title: "Investor traceability",
    summary: "The captured thought argues that Penny should connect raw founder thinking to investor-facing claims.",
  },
  claims: [
    {
      text: "Penny should make every investor-facing claim traceable to its original thought.",
      confidenceBps: 8200,
      rationale: "The source text explicitly asks for traceability from thought capture to claims.",
    },
  ],
};
const sessionId = "00000000-0000-0000-0000-000000000777";

function snapshotDeps() {
  return { ...captureThoughtDeps };
}

function restoreDeps(originalDeps: ReturnType<typeof snapshotDeps>) {
  Object.assign(captureThoughtDeps, originalDeps);
}

test("captureThought sends the structured capture prompt and returns extracted claims", async () => {
  const originalDeps = snapshotDeps();
  let capturedRequest: Record<string, unknown> | null = null;
  let capturedQualityTier: unknown = null;

  captureThoughtDeps.resolveModelPolicy = (_operationName, options) => {
    capturedQualityTier = options?.qualityTier ?? null;

    return [
      {
        provider: "anthropic",
        model: "claude-capture-test",
        promptVersion: PROMPT_VERSION,
        tier: "default",
      },
    ];
  };
  captureThoughtDeps.invokeAnthropicStructured = async (request) => {
    capturedRequest = request as Record<string, unknown>;

    return {
      output: validProviderOutput,
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      },
      cost: {
        totalUsd: 0.01,
        currency: "USD",
      },
    };
  };
  captureThoughtDeps.invokeXaiStructured = async () => {
    throw new Error("xai should not be called");
  };

  try {
    const result = await captureThought(
      {
        text: " Penny should make every investor-facing claim traceable to its original thought. ",
        sessionId,
        qualityTier: "cheap",
      },
      {
        userId: "00000000-0000-0000-0000-000000000123",
      },
    );

    assert.equal(result.rawText, "Penny should make every investor-facing claim traceable to its original thought.");
    assert.equal(result.sessionId, sessionId);
    assert.deepEqual(result.thought, validProviderOutput.thought);
    assert.deepEqual(result.claims, validProviderOutput.claims);
    assert.equal(result.meta.provider, "anthropic");
    assert.equal(result.meta.model, "claude-capture-test");
    assert.equal(result.meta.promptVersion, PROMPT_VERSION);
    assert.equal(result.meta.validationResult, "valid");
    assert.equal(result.meta.repairAttempted, false);
    assert.deepEqual(result.meta.usage, {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    });
    assert.equal(capturedQualityTier, "cheap");

    const requestForAssertions = capturedRequest as Record<string, unknown> | null;

    assert.ok(requestForAssertions);
    assert.equal(requestForAssertions.schemaName, "captureThought");
    assert.match(String(requestForAssertions.userPrompt), /"operation": "captureThought"/);
    assert.match(String(requestForAssertions.userPrompt), /"sessionId": "00000000-0000-0000-0000-000000000777"/);
    assert.deepEqual((requestForAssertions.jsonSchema as { required?: unknown[] }).required, ["thought", "claims"]);
  } finally {
    restoreDeps(originalDeps);
  }
});

test("captureThought repairs one malformed provider response", async () => {
  const originalDeps = snapshotDeps();
  let calls = 0;

  captureThoughtDeps.resolveModelPolicy = () => [
    {
      provider: "anthropic",
      model: "claude-capture-test",
      promptVersion: PROMPT_VERSION,
      tier: "default",
    },
  ];
  captureThoughtDeps.invokeAnthropicStructured = async () => {
    calls += 1;

    if (calls === 1) {
      return {
        output: {
          claims: [],
        },
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
        },
        cost: {
          totalUsd: 0.001,
          currency: "USD",
        },
      };
    }

    return {
      output: validProviderOutput,
      usage: {
        inputTokens: 20,
        outputTokens: 10,
        totalTokens: 30,
      },
      cost: {
        totalUsd: 0.002,
        currency: "USD",
      },
    };
  };
  captureThoughtDeps.invokeXaiStructured = async () => {
    throw new Error("xai should not be called");
  };

  try {
    const result = await captureThought({ text: "Raw thought with one strong claim." });

    assert.equal(calls, 2);
    assert.equal(result.meta.validationResult, "repaired_valid");
    assert.equal(result.meta.repairAttempted, true);
    assert.deepEqual(result.meta.usage, {
      inputTokens: 30,
      outputTokens: 15,
      totalTokens: 45,
    });
    assert.equal(result.meta.cost.totalUsd, 0.003);
  } finally {
    restoreDeps(originalDeps);
  }
});

test("captureThought validates input before calling a provider", async () => {
  const originalDeps = snapshotDeps();

  captureThoughtDeps.invokeAnthropicStructured = async () => {
    throw new Error("provider should not be called");
  };

  try {
    await assert.rejects(
      () => captureThought({ text: "" }),
      (error: unknown) =>
        error instanceof CaptureThoughtValidationError &&
        error.message === "text must be at least 1 character(s).",
    );
  } finally {
    restoreDeps(originalDeps);
  }
});

test("captureThought returns a structured failure after provider exhaustion", async () => {
  const originalDeps = snapshotDeps();

  captureThoughtDeps.resolveModelPolicy = () => [
    {
      provider: "anthropic",
      model: "claude-capture-test",
      promptVersion: PROMPT_VERSION,
      tier: "default",
    },
  ];
  captureThoughtDeps.invokeAnthropicStructured = async () => {
    throw new Error("provider failed");
  };

  try {
    await assert.rejects(
      () => captureThought({ text: "A thought that cannot be processed." }),
      (error: unknown) =>
        error instanceof CaptureThoughtError &&
        error.code === "AI_CAPTURE_FAILED" &&
        error.operationName === "captureThought" &&
        error.attempts === 1 &&
        error.failures[0]?.message === "provider failed",
    );
  } finally {
    restoreDeps(originalDeps);
  }
});

test("captureThought uses deterministic mock output by default when OPENAI_API_KEY is absent", async () => {
  const originalDeps = snapshotDeps();
  const previousOpenAIKey = process.env.OPENAI_API_KEY;

  delete process.env.OPENAI_API_KEY;

  try {
    const result = await captureThought({
      text: "Penny should make every claim easy to challenge before the investor demo.",
    });

    assert.equal(result.meta.provider, "mock");
    assert.equal(result.meta.model, "mock-demo");
    assert.equal(result.meta.validationResult, "valid");
    assert.equal(result.thought.title, "Penny Should Make Every Claim Easy");
    assert.equal(result.claims.length, 2);
  } finally {
    restoreEnv("OPENAI_API_KEY", previousOpenAIKey);
    restoreDeps(originalDeps);
  }
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
