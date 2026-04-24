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
    text: "I am blocked because the customer evidence is unclear.",
  });

  assert.match(result.likelyBlocker, /unclear definition|dependency|scope|uncertainty/i);
  assert.equal(result.missingConcept, "Evidence threshold");
  assert.match(result.simplerExplanation, /customer evidence is unclear/i);
  assert.match(result.nextExercise, /baseline|metric|change your mind/i);
});

test("explainBlocker accepts session context with blocker text", () => {
  const result = explainBlocker({
    text: "I am not sure why the onboarding example matters.",
    sessionId: "session-123",
  });

  assert.match(result.likelyBlocker, /definition|success condition/i);
  assert.equal(result.missingConcept, "Concrete user example");
  assert.match(result.nextExercise, /yes\/no question/i);
});

test("explainBlocker rejects an empty body", () => {
  assert.throws(
    () => explainBlocker({}),
    (error) => {
      assert.ok(error instanceof ExplainBlockerValidationError);
      assert.equal(error.message, "text must be a string.");
      return true;
    },
  );
});

test("explainBlocker prompt input exposes the operation metadata without provider code", () => {
  const promptInput = buildExplainBlockerPromptInput({
    text: "A test blocker.",
    sessionId: "session-123",
  });

  assert.equal(EXPLAIN_BLOCKER_PROMPT_VERSION, "explainBlocker.v1");
  assert.equal(promptInput.operation, "explainBlocker");
  assert.equal(promptInput.promptVersion, "explainBlocker.v1");
  assert.deepEqual(promptInput.responseFields, [
    "likelyBlocker",
    "missingConcept",
    "simplerExplanation",
    "nextExercise",
  ]);
});
