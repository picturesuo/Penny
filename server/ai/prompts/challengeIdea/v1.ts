export const CHALLENGE_IDEA_PROMPT_VERSION = "challengeIdea.v1";

export type ChallengeIdeaPromptInput = {
  thoughtId?: string;
  claimId?: string;
  text?: string;
};

export function buildChallengeIdeaPromptInput(input: ChallengeIdeaPromptInput) {
  return {
    operation: "challengeIdea" as const,
    promptVersion: CHALLENGE_IDEA_PROMPT_VERSION,
    task: "Pressure-test one idea and return a compact challenge plus a better version.",
    input,
    responseFields: [
      "strongestObjection",
      "hiddenAssumption",
      "counterexample",
      "betterVersion",
      "confidenceQuestion",
    ],
  };
}
