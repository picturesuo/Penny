import assert from "node:assert/strict";
import test from "node:test";
import { getTableName } from "drizzle-orm";
import {
  artifactKindEnum,
  artifacts,
  brainEdgeTypeEnum,
  brainEdges,
  brainEmbeddingObjectTypeEnum,
  brainEmbeddings,
  brainNodeStatusEnum,
  brainNodeTypeEnum,
  brainNodes,
  brainObjects,
  brainRecents,
  brainRunOperationEnum,
  brainRunStatusEnum,
  brainRuns,
  checkResults,
  checkRiskEnum,
  commandIdempotencyKeys,
  commandIdempotencyStatusEnum,
  challengeFailureTypeEnum,
  challengeRoundResponseEnum,
  challengeRoundStatusEnum,
  challengeRounds,
  challengeStrengthEnum,
  claimSuggestions,
  claimEdgeKindEnum,
  claimEdgeStatusEnum,
  claimEdges,
  claimKindEnum,
  claimStatusEnum,
  claims,
  connectorAccountStatusEnum,
  connectorAccounts,
  connectorSyncJobStatusEnum,
  connectorSyncJobs,
  consentSettings,
  contextAuditEventEnum,
  contextAuditLogs,
  contextChunkProcessingStatusEnum,
  contextChunks,
  contextProviderEnum,
  contextSources,
  derivedEffectKindEnum,
  derivedEffectStatusEnum,
  derivedEffects,
  evidencePointers,
  evidenceSnippetPolicyEnum,
  focusModeEnum,
  focusSourceEnum,
  focusStates,
  learnCards,
  memoryReviewStatusEnum,
  memoryShardTypeEnum,
  memoryShards,
  memorySourceClassEnum,
  memoryVisibilityEnum,
  moveKindEnum,
  nextMoveActionEnum,
  nextMoveCandidates,
  claimVersions,
  moves,
  pennySchema,
  recipeKindEnum,
  recipeRuns,
  recipeStepStatusEnum,
  recipeSteps,
  sessionNotes,
  sessions,
  shapeStatusEnum,
  shapes,
  sourceDigests,
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
  assert.equal(getTableName(brainEmbeddings), "brain_embeddings");
  assert.equal(getTableName(brainObjects), "brain_objects");
  assert.equal(getTableName(brainRecents), "brain_recents");
  assert.equal(getTableName(sessionNotes), "session_notes");
  assert.equal(getTableName(challengeRounds), "challenge_rounds");
  assert.equal(getTableName(shapes), "shapes");
  assert.equal(getTableName(brainRuns), "brain_runs");
  assert.equal(getTableName(recipeRuns), "recipe_runs");
  assert.equal(getTableName(recipeSteps), "recipe_steps");
  assert.equal(getTableName(artifacts), "artifacts");
  assert.equal(getTableName(wikiPages), "wiki_pages");
  assert.equal(getTableName(commandIdempotencyKeys), "command_idempotency_keys");
  assert.equal(getTableName(connectorAccounts), "connector_accounts");
  assert.equal(getTableName(connectorSyncJobs), "connector_sync_jobs");
  assert.equal(getTableName(contextSources), "context_sources");
  assert.equal(getTableName(contextChunks), "context_chunks");
  assert.equal(getTableName(sourceDigests), "source_digests");
  assert.equal(getTableName(memoryShards), "memory_shards");
  assert.equal(getTableName(claimSuggestions), "claim_suggestions");
  assert.equal(getTableName(evidencePointers), "evidence_pointers");
  assert.equal(getTableName(brainNodes), "brain_nodes");
  assert.equal(getTableName(brainEdges), "brain_edges");
  assert.equal(getTableName(checkResults), "check_results");
  assert.equal(getTableName(learnCards), "learn_cards");
  assert.equal(getTableName(consentSettings), "consent_settings");
  assert.equal(getTableName(contextAuditLogs), "context_audit_logs");
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
    brainEmbeddings,
    brainObjects,
    brainRecents,
    sessionNotes,
    challengeRounds,
    shapes,
    brainRuns,
    recipeRuns,
    recipeSteps,
    artifacts,
    wikiPages,
    commandIdempotencyKeys,
    connectorAccounts,
    connectorSyncJobs,
    contextSources,
    contextChunks,
    sourceDigests,
    memoryShards,
    claimSuggestions,
    evidencePointers,
    brainNodes,
    brainEdges,
    checkResults,
    learnCards,
    consentSettings,
    contextAuditLogs,
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
  assert.deepEqual(nextMoveActionEnum.enumValues, [
    "resume_open_challenge",
    "learn",
    "clarify",
    "verify",
    "challenge",
    "save_to_brain",
  ]);
  assert.deepEqual(brainEmbeddingObjectTypeEnum.enumValues, [
    "brain_object",
    "session_note",
    "claim_version",
    "brain_recent",
    "artifact",
  ]);
  assert.deepEqual(contextProviderEnum.enumValues, [
    "manual",
    "chatgpt",
    "gmail",
    "calendar",
    "slack",
    "canvas",
    "instagram",
  ]);
  assert.deepEqual(connectorAccountStatusEnum.enumValues, ["active", "paused", "revoked", "errored"]);
  assert.deepEqual(connectorSyncJobStatusEnum.enumValues, [
    "queued",
    "running",
    "succeeded",
    "failed",
    "canceled",
  ]);
  assert.deepEqual(contextChunkProcessingStatusEnum.enumValues, [
    "ephemeral",
    "redacted",
    "extracted",
    "deleted",
    "retained",
  ]);
  assert.deepEqual(memoryShardTypeEnum.enumValues, [
    "claim",
    "preference",
    "goal",
    "taste",
    "style",
    "idea_history",
    "project",
    "person",
    "deadline",
    "concept",
  ]);
  assert.deepEqual(memorySourceClassEnum.enumValues, [
    "manual",
    "private_export",
    "email",
    "calendar_event",
    "chat",
    "learning_platform",
    "social",
  ]);
  assert.deepEqual(memoryVisibilityEnum.enumValues, ["private", "workspace", "project"]);
  assert.deepEqual(memoryReviewStatusEnum.enumValues, [
    "pending",
    "approved",
    "auto_approved",
    "rejected",
    "merged",
    "deprioritized",
  ]);
  assert.deepEqual(evidenceSnippetPolicyEnum.enumValues, [
    "metadata_only",
    "redacted_snippet",
    "full_snippet",
    "blocked",
  ]);
  assert.deepEqual(brainNodeTypeEnum.enumValues, [
    "claim",
    "assumption",
    "counterargument",
    "concept",
    "project",
    "person",
    "deadline",
    "source_digest",
    "memory_shard",
  ]);
  assert.deepEqual(brainNodeStatusEnum.enumValues, ["active", "needs_review", "archived", "invalid"]);
  assert.deepEqual(brainEdgeTypeEnum.enumValues, [
    "supports",
    "contradicts",
    "inspired_by",
    "depends_on",
    "person_related",
    "project_related",
    "deadline_for",
    "learned_from",
    "checked_by",
  ]);
  assert.deepEqual(checkRiskEnum.enumValues, [
    "contradiction",
    "weak_evidence",
    "stale_assumption",
    "circular_reasoning",
    "missing_user_goal",
    "risky_decision",
  ]);
  assert.deepEqual(contextAuditEventEnum.enumValues, [
    "connector.connected",
    "connector.refreshed",
    "connector.synced",
    "connector.revoked",
    "source.fetched",
    "chunk.redacted",
    "chunk.deleted",
    "memory.extracted",
    "memory.blocked",
    "memory.approved",
    "memory.rejected",
    "memory.edited",
    "memory.merged",
    "memory.deleted",
    "consent.updated",
    "training.preference.updated",
  ]);
  assert.deepEqual(challengeFailureTypeEnum.enumValues, [
    "weak_evidence",
    "missing_counterargument",
    "shaky_assumption",
    "analogy_break",
    "dependency_risk",
    "unaddressed_precedent",
    "premise_rejection",
    "definition_failure",
  ]);
  assert.deepEqual(challengeStrengthEnum.enumValues, ["weak", "moderate", "strong"]);
  assert.deepEqual(challengeRoundStatusEnum.enumValues, ["open", "responded"]);
  assert.deepEqual(challengeRoundResponseEnum.enumValues, ["defend", "revise", "absorb"]);
  assert.deepEqual(brainRunOperationEnum.enumValues, [
    "brain.seed",
    "brain.challenge",
    "brain.learn.inline",
    "brain.artifact.challenge_brief",
    "verify_run",
  ]);
  assert.deepEqual(brainRunStatusEnum.enumValues, ["running", "succeeded", "failed"]);
  assert.deepEqual(recipeKindEnum.enumValues, ["learn", "verify", "check"]);
  assert.deepEqual(recipeStepStatusEnum.enumValues, [
    "pending",
    "running",
    "completed",
    "limited",
    "failed",
    "skipped",
  ]);
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
  assert.ok(moveKindEnum.enumValues.includes("focus_completed"));
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
    "brainEdgeTypeEnum",
    "brainEdges",
    "brainEmbeddingObjectTypeEnum",
    "brainEmbeddings",
    "brainNodeStatusEnum",
    "brainNodeTypeEnum",
    "brainNodes",
    "brainObjects",
    "brainRecents",
    "brainRunOperationEnum",
    "brainRunStatusEnum",
    "brainRuns",
    "challengeFailureTypeEnum",
    "challengeRoundResponseEnum",
    "challengeRoundStatusEnum",
    "challengeRounds",
    "challengeStrengthEnum",
    "checkResults",
    "checkRiskEnum",
    "claimEdgeKindEnum",
    "claimEdgeStatusEnum",
    "claimEdges",
    "claimKindEnum",
    "claimStatusEnum",
    "claimSuggestions",
    "claimVersions",
    "claims",
    "commandIdempotencyKeys",
    "commandIdempotencyStatusEnum",
    "connectorAccountStatusEnum",
    "connectorAccounts",
    "connectorSyncJobStatusEnum",
    "connectorSyncJobs",
    "consentSettings",
    "contextAuditEventEnum",
    "contextAuditLogs",
    "contextChunkProcessingStatusEnum",
    "contextChunks",
    "contextProviderEnum",
    "contextSources",
    "derivedEffectKindEnum",
    "derivedEffectStatusEnum",
    "derivedEffects",
    "evidencePointers",
    "evidenceSnippetPolicyEnum",
    "focusModeEnum",
    "focusSourceEnum",
    "focusStates",
    "learnCards",
    "memoryReviewStatusEnum",
    "memoryShardTypeEnum",
    "memoryShards",
    "memorySourceClassEnum",
    "memoryVisibilityEnum",
    "moveKindEnum",
    "moves",
    "nextMoveActionEnum",
    "nextMoveCandidates",
    "recipeKindEnum",
    "recipeRuns",
    "recipeStepStatusEnum",
    "recipeSteps",
    "sessionNotes",
    "sessionStatusEnum",
    "sessions",
    "shapeStatusEnum",
    "shapes",
    "sourceDigests",
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
