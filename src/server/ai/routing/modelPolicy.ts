import "server-only";

export type AiOperationName = "generateChallengeCritique";
export type AiProviderName = "anthropic" | "xai";
export type AiRouteTier = "default" | "fallback" | "degraded";

export type AiRouteDefinition = {
  displayName: string;
  maxTokens: number;
  model: string;
  operation: AiOperationName;
  promptVersion: string;
  provider: AiProviderName;
  temperature: number;
  tier: AiRouteTier;
};

export function resolveModelPolicy(operation: AiOperationName): AiRouteDefinition[] {
  switch (operation) {
    case "generateChallengeCritique":
      return [
        {
          operation,
          provider: "anthropic",
          tier: "default",
          displayName: "Claude Sonnet 4.6",
          model: process.env.ANTHROPIC_CHALLENGE_MODEL?.trim() || "claude-sonnet-4-20250514",
          promptVersion: "challenge-critique.v1",
          maxTokens: 1800,
          temperature: 0.2,
        },
        {
          operation,
          provider: "xai",
          tier: "fallback",
          displayName: "Grok 4.20",
          model: process.env.XAI_CHALLENGE_FALLBACK_MODEL?.trim() || "grok-4.20",
          promptVersion: "challenge-critique.v1",
          maxTokens: 1800,
          temperature: 0.2,
        },
        {
          operation,
          provider: "xai",
          tier: "degraded",
          displayName: "Grok 4.1 Fast",
          model: process.env.XAI_FAST_MODEL?.trim() || "grok-4-fast",
          promptVersion: "challenge-critique.v1",
          maxTokens: 1200,
          temperature: 0.15,
        },
      ];
    default:
      throw new Error(`Unsupported AI operation: ${operation satisfies never}`);
  }
}
