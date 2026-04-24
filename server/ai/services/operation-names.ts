export const AI_OPERATION_NAMES = [
  "capture_thought",
  "extract_claims",
  "suggest_connections",
  "detect_contradictions",
  "challenge_idea",
  "explain_blocker",
  "summarize_map",
] as const;

export type AiOperationName = (typeof AI_OPERATION_NAMES)[number];

export const AI_OPERATIONS = {
  captureThought: "capture_thought",
  extractClaims: "extract_claims",
  suggestConnections: "suggest_connections",
  detectContradictions: "detect_contradictions",
  challengeIdea: "challenge_idea",
  explainBlocker: "explain_blocker",
  summarizeMap: "summarize_map",
} as const satisfies Record<string, AiOperationName>;
