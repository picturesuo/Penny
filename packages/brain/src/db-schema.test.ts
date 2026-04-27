import assert from "node:assert/strict";
import test from "node:test";
import { getTableName } from "drizzle-orm";
import {
  artifactKindEnum,
  artifacts,
  claimEdgeKindEnum,
  claimEdges,
  claimKindEnum,
  claims,
  moves,
  pennySchema,
  sessions,
  sources,
} from "./db/schema.ts";
import { createPennyDb, createPennySql } from "./db/client.ts";

test("Penny schema exports the minimum Wave 2 tables", () => {
  assert.equal(getTableName(sessions), "sessions");
  assert.equal(getTableName(sources), "sources");
  assert.equal(getTableName(claims), "claims");
  assert.equal(getTableName(claimEdges), "claim_edges");
  assert.equal(getTableName(moves), "moves");
  assert.equal(getTableName(artifacts), "artifacts");
});

test("Penny schema keeps core enum values narrow for the MVP", () => {
  assert.deepEqual(claimKindEnum.enumValues, ["belief", "assumption", "question", "concept"]);
  assert.deepEqual(claimEdgeKindEnum.enumValues, ["depends_on", "supports", "questions", "challenges", "clarifies"]);
  assert.deepEqual(artifactKindEnum.enumValues, ["idea_map", "challenge_brief"]);
});

test("Penny schema has a clean aggregate export surface", () => {
  assert.deepEqual(Object.keys(pennySchema).sort(), [
    "artifactKindEnum",
    "artifacts",
    "claimEdgeKindEnum",
    "claimEdges",
    "claimKindEnum",
    "claimStatusEnum",
    "claims",
    "moveKindEnum",
    "moves",
    "sessionStatusEnum",
    "sessions",
    "sourceKindEnum",
    "sources",
  ]);
});

test("Penny DB client requires DATABASE_URL before connecting", () => {
  assert.throws(() => createPennySql(""), /DATABASE_URL is required/);
  assert.throws(() => createPennyDb(""), /DATABASE_URL is required/);
});
