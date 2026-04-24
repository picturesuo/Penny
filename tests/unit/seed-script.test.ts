import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_SEED_USER_ID, SEED_STORY, readSeedConfig } from "../../scripts/seed.ts";

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

test("seed story describes a coherent Penny first-run loop", () => {
  assert.match(SEED_STORY.mapTitle, /Building Penny/);
  assert.match(SEED_STORY.rawThought, /raw founder thought/);
  assert.match(SEED_STORY.blockerThought, /blocker/);
  assert.match(SEED_STORY.primaryClaim, /raw thought to challenge and learn-back/);
  assert.match(SEED_STORY.supportingClaim, /Brain, Challenge, and Learn/);
  assert.match(SEED_STORY.evidenceClaim, /provenance, confidence, and critique history/);
  assert.match(SEED_STORY.tensionClaim, /weak assumptions/);
  assert.match(SEED_STORY.blockerExample, /belief update/);
});
