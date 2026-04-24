import type {
  StructuredProviderCost,
  StructuredProviderRequest,
  StructuredProviderResponse,
  StructuredProviderUsage,
} from "@/server/ai/providers/anthropic";
import {
  challengeCritiqueSchemaInvalidFixtureOutput,
  challengeCritiqueSuccessFixtureOutput,
  createMockProviderError,
  createMockTimeoutError,
  defaultMockStructuredCost,
  defaultMockStructuredUsage,
  resolveMockStructuredScenario,
  type MockStructuredProviderScenarioResolver,
  waitForMockDelay,
} from "@/server/ai/testing/mock-fixtures";

export type MockAnthropicStructuredAdapterOptions = {
  cost?: StructuredProviderCost;
  delayMs?: number;
  errorMessage?: string;
  scenario?: MockStructuredProviderScenarioResolver<StructuredProviderRequest>;
  schemaInvalidOutput?: unknown;
  successOutput?: unknown;
  usage?: StructuredProviderUsage;
};

export function createMockAnthropicStructuredAdapter(
  options: MockAnthropicStructuredAdapterOptions = {},
): (request: StructuredProviderRequest) => Promise<StructuredProviderResponse> {
  return async function mockAnthropicStructured(
    request: StructuredProviderRequest,
  ): Promise<StructuredProviderResponse> {
    await waitForMockDelay(options.delayMs);

    const scenario = resolveMockStructuredScenario(options.scenario, request);

    switch (scenario) {
      case "success":
        return {
          output: options.successOutput ?? challengeCritiqueSuccessFixtureOutput,
          usage: options.usage ?? defaultMockStructuredUsage,
          cost: options.cost ?? defaultMockStructuredCost,
        };
      case "schema_invalid":
        return {
          output: options.schemaInvalidOutput ?? challengeCritiqueSchemaInvalidFixtureOutput,
          usage: options.usage ?? defaultMockStructuredUsage,
          cost: options.cost ?? defaultMockStructuredCost,
        };
      case "timeout_error":
        throw createMockTimeoutError("Anthropic");
      case "provider_error":
        throw createMockProviderError("Anthropic", options.errorMessage);
      default:
        throw createMockProviderError("Anthropic", `Unsupported mock scenario: ${scenario satisfies never}`);
    }
  };
}
