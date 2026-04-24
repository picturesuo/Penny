import assert from "node:assert/strict";
import test from "node:test";

import {
  ChallengeCritiqueSchema,
  GenerateChallengeCritiqueOutputSchema,
} from "../../../../server/ai/schemas/challengeCritique.ts";

test("GenerateChallengeCritiqueOutputSchema accepts the v1 critique contract", () => {
  const parsed = ChallengeCritiqueSchema.parse({
    summary: "The claim depends on a retention lift that may not survive outside the pilot.",
    strongestCounterargument:
      "The observed lift may be an artifact of unusually motivated users and founder-led onboarding rather than a durable product effect.",
    assumptions: [
      "Pilot users represent the broader user base.",
      "The product change caused the lift instead of manual onboarding.",
    ],
    failureModes: [
      "Retention falls after self-serve onboarding replaces founder support.",
      "The strongest users retain while average users churn.",
    ],
    followUpQuestions: [
      "What happens to retention when manual onboarding is removed?",
      "Which user segment would falsify this claim fastest?",
    ],
    suggestedConfidenceBps: 4_700,
    uncertaintyNote: "The evidence is early and may be overfit to a small cohort.",
  });

  assert.equal(parsed.summary, "The claim depends on a retention lift that may not survive outside the pilot.");
  assert.equal(parsed.suggestedConfidenceBps, 4_700);
});

test("GenerateChallengeCritiqueOutputSchema remains an alias of ChallengeCritiqueSchema", () => {
  assert.equal(GenerateChallengeCritiqueOutputSchema, ChallengeCritiqueSchema);
});

test("GenerateChallengeCritiqueOutputSchema permits null suggested confidence", () => {
  const result = GenerateChallengeCritiqueOutputSchema.safeParse({
    summary: "The evidence is too thin for a numeric confidence recommendation.",
    strongestCounterargument: "There is not enough context to distinguish product effect from cohort selection.",
    assumptions: ["The available claim text is complete enough to critique."],
    failureModes: ["The critique overweights missing evidence because source context was omitted."],
    followUpQuestions: ["What direct evidence would change the confidence estimate?"],
    suggestedConfidenceBps: null,
    uncertaintyNote: "The missing context makes a numeric recommendation unjustified.",
  });

  assert.equal(result.success, true);
});

test("GenerateChallengeCritiqueOutputSchema rejects malformed or extra output", () => {
  const result = GenerateChallengeCritiqueOutputSchema.safeParse({
    summary: "Too loose.",
    strongestCounterargument: "",
    assumptions: [""],
    failureModes: "not an array",
    followUpQuestions: ["What breaks?"],
    suggestedConfidenceBps: 10_001,
    uncertaintyNote: "Unknown.",
    providerDebug: "must not leak into the contract",
  });

  assert.equal(result.success, false);
});
