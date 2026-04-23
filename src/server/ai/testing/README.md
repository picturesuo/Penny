# AI Provider Test Doubles

These helpers are for deterministic backend tests only. They live outside Penny's production provider logic and should be imported only from test code.

## Files

- `mock-fixtures.ts`
  - shared fixture outputs
  - shared usage/cost payloads
  - scenario resolution helpers
- `mock-anthropic-adapter.ts`
  - Anthropic structured-response test double
- `mock-xai-adapter.ts`
  - xAI structured-response test double

## Supported scenarios

- `success`
  - returns a valid challenge critique payload
- `schema_invalid`
  - returns a payload that should fail `GenerateChallengeCritiqueOutputSchema`
- `timeout_error`
  - throws a timeout-style error
- `provider_error`
  - throws a generic provider failure

## Fixture outputs

- `challengeCritiqueSuccessFixtureOutput`
  - valid output, ready for schema-validation success paths
- `challengeCritiqueSchemaInvalidFixtureOutput`
  - intentionally malformed output, ready for validator-failure paths

## Vitest example

```ts
import { describe, expect, it, vi } from "vitest";
import { createMockAnthropicStructuredAdapter } from "@/server/ai/testing/mock-anthropic-adapter";
import { createMockXaiStructuredAdapter } from "@/server/ai/testing/mock-xai-adapter";

vi.mock("@/server/ai/providers/anthropic", () => ({
  invokeAnthropicStructured: createMockAnthropicStructuredAdapter({
    scenario: "success",
  }),
}));

vi.mock("@/server/ai/providers/xai", () => ({
  invokeXaiStructured: createMockXaiStructuredAdapter({
    scenario: "provider_error",
  }),
}));
```

## Jest example

```ts
jest.mock("@/server/ai/providers/anthropic", () => ({
  invokeAnthropicStructured: createMockAnthropicStructuredAdapter({
    scenario: "schema_invalid",
  }),
}));

jest.mock("@/server/ai/providers/xai", () => ({
  invokeXaiStructured: createMockXaiStructuredAdapter({
    scenario: "timeout_error",
  }),
}));
```

## Per-request scenario selection

Pass a function when one test needs mixed behavior:

```ts
const anthropic = createMockAnthropicStructuredAdapter({
  scenario: (request) =>
    request.schemaName === "generateChallengeCritique" ? "success" : "provider_error",
});
```

## Notes

- These doubles intentionally mirror the normalized `StructuredProviderResponse` shape, not raw vendor HTTP payloads.
- The fixtures are challenge-critique-oriented because that is the current structured backend path Penny actively uses.
- If a future test needs a different valid output, pass `successOutput` into the adapter factory rather than editing the shared default fixture.
