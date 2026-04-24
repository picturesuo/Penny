import assert from "node:assert/strict";
import test from "node:test";

import {
  ExplainBlockerOutputValidationError,
  validateExplainBlockerOutput,
} from "../../../../server/ai/schemas/explainBlocker.ts";

test("validateExplainBlockerOutput accepts the explain blocker contract", () => {
  const output = validateExplainBlockerOutput({
    likelyBlocker: "The success condition is undefined.",
    missingConcept: "Evidence threshold",
    simplerExplanation: "The idea needs a clearer evidence threshold.",
    nextExercise: "Write one testable question.",
  });

  assert.deepEqual(output, {
    likelyBlocker: "The success condition is undefined.",
    missingConcept: "Evidence threshold",
    simplerExplanation: "The idea needs a clearer evidence threshold.",
    nextExercise: "Write one testable question.",
  });
});

test("validateExplainBlockerOutput rejects missing required fields", () => {
  assert.throws(
    () =>
      validateExplainBlockerOutput({
        likelyBlocker: "Missing the rest.",
      }),
    (error) => {
      assert.ok(error instanceof ExplainBlockerOutputValidationError);
      assert.ok(error.issues.includes("missingConcept must be a non-empty string"));
      assert.ok(error.issues.includes("nextExercise must be a non-empty string"));
      return true;
    },
  );
});
