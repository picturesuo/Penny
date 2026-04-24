import assert from "node:assert/strict";
import test from "node:test";

import {
  ChallengeIdeaOutputValidationError,
  validateChallengeIdeaOutput,
} from "../../../../server/ai/schemas/challengeIdea.ts";

test("validateChallengeIdeaOutput accepts the challenge idea contract", () => {
  const output = validateChallengeIdeaOutput({
    strongestObjection: "The causal story could be backwards.",
    hiddenAssumption: "Users behave consistently across contexts.",
    counterexample: "A similar team tried it and churn increased.",
    betterVersion: "This is more likely true when the onboarding surface is stable.",
    confidenceQuestion: "What evidence would lower confidence by 20 points?",
  });

  assert.deepEqual(output, {
    strongestObjection: "The causal story could be backwards.",
    hiddenAssumption: "Users behave consistently across contexts.",
    counterexample: "A similar team tried it and churn increased.",
    betterVersion: "This is more likely true when the onboarding surface is stable.",
    confidenceQuestion: "What evidence would lower confidence by 20 points?",
  });
});

test("validateChallengeIdeaOutput rejects missing required fields", () => {
  assert.throws(
    () =>
      validateChallengeIdeaOutput({
        strongestObjection: "Missing the rest.",
      }),
    (error) => {
      assert.ok(error instanceof ChallengeIdeaOutputValidationError);
      assert.ok(error.issues.includes("hiddenAssumption must be a non-empty string"));
      assert.ok(error.issues.includes("confidenceQuestion must be a non-empty string"));
      return true;
    },
  );
});
