import { GenerateChallengeCritiqueOutputSchema } from "@/server/ai/schemas/challengeCritique";

export type MockStructuredProviderScenario =
  | "success"
  | "schema_invalid"
  | "timeout_error"
  | "provider_error";

export type MockStructuredProviderScenarioResolver<TRequest> =
  | MockStructuredProviderScenario
  | ((request: TRequest) => MockStructuredProviderScenario);

export const challengeCritiqueSuccessFixtureOutput = GenerateChallengeCritiqueOutputSchema.parse({
  conciseCritiqueSummary:
    "The claim assumes superior distribution automatically outweighs a weaker product experience in early adoption.",
  strongestCounterargument:
    "If the product quality gap is visible in the first ten minutes of use, better distribution may only accelerate churn and negative word of mouth rather than create durable advantage.",
  assumptions: [
    "Users will tolerate a weaker core experience if acquisition is easier.",
    "Distribution channels stay proprietary long enough to matter.",
    "Incumbents cannot close the product gap quickly.",
  ],
  likelyFailureModes: [
    "Retention collapses once users compare outcomes against higher-quality alternatives.",
    "The team over-invests in acquisition before proving the product earns repeat use.",
    "Distribution advantages erode faster than expected because channels are replicable.",
  ],
  followUpQuestions: [
    "What evidence shows users continue using the product after the first disappointing experience?",
    "Which part of the distribution edge is genuinely hard for a better product to copy?",
    "What would falsify the belief that distribution matters more than product quality here?",
  ],
  suggestedConfidenceDelta: -14,
  uncertaintyNote:
    "This critique is strongest if user retention depends heavily on product quality rather than one-time access.",
});

export const challengeCritiqueSchemaInvalidFixtureOutput = {
  conciseCritiqueSummary:
    "This deliberately malformed fixture looks plausible but breaks the schema Penny expects in production.",
  strongestCounterargument:
    "The mock keeps the failure close to reality so tests can verify validator handling instead of a totally unrelated shape mismatch.",
  assumptions: "This should be an array, not a string.",
  likelyFailureModes: [
    "The evaluator should reject the payload before any persistence step treats it as valid output.",
  ],
  followUpQuestions: "This should also be an array.",
  suggestedConfidenceDelta: -14,
  uncertaintyNote: "Schema-invalid fixture.",
} as const;

export const defaultMockStructuredUsage = {
  inputTokens: 420,
  outputTokens: 210,
  totalTokens: 630,
} as const;

export const defaultMockStructuredCost = {
  totalUsd: 0.0042,
  currency: "USD",
} as const;

export function resolveMockStructuredScenario<TRequest>(
  resolver: MockStructuredProviderScenarioResolver<TRequest> | undefined,
  request: TRequest,
): MockStructuredProviderScenario {
  if (!resolver) {
    return "success";
  }

  return typeof resolver === "function" ? resolver(request) : resolver;
}

export function createMockTimeoutError(providerLabel: string) {
  return new Error(`${providerLabel} mock timed out.`);
}

export function createMockProviderError(providerLabel: string, message?: string) {
  return new Error(message?.trim() || `${providerLabel} mock failed.`);
}

export async function waitForMockDelay(delayMs: number | undefined) {
  if (!delayMs || delayMs <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
