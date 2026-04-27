import assert from "node:assert/strict";
import test from "node:test";
import { getTableName } from "drizzle-orm";
import {
  artifactKindEnum,
  artifacts,
  brainRuns,
  claimEdgeKindEnum,
  claimEdges,
  claimKindEnum,
  claimStatusEnum,
  claims,
  moveKindEnum,
  claimVersions,
  moves,
  pennySchema,
  sessions,
  sourceSpans,
  sources,
} from "./db/schema.ts";
import { createPennyDb, createPennySql } from "./db/client.ts";

test("Penny schema exports the minimum Wave 2 tables", () => {
  assert.equal(getTableName(sessions), "sessions");
  assert.equal(getTableName(sources), "sources");
  assert.equal(getTableName(claims), "claims");
  assert.equal(getTableName(claimVersions), "claim_versions");
  assert.equal(getTableName(claimEdges), "claim_edges");
  assert.equal(getTableName(sourceSpans), "source_spans");
  assert.equal(getTableName(moves), "moves");
  assert.equal(getTableName(brainRuns), "brain_runs");
  assert.equal(getTableName(artifacts), "artifacts");
});

test("Penny schema keeps core enum values narrow for the MVP", () => {
  assert.deepEqual(claimKindEnum.enumValues, ["belief", "assumption", "question", "concept"]);
  assert.ok(claimStatusEnum.enumValues.includes("rejected"));
  assert.deepEqual(claimEdgeKindEnum.enumValues, ["depends_on", "supports", "questions", "challenges", "clarifies"]);
  assert.ok(moveKindEnum.enumValues.includes("seed_claim_created"));
  assert.ok(moveKindEnum.enumValues.includes("assumptions_extracted"));
  assert.ok(moveKindEnum.enumValues.includes("first_challenge_suggested"));
  assert.ok(moveKindEnum.enumValues.includes("assumption_confirmed"));
  assert.ok(moveKindEnum.enumValues.includes("assumption_rejected"));
  assert.ok(moveKindEnum.enumValues.includes("assumption_refined"));
  assert.deepEqual(artifactKindEnum.enumValues, ["idea_map", "challenge_brief"]);
});

test("Penny schema has a clean aggregate export surface", () => {
  assert.deepEqual(Object.keys(pennySchema).sort(), [
    "artifactKindEnum",
    "artifacts",
    "brainRuns",
    "claimEdgeKindEnum",
    "claimEdges",
    "claimKindEnum",
    "claimStatusEnum",
    "claimVersions",
    "claims",
    "moveKindEnum",
    "moves",
    "sessionStatusEnum",
    "sessions",
    "sourceKindEnum",
    "sourceSpans",
    "sources",
  ]);
});

test("Penny DB client requires DATABASE_URL before connecting", () => {
  assert.throws(() => createPennySql(""), /DATABASE_URL is required/);
  assert.throws(() => createPennyDb(""), /DATABASE_URL is required/);
});
