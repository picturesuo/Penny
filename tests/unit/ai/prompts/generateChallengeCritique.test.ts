import assert from "node:assert/strict";
import test from "node:test";

import {
  PROMPT_VERSION,
  buildPrompt,
} from "../../../../server/ai/prompts/generateChallengeCritique/v1.ts";

const promptInput = {
  mapTitle: "Retention Thesis",
  claimId: "claim-123",
  claimText: "Weekly active usage will keep climbing after manual onboarding is removed.",
  claimConfidenceBps: 6_200,
  critiqueMode: "direct" as const,
  steelmanText: "Power users adopted quickly during the pilot.",
  userGoal: "Find the fastest falsification path before rollout.",
  neighboringClaims: [
    {
      id: "claim-124",
      text: "Pilot users received unusually high-touch onboarding.",
      confidenceBps: 7_800,
      relationship: "tension",
    },
  ],
  previousRounds: [
    {
      roundId: "round-1",
      roundNumber: 1,
      summary: "The evidence may be confounded by manual onboarding.",
      userResponse: "I need to compare self-serve users.",
      responsePath: "revise",
      confidenceDeltaBps: -900,
    },
  ],
};

test("generateChallengeCritique prompt has a pinned v1 version", () => {
  assert.equal(PROMPT_VERSION, "generateChallengeCritique.v1");
});

test("buildPrompt returns deterministic structured input", () => {
  const firstPrompt = buildPrompt(promptInput);
  const secondPrompt = buildPrompt(promptInput);

  assert.deepEqual(firstPrompt, secondPrompt);
  assert.equal(firstPrompt.promptVersion, PROMPT_VERSION);
  assert.equal(firstPrompt.structuredInput.operation, "generateChallengeCritique");
});

test("buildPrompt includes claim context and the schema output contract", () => {
  const prompt = buildPrompt(promptInput);

  assert.equal(prompt.structuredInput.context.claim.text, promptInput.claimText);
  assert.equal(prompt.structuredInput.context.claim.confidenceBps, 6_200);
  assert.deepEqual(Object.keys(prompt.structuredInput.outputContract), [
    "summary",
    "strongestCounterargument",
    "assumptions",
    "failureModes",
    "followUpQuestions",
    "suggestedConfidenceBps",
    "uncertaintyNote",
  ]);
  assert.match(prompt.systemPrompt, /Return only JSON/);
  assert.match(prompt.userPrompt, /"operation": "generateChallengeCritique"/);
});

test("buildPrompt normalizes optional strings and numeric context", () => {
  const prompt = buildPrompt({
    mapTitle: "  Map  ",
    claimId: "  claim-1  ",
    claimText: "  A claim with whitespace.  ",
    claimConfidenceBps: 4_200.9,
    steelmanText: "   ",
    userGoal: undefined,
    neighboringClaims: [
      {
        id: "  claim-2  ",
        text: "  Related claim.  ",
        confidenceBps: Number.NaN,
        relationship: "  supports  ",
      },
    ],
    previousRounds: [
      {
        roundId: "  round-1  ",
        roundNumber: 1.9,
        summary: "  Prior critique.  ",
        userResponse: "   ",
        responsePath: "  revise  ",
        confidenceDeltaBps: -125.8,
      },
    ],
  });

  assert.equal(prompt.structuredInput.context.mapTitle, "Map");
  assert.equal(prompt.structuredInput.context.claim.id, "claim-1");
  assert.equal(prompt.structuredInput.context.claim.text, "A claim with whitespace.");
  assert.equal(prompt.structuredInput.context.claim.confidenceBps, 4_200);
  assert.equal(prompt.structuredInput.context.steelmanText, null);
  assert.equal(prompt.structuredInput.context.userGoal, null);
  assert.deepEqual(prompt.structuredInput.context.neighboringClaims[0], {
    id: "claim-2",
    text: "Related claim.",
    confidenceBps: null,
    relationship: "supports",
  });
  assert.deepEqual(prompt.structuredInput.context.previousRounds[0], {
    roundId: "round-1",
    roundNumber: 1,
    summary: "Prior critique.",
    userResponse: null,
    responsePath: "revise",
    confidenceDeltaBps: -125,
  });
});
