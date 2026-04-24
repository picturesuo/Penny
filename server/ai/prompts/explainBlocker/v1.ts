export const EXPLAIN_BLOCKER_PROMPT_VERSION = "explainBlocker.v1";

export type ExplainBlockerPromptInput = {
  thoughtId?: string;
  claimId?: string;
  text?: string;
  blocker?: string;
};

export function buildExplainBlockerPromptInput(input: ExplainBlockerPromptInput) {
  return {
    operation: "explainBlocker" as const,
    promptVersion: EXPLAIN_BLOCKER_PROMPT_VERSION,
    input,
    responseFields: [
      "blockerSummary",
      "likelyCause",
      "missingInformation",
      "nextStep",
      "confidenceQuestion",
    ] as const,
  };
}
