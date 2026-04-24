import "server-only";

import { type ChallengeCritiqueQualityTier } from "@/server/ai/schemas/challengeCritique";

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

export function resolveModelPolicy(
  operation: AiOperationName,
  options: {
    promptVersion?: string;
    qualityTier?: ChallengeCritiqueQualityTier;
  } = {},
): AiRouteDefinition[] {
  const promptVersion = options.promptVersion?.trim() || "challenge-critique.v1";

  switch (operation) {
    case "generateChallengeCritique":
      return (options.qualityTier === "degraded"
        ? [
            {
              operation,
              provider: "xai",
              tier: "degraded",
              displayName: "Grok 4.1 Fast",
              model: process.env.XAI_FAST_MODEL?.trim() || "grok-4-fast",
              promptVersion,
              maxTokens: 1200,
              temperature: 0.15,
            },
          ]
        : [
        {
          operation,
          provider: "anthropic",
          tier: "default",
          displayName: "Claude Sonnet 4.6",
          model: process.env.ANTHROPIC_CHALLENGE_MODEL?.trim() || "claude-sonnet-4-20250514",
          promptVersion,
          maxTokens: 1800,
          temperature: 0.2,
        },
        {
          operation,
          provider: "xai",
          tier: "fallback",
          displayName: "Grok 4.20",
          model: process.env.XAI_CHALLENGE_FALLBACK_MODEL?.trim() || "grok-4.20",
          promptVersion,
          maxTokens: 1800,
          temperature: 0.2,
        },
        {
          operation,
          provider: "xai",
          tier: "degraded",
          displayName: "Grok 4.1 Fast",
          model: process.env.XAI_FAST_MODEL?.trim() || "grok-4-fast",
          promptVersion,
          maxTokens: 1200,
          temperature: 0.15,
        },
      ]);
    default:
      throw new Error(`Unsupported AI operation: ${operation satisfies never}`);
  }
}
