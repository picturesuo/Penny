export const SUMMARIZE_MAP_PROMPT_VERSION = "summarizeMap.v1";

export type SummarizeMapPromptInput = {
  mapId: string;
  title: string;
  claims: string[];
};

export function buildSummarizeMapPromptInput(input: SummarizeMapPromptInput) {
  return {
    operation: "summarizeMap" as const,
    promptVersion: SUMMARIZE_MAP_PROMPT_VERSION,
    input,
    responseFields: ["summary", "keyClaims", "tensions", "nextQuestions"] as const,
  };
}
