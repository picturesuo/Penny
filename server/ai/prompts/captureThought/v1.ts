export const PROMPT_VERSION = "capture-thought-v1" as const;

export type CaptureThoughtPromptInput = {
  text: string;
  sessionId: string | null;
};

export type CaptureThoughtPromptPayload = {
  operation: "captureThought";
  promptVersion: typeof PROMPT_VERSION;
  input: {
    text: string;
    sessionId: string | null;
  };
  outputContract: {
    thought: {
      title: "string";
      summary: "string";
    };
    claims: Array<{
      text: "string";
      confidenceBps: "integer 0..10000";
      rationale: "string|null";
    }>;
  };
  rules: string[];
};

export type CaptureThoughtPrompt = {
  promptVersion: typeof PROMPT_VERSION;
  structuredInput: CaptureThoughtPromptPayload;
  systemPrompt: string;
  userPrompt: string;
};

export function buildCaptureThoughtPrompt(input: CaptureThoughtPromptInput): CaptureThoughtPrompt {
  const structuredInput: CaptureThoughtPromptPayload = {
    operation: "captureThought",
    promptVersion: PROMPT_VERSION,
    input: {
      text: input.text,
      sessionId: input.sessionId,
    },
    outputContract: {
      thought: {
        title: "string",
        summary: "string",
      },
      claims: [
        {
          text: "string",
          confidenceBps: "integer 0..10000",
          rationale: "string|null",
        },
      ],
    },
    rules: [
      "Extract concise factual or strategic claims that can later become Penny workspace claims.",
      "Do not invent evidence, names, metrics, or commitments not present in the user's text.",
      "Prefer fewer, stronger claims over many weak fragments.",
      "Use confidenceBps to represent extraction confidence, not truth confidence.",
      "Return valid JSON only with exactly the requested keys.",
    ],
  };

  return {
    promptVersion: PROMPT_VERSION,
    structuredInput,
    systemPrompt:
      "You are Penny's capture parser. Convert raw founder thinking into a compact thought summary and claim candidates for later user review.",
    userPrompt: JSON.stringify(structuredInput, null, 2),
  };
}
