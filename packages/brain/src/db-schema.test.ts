import assert from "node:assert/strict";
import test from "node:test";
import { getTableName } from "drizzle-orm";
import {
  artifactKindEnum,
  artifacts,
  brainRunOperationEnum,
  brainRunStatusEnum,
  brainRuns,
  commandIdempotencyKeys,
  commandIdempotencyStatusEnum,
  claimEdgeKindEnum,
  claimEdgeStatusEnum,
  claimEdges,
  claimKindEnum,
  claimStatusEnum,
  claims,
  derivedEffectKindEnum,
  derivedEffectStatusEnum,
  derivedEffects,
  focusModeEnum,
  focusSourceEnum,
  focusStates,
  moveKindEnum,
  nextMoveActionEnum,
  nextMoveCandidates,
  claimVersions,
  moves,
  pennySchema,
  sessions,
  shapeStatusEnum,
  shapes,
  sourceSpans,
  sources,
  wikiPages,
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
  assert.equal(getTableName(derivedEffects), "derived_effects");
  assert.equal(getTableName(focusStates), "focus_states");
  assert.equal(getTableName(nextMoveCandidates), "next_move_candidates");
  assert.equal(getTableName(shapes), "shapes");
  assert.equal(getTableName(brainRuns), "brain_runs");
  assert.equal(getTableName(artifacts), "artifacts");
  assert.equal(getTableName(wikiPages), "wiki_pages");
  assert.equal(getTableName(commandIdempotencyKeys), "command_idempotency_keys");
});

test("ClaimVersion schema tracks validity windows", () => {
  assert.equal(claimVersions.validFrom.name, "valid_from");
  assert.equal(claimVersions.validUntil.name, "valid_until");
  assert.equal(claimVersions.supersededByVersionId.name, "superseded_by_version_id");
});

test("Penny core tables persist user and workspace scope", () => {
  for (const table of [
    sessions,
    sources,
    claims,
    claimEdges,
    moves,
    derivedEffects,
    focusStates,
    nextMoveCandidates,
    shapes,
    brainRuns,
    artifacts,
    wikiPages,
    commandIdempotencyKeys,
  ]) {
    assert.equal(table.userId.name, "user_id");
    assert.equal(table.workspaceId.name, "workspace_id");
    assert.equal(table.projectId.name, "project_id");
    assert.equal(table.sphereId.name, "sphere_id");
  }
});

test("Penny schema keeps core enum values narrow for the MVP", () => {
  assert.deepEqual(claimKindEnum.enumValues, ["belief", "assumption", "question", "concept"]);
  assert.ok(claimStatusEnum.enumValues.includes("rejected"));
  assert.deepEqual(claimEdgeKindEnum.enumValues, [
    "depends_on",
    "supports",
    "questions",
    "challenges",
    "contradicts",
    "clarifies",
    "teaches",
  ]);
  assert.deepEqual(claimEdgeStatusEnum.enumValues, ["active", "acknowledged_vulnerability"]);
  assert.deepEqual(derivedEffectKindEnum.enumValues, [
    "shape_candidate",
    "confidence_cascade",
    "unresolved_risk",
    "stale_artifact",
    "next_move_recommendation",
  ]);
  assert.deepEqual(derivedEffectStatusEnum.enumValues, ["pending_review", "accepted", "rejected", "superseded"]);
  assert.deepEqual(shapeStatusEnum.enumValues, ["candidate", "confirmed", "rejected", "superseded"]);
  assert.deepEqual(focusModeEnum.enumValues, ["brain", "challenge", "verify", "learn", "artifact"]);
  assert.deepEqual(focusSourceEnum.enumValues, [
    "autopilot_suggestion",
    "autopilot_started",
    "manual_selection",
    "challenge_response",
    "none",
  ]);
  assert.deepEqual(nextMoveActionEnum.enumValues, ["resume_open_challenge", "learn", "clarify", "verify", "challenge"]);
  assert.deepEqual(brainRunOperationEnum.enumValues, [
    "brain.seed",
    "brain.challenge",
    "brain.learn.inline",
    "brain.artifact.challenge_brief",
    "verify_run",
  ]);
  assert.deepEqual(brainRunStatusEnum.enumValues, ["running", "succeeded", "failed"]);
  assert.deepEqual(commandIdempotencyStatusEnum.enumValues, ["running", "succeeded", "failed"]);
  assert.ok(moveKindEnum.enumValues.includes("seed_claim_created"));
  assert.ok(moveKindEnum.enumValues.includes("assumptions_extracted"));
  assert.ok(moveKindEnum.enumValues.includes("first_challenge_suggested"));
  assert.ok(moveKindEnum.enumValues.includes("assumption_confirmed"));
  assert.ok(moveKindEnum.enumValues.includes("assumption_rejected"));
  assert.ok(moveKindEnum.enumValues.includes("assumption_refined"));
  assert.ok(moveKindEnum.enumValues.includes("challenge_issued"));
  assert.ok(moveKindEnum.enumValues.includes("user_defended"));
  assert.ok(moveKindEnum.enumValues.includes("claim_revised"));
  assert.ok(moveKindEnum.enumValues.includes("critique_absorbed"));
  assert.ok(moveKindEnum.enumValues.includes("learning_triggered"));
  assert.ok(moveKindEnum.enumValues.includes("next_move_recomputed"));
  assert.ok(moveKindEnum.enumValues.includes("autopilot_suggested"));
  assert.ok(moveKindEnum.enumValues.includes("autopilot_focus_started"));
  assert.ok(moveKindEnum.enumValues.includes("manual_node_selected"));
  assert.ok(moveKindEnum.enumValues.includes("confidence_update_accepted"));
  assert.ok(moveKindEnum.enumValues.includes("confidence_update_rejected"));
  assert.ok(moveKindEnum.enumValues.includes("artifact_created"));
  assert.ok(moveKindEnum.enumValues.includes("wiki_page_compiled"));
  assert.deepEqual(artifactKindEnum.enumValues, ["idea_map", "challenge_brief", "idea_map_challenge_brief"]);
});

test("Penny schema has a clean aggregate export surface", () => {
  assert.deepEqual(Object.keys(pennySchema).sort(), [
    "artifactKindEnum",
    "artifacts",
    "brainRunOperationEnum",
    "brainRunStatusEnum",
    "brainRuns",
    "claimEdgeKindEnum",
    "claimEdgeStatusEnum",
    "claimEdges",
    "claimKindEnum",
    "claimStatusEnum",
    "claimVersions",
    "claims",
    "commandIdempotencyKeys",
    "commandIdempotencyStatusEnum",
    "derivedEffectKindEnum",
    "derivedEffectStatusEnum",
    "derivedEffects",
    "focusModeEnum",
    "focusSourceEnum",
    "focusStates",
    "moveKindEnum",
    "moves",
    "nextMoveActionEnum",
    "nextMoveCandidates",
    "sessionStatusEnum",
    "sessions",
    "shapeStatusEnum",
    "shapes",
    "sourceKindEnum",
    "sourceSpans",
    "sources",
    "wikiPages",
  ]);
});

test("Penny DB client requires DATABASE_URL before connecting", () => {
  assert.throws(() => createPennySql(""), /DATABASE_URL is required/);
  assert.throws(() => createPennyDb(""), /DATABASE_URL is required/);
});
