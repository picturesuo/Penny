import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "../../apps/web/app/health/route.ts";

test("GET /health returns an unauthenticated backend health response", async () => {
  const response = GET();

  assert.equal(response.status, 200);
  const body = (await response.json()) as { ok?: unknown; service?: unknown; timestamp?: unknown };

  assert.equal(body.ok, true);
  assert.equal(body.service, "penny");
  assert.equal(typeof body.timestamp, "string");
  assert.doesNotThrow(() => new Date(body.timestamp as string).toISOString());
});
