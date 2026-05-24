import assert from "node:assert/strict";
import test from "node:test";
import { resolveDefaultBrainRankerRecorder } from "./brain-ranker-persistence.ts";

test("default Brain Ranker recorder is disabled when local database prep is skipped", () => {
  const recorder = resolveDefaultBrainRankerRecorder({
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://stale-user:stale-pass@invalid.invalid:5432/penny",
    PENNY_AUTH_MODE: "dev",
    PENNY_SKIP_DATABASE_PREP: "true",
  });

  assert.equal(recorder, null);
});

test("default Brain Ranker recorder still resolves for strict database-backed runtime", () => {
  const recorder = resolveDefaultBrainRankerRecorder({
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://penny:penny@db.example.test:5432/penny",
    PENNY_AUTH_MODE: "token",
    PENNY_SKIP_DATABASE_PREP: "true",
  });

  assert.ok(recorder);
});
