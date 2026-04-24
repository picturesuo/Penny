import assert from "node:assert/strict";
import test from "node:test";

import { AiProviderError } from "../../../../server/ai/providers/types.ts";

test("AiProviderError preserves normalized provider failure metadata", () => {
  const error = new AiProviderError({
    message: "Service unavailable.",
    provider: "anthropic",
    reason: "http",
    retryable: true,
    status: 503,
    details: {
      requestId: "req_123",
    },
  });

  assert.equal(error.name, "ProviderError");
  assert.equal(error.code, "PROVIDER_ERROR");
  assert.equal(error.message, "Service unavailable.");
  assert.equal(error.provider, "anthropic");
  assert.equal(error.reason, "http");
  assert.equal(error.retryable, true);
  assert.equal(error.status, 503);
  assert.deepEqual(error.details, {
    requestId: "req_123",
  });
});
