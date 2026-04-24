import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_SEED_USER_ID, readSeedConfig } from "../../scripts/seed.ts";

test("readSeedConfig returns deterministic MVP seed defaults", () => {
  assert.deepEqual(readSeedConfig({}), {
    userId: DEFAULT_SEED_USER_ID,
    userEmail: "demo@penny.local",
    userDisplayName: "Penny Demo",
  });
});

test("readSeedConfig accepts environment overrides", () => {
  assert.deepEqual(
    readSeedConfig({
      PENNY_SEED_USER_ID: "11111111-1111-4111-8111-111111111111",
      PENNY_SEED_USER_EMAIL: "founder@example.com",
      PENNY_SEED_USER_NAME: "Founder Demo",
    }),
    {
      userId: "11111111-1111-4111-8111-111111111111",
      userEmail: "founder@example.com",
      userDisplayName: "Founder Demo",
    },
  );
});
