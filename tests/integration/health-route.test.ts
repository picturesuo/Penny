import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "../../apps/web/app/health/route.ts";

test("GET /health returns an unauthenticated backend health response", async () => {
  const response = GET();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    service: "penny-web",
  });
});
