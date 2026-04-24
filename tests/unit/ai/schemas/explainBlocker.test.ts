import assert from "node:assert/strict";
import test from "node:test";

import {
  ExplainBlockerOutputValidationError,
  validateExplainBlockerOutput,
} from "../../../../server/ai/schemas/explainBlocker.ts";

test("validateExplainBlockerOutput accepts the explain blocker contract", () => {
  const output = validateExplainBlockerOutput({
    blockerSummary: "The blocker is unclear evidence.",
    likelyCause: "The success condition is undefined.",
    missingInformation: "A baseline and threshold are missing.",
    nextStep: "Write one testable question.",
    confidenceQuestion: "What answer would raise confidence by 20 points?",
  });

  assert.deepEqual(output, {
    blockerSummary: "The blocker is unclear evidence.",
    likelyCause: "The success condition is undefined.",
    missingInformation: "A baseline and threshold are missing.",
    nextStep: "Write one testable question.",
    confidenceQuestion: "What answer would raise confidence by 20 points?",
  });
});

test("validateExplainBlockerOutput rejects missing required fields", () => {
  assert.throws(
    () =>
      validateExplainBlockerOutput({
        blockerSummary: "Missing the rest.",
      }),
    (error) => {
      assert.ok(error instanceof ExplainBlockerOutputValidationError);
      assert.ok(error.issues.includes("likelyCause must be a non-empty string"));
      assert.ok(error.issues.includes("confidenceQuestion must be a non-empty string"));
      return true;
    },
  );
});
