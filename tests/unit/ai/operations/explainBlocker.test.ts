import assert from "node:assert/strict";
import test from "node:test";

import {
  explainBlocker,
  ExplainBlockerValidationError,
} from "../../../../server/ai/operations/explainBlocker.ts";
import {
  buildExplainBlockerPromptInput,
  EXPLAIN_BLOCKER_PROMPT_VERSION,
} from "../../../../server/ai/prompts/explainBlocker/v1.ts";

test("explainBlocker returns all required Learn blocker fields", () => {
  const result = explainBlocker({
    claimId: "claim-123",
    blocker: "I am blocked because the customer evidence is unclear.",
  });

  assert.match(result.blockerSummary, /customer evidence is unclear/i);
  assert.match(result.likelyCause, /dependency|undefined|uncertainty|scope/i);
  assert.match(result.missingInformation, /source|baseline|example|expected outcome|comparison/i);
  assert.match(result.nextStep, /question|check|dependency/i);
  assert.match(result.confidenceQuestion, /20 points/);
});

test("explainBlocker accepts ID-only context for selected ideas", () => {
  const result = explainBlocker({
    thoughtId: "thought-123",
  });

  assert.match(result.blockerSummary, /the selected idea thought-123/);
  assert.match(result.confidenceQuestion, /thought-123/);
});

test("explainBlocker rejects an empty body", () => {
  assert.throws(
    () => explainBlocker({}),
    (error) => {
      assert.ok(error instanceof ExplainBlockerValidationError);
      assert.equal(error.message, "Provide at least one of thoughtId, claimId, text, or blocker.");
      return true;
    },
  );
});

test("explainBlocker prompt input exposes the operation metadata without provider code", () => {
  const promptInput = buildExplainBlockerPromptInput({
    claimId: "claim-123",
    blocker: "A test blocker.",
  });

  assert.equal(EXPLAIN_BLOCKER_PROMPT_VERSION, "explainBlocker.v1");
  assert.equal(promptInput.operation, "explainBlocker");
  assert.equal(promptInput.promptVersion, "explainBlocker.v1");
  assert.deepEqual(promptInput.responseFields, [
    "blockerSummary",
    "likelyCause",
    "missingInformation",
    "nextStep",
    "confidenceQuestion",
  ]);
});
