import assert from "node:assert/strict";
import test from "node:test";

import {
  challengeIdea,
  ChallengeIdeaValidationError,
} from "../../../../server/ai/operations/challengeIdea.ts";
import { buildChallengeIdeaPromptInput, CHALLENGE_IDEA_PROMPT_VERSION } from "../../../../server/ai/prompts/challengeIdea/v1.ts";

test("challengeIdea returns all required Challenge and Learn fields", () => {
  const result = challengeIdea({
    claimId: "claim-123",
    text: "Penny should prioritize critique because it improves decision quality.",
  });

  assert.match(result.strongestObjection, /causal story/i);
  assert.match(result.hiddenAssumption, /key terms|same thing|people|source|number/i);
  assert.match(result.counterexample, /cause|outcome/i);
  assert.match(result.betterVersion, /A stronger version would say/);
  assert.match(result.confidenceQuestion, /20 points/);
});

test("challengeIdea accepts ID-only context for selected ideas", () => {
  const result = challengeIdea({
    thoughtId: "thought-123",
  });

  assert.match(result.betterVersion, /the selected idea thought-123/);
  assert.match(result.confidenceQuestion, /thought-123/);
});

test("challengeIdea rejects an empty body", () => {
  assert.throws(
    () => challengeIdea({}),
    (error) => {
      assert.ok(error instanceof ChallengeIdeaValidationError);
      assert.equal(error.message, "Provide at least one of thoughtId, claimId, or text.");
      return true;
    },
  );
});

test("challengeIdea prompt input exposes the operation metadata without provider code", () => {
  const promptInput = buildChallengeIdeaPromptInput({
    claimId: "claim-123",
    text: "A test claim.",
  });

  assert.equal(CHALLENGE_IDEA_PROMPT_VERSION, "challengeIdea.v1");
  assert.equal(promptInput.operation, "challengeIdea");
  assert.equal(promptInput.promptVersion, "challengeIdea.v1");
  assert.deepEqual(promptInput.responseFields, [
    "strongestObjection",
    "hiddenAssumption",
    "counterexample",
    "betterVersion",
    "confidenceQuestion",
  ]);
});
