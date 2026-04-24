export type ModelPolicyOperationName = "captureThought" | "generateChallengeCritique" | (string & {});
export type ModelPolicyQualityTier = "default" | "fallback" | "cheap";
export type ModelPolicyProviderName = "anthropic" | "mock" | "openai" | "xai";

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

const DEFAULT_OPENAI_MODEL = "gpt-5.4";
const DEFAULT_MOCK_MODEL = "mock-demo";

function readEnvOverride(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function hasOpenAIKey(): boolean {
  return Boolean(readEnvOverride(process.env.OPENAI_API_KEY));
}

function selectConfiguredProviderModel(operationName: ModelPolicyOperationName): Pick<ModelSelection, "model" | "provider"> {
  if (!hasOpenAIKey()) {
    return {
      provider: "mock",
      model: readEnvOverride(process.env.MOCK_AI_MODEL) ?? DEFAULT_MOCK_MODEL,
    };
  }

  const operationModelEnvName = operationName === "captureThought" ? "OPENAI_CAPTURE_MODEL" : "OPENAI_CHALLENGE_MODEL";

  return {
    provider: "openai",
    model:
      readEnvOverride(process.env[operationModelEnvName]) ??
      readEnvOverride(process.env.OPENAI_MODEL) ??
      DEFAULT_OPENAI_MODEL,
  };
}

export function selectModelForOperation(
  operationName: ModelPolicyOperationName,
  qualityTier: ModelPolicyQualityTier = "default",
): ModelSelection {
  if (operationName !== "generateChallengeCritique" && operationName !== "captureThought") {
    throw new UnknownModelPolicyOperationError(operationName);
  }

  if (qualityTier === "cheap") {
    const selection = selectConfiguredProviderModel(operationName);
    return { operationName, ...selection, qualityTier };
  }

  if (qualityTier === "default") {
    const selection = selectConfiguredProviderModel(operationName);
    return { operationName, ...selection, qualityTier };
  }

  if (hasOpenAIKey()) {
    const selection = selectConfiguredProviderModel(operationName);
    return { operationName, ...selection, qualityTier: "fallback" };
  }

  return {
    operationName,
    provider: "mock",
    model: readEnvOverride(process.env.MOCK_AI_MODEL) ?? DEFAULT_MOCK_MODEL,
    qualityTier: "fallback",
  };
}
