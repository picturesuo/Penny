import assert from "node:assert/strict";
import test from "node:test";

import {
  SummarizeMapOutputValidationError,
  validateSummarizeMapOutput,
} from "../../../../server/ai/schemas/summarizeMap.ts";

test("validateSummarizeMapOutput accepts the summarize map contract", () => {
  const output = validateSummarizeMapOutput({
    summary: "The map is about onboarding.",
    keyClaims: ["Onboarding should be shorter."],
    tensions: ["Speed may reduce clarity."],
    nextQuestions: ["Which claim has the weakest evidence?"],
  });

  assert.deepEqual(output, {
    summary: "The map is about onboarding.",
    keyClaims: ["Onboarding should be shorter."],
    tensions: ["Speed may reduce clarity."],
    nextQuestions: ["Which claim has the weakest evidence?"],
  });
});

test("validateSummarizeMapOutput rejects missing arrays", () => {
  assert.throws(
    () =>
      validateSummarizeMapOutput({
        summary: "Missing the rest.",
      }),
    (error) => {
      assert.ok(error instanceof SummarizeMapOutputValidationError);
      assert.ok(error.issues.includes("keyClaims must be an array"));
      assert.ok(error.issues.includes("nextQuestions must be an array"));
      return true;
    },
  );
});
