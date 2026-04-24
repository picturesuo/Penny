export type ModelPolicyOperationName = "captureThought" | "generateChallengeCritique" | (string & {});
export type ModelPolicyQualityTier = "default" | "fallback" | "cheap";
export type ModelPolicyProviderName = "anthropic" | "xai";

export type ModelSelection = {
  operationName: string;
  provider: ModelPolicyProviderName;
  model: string;
  qualityTier: ModelPolicyQualityTier;
};

export class UnknownModelPolicyOperationError extends Error {
  constructor(operationName: string) {
    super(`No model policy is defined for operation: ${operationName}`);
    this.name = "UnknownModelPolicyOperationError";
  }
}

const DEFAULT_CLAUDE_SONNET_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_GROK_MODEL = "grok-4.20";
const DEFAULT_GROK_FAST_MODEL = "grok-4-fast";

function readEnvOverride(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function selectModelForOperation(
  operationName: ModelPolicyOperationName,
  qualityTier: ModelPolicyQualityTier = "default",
): ModelSelection {
  if (operationName !== "generateChallengeCritique" && operationName !== "captureThought") {
    throw new UnknownModelPolicyOperationError(operationName);
  }

  const anthropicEnvName = operationName === "captureThought" ? "ANTHROPIC_CAPTURE_MODEL" : "ANTHROPIC_CHALLENGE_MODEL";
  const xaiFallbackEnvName = operationName === "captureThought" ? "XAI_CAPTURE_FALLBACK_MODEL" : "XAI_CHALLENGE_FALLBACK_MODEL";

  if (qualityTier === "cheap") {
    return {
      operationName,
      provider: "xai",
      model:
        readEnvOverride(process.env.XAI_FAST_MODEL) ??
        readEnvOverride(process.env[xaiFallbackEnvName]) ??
        DEFAULT_GROK_MODEL,
      qualityTier,
    };
  }

  if (qualityTier === "default") {
    return {
      operationName,
      provider: "anthropic",
      model: readEnvOverride(process.env[anthropicEnvName]) ?? DEFAULT_CLAUDE_SONNET_MODEL,
      qualityTier,
    };
  }

  return {
    operationName,
    provider: "xai",
    model: readEnvOverride(process.env[xaiFallbackEnvName]) ?? DEFAULT_GROK_MODEL,
    qualityTier: "fallback",
  };
}
