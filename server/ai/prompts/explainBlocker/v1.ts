export const EXPLAIN_BLOCKER_PROMPT_VERSION = "explainBlocker.v1";

export type ExplainBlockerPromptInput = {
  text: string;
  sessionId?: string;
};

export function buildExplainBlockerPromptInput(input: ExplainBlockerPromptInput) {
  return {
    operation: "explainBlocker" as const,
    promptVersion: EXPLAIN_BLOCKER_PROMPT_VERSION,
    input,
    responseFields: [
      "likelyBlocker",
      "missingConcept",
      "simplerExplanation",
      "nextExercise",
    ] as const,
  };
}
