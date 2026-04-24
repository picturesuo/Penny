export const PROMPT_VERSION = "extract-claims-v1" as const;

export type ExtractClaimsPromptInput = {
  thoughtId: string;
  rawText: string;
  suggestedTitle: string | null;
  summary: string | null;
};

export type ExtractClaimsPromptPayload = {
  operation: "extractClaims";
  promptVersion: typeof PROMPT_VERSION;
  input: ExtractClaimsPromptInput;
  outputContract: {
    claims: Array<{
      text: "string";
      confidenceBps: "integer 0..10000";
      rationale: "string|null";
    }>;
  };
  rules: string[];
};

export type ExtractClaimsPrompt = {
  promptVersion: typeof PROMPT_VERSION;
  structuredInput: ExtractClaimsPromptPayload;
  systemPrompt: string;
  userPrompt: string;
};

export function buildExtractClaimsPrompt(input: ExtractClaimsPromptInput): ExtractClaimsPrompt {
  const structuredInput: ExtractClaimsPromptPayload = {
    operation: "extractClaims",
    promptVersion: PROMPT_VERSION,
    input,
    outputContract: {
      claims: [
        {
          text: "string",
          confidenceBps: "integer 0..10000",
          rationale: "string|null",
        },
      ],
    },
    rules: [
      "Extract only claims directly supported by the raw thought.",
      "Do not invent evidence, metrics, customers, or causal mechanisms.",
      "Prefer fewer, stronger claims over many weak fragments.",
      "Use confidenceBps to represent extraction confidence, not truth confidence.",
      "Return valid JSON only with exactly the requested keys.",
    ],
  };

  return {
    promptVersion: PROMPT_VERSION,
    structuredInput,
    systemPrompt:
      "You are Penny's claim extraction parser. Convert one persisted thought into reviewable claim candidates for graph persistence.",
    userPrompt: JSON.stringify(structuredInput, null, 2),
  };
}
