import assert from "node:assert/strict";
import test from "node:test";

import {
  PROMPT_VERSION,
  buildGenerateChallengeCritiquePrompt,
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
  const firstPrompt = buildGenerateChallengeCritiquePrompt(promptInput);
  const secondPrompt = buildGenerateChallengeCritiquePrompt(promptInput);

  assert.deepEqual(firstPrompt, secondPrompt);
  assert.equal(firstPrompt.promptVersion, PROMPT_VERSION);
  assert.equal(firstPrompt.structuredInput.operation, "generateChallengeCritique");
});

test("buildPrompt remains a compatibility alias for buildGenerateChallengeCritiquePrompt", () => {
  assert.equal(buildPrompt, buildGenerateChallengeCritiquePrompt);
});

test("buildPrompt includes claim context and the schema output contract", () => {
  const prompt = buildPrompt(promptInput);

  assert.equal(prompt.structuredInput.context.claim.text, promptInput.claimText);
  assert.equal(prompt.structuredInput.context.claim.confidenceBps, 6_200);
  assert.deepEqual(prompt.structuredInput.context.priorRoundContext, []);
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

test("buildPrompt includes claim text", () => {
  const prompt = buildGenerateChallengeCritiquePrompt(promptInput);

  assert.equal(prompt.structuredInput.context.claim.text, promptInput.claimText);
  assert.equal(prompt.userPrompt.includes(promptInput.claimText), true);
});

test("buildPrompt requests structured output", () => {
  const prompt = buildGenerateChallengeCritiquePrompt(promptInput);

  assert.match(prompt.systemPrompt, /Return only JSON/);
  assert.deepEqual(prompt.structuredInput.outputContract, {
    summary: "string",
    strongestCounterargument: "string",
    assumptions: "string[]",
    failureModes: "string[]",
    followUpQuestions: "string[]",
    suggestedConfidenceBps: "integer|null",
    uncertaintyNote: "string",
  });
});

test("buildPrompt accepts the required input shape with optional map and neighbor context omitted", () => {
  const prompt = buildGenerateChallengeCritiquePrompt({
    claimId: "claim-minimal",
    claimText: "Self-serve users will retain without founder-led onboarding.",
    claimConfidenceBps: null,
  });

  assert.equal(prompt.structuredInput.context.mapTitle, null);
  assert.equal(prompt.structuredInput.context.claim.text, "Self-serve users will retain without founder-led onboarding.");
  assert.deepEqual(prompt.structuredInput.context.neighboringClaims, []);
  assert.deepEqual(prompt.structuredInput.context.priorRoundContext, []);
});

test("buildPrompt accepts and normalizes priorRoundContext", () => {
  const prompt = buildGenerateChallengeCritiquePrompt({
    claimId: "claim-prior",
    claimText: "The current retention signal is durable.",
    claimConfidenceBps: 5_500,
    priorRoundContext: {
      roundId: "  round-previous  ",
      roundNumber: 2.8,
      summary: "  Prior critique questioned onboarding bias.  ",
      userResponse: "  I will segment self-serve users.  ",
      responsePath: "  revise  ",
      confidenceDeltaBps: -725.9,
    },
  });

  assert.deepEqual(prompt.structuredInput.context.priorRoundContext, [
    {
      roundId: "round-previous",
      roundNumber: 2,
      summary: "Prior critique questioned onboarding bias.",
      userResponse: "I will segment self-serve users.",
      responsePath: "revise",
      confidenceDeltaBps: -725,
    },
  ]);
  assert.match(prompt.userPrompt, /"priorRoundContext"/);
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
