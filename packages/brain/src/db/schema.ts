import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

function scopeColumns() {
  return {
    userId: text("user_id"),
    workspaceId: text("workspace_id"),
    projectId: text("project_id"),
    sphereId: text("sphere_id"),
  };
}

export const sessionStatusEnum = pgEnum("session_status", ["open", "completed"]);
export const sourceKindEnum = pgEnum("source_kind", ["raw_idea", "verification_citation"]);
export const claimKindEnum = pgEnum("claim_kind", ["belief", "assumption", "question", "concept"]);
export const claimStatusEnum = pgEnum("claim_status", ["exploratory", "committed", "resolved", "rejected"]);
export const claimEdgeKindEnum = pgEnum("claim_edge_kind", [
  "depends_on",
  "supports",
  "questions",
  "challenges",
  "contradicts",
  "clarifies",
  "teaches",
]);
export const claimEdgeStatusEnum = pgEnum("claim_edge_status", ["active", "acknowledged_vulnerability"]);
export const derivedEffectKindEnum = pgEnum("derived_effect_kind", [
  "shape_candidate",
  "confidence_cascade",
  "unresolved_risk",
  "stale_artifact",
  "next_move_recommendation",
]);
export const derivedEffectStatusEnum = pgEnum("derived_effect_status", [
  "pending_review",
  "accepted",
  "rejected",
  "superseded",
]);
export const shapeStatusEnum = pgEnum("shape_status", ["candidate", "confirmed", "rejected", "superseded"]);
export const focusModeEnum = pgEnum("focus_mode", ["brain", "challenge", "verify", "learn", "artifact"]);
export const focusSourceEnum = pgEnum("focus_source", [
  "autopilot_suggestion",
  "autopilot_started",
  "manual_selection",
  "challenge_response",
  "none",
]);
export const brainEmbeddingObjectTypeEnum = pgEnum("brain_embedding_object_type", [
  "brain_object",
  "session_note",
  "claim_version",
  "brain_recent",
  "artifact",
]);
export const nextMoveActionEnum = pgEnum("next_move_action", [
  "resume_open_challenge",
  "learn",
  "clarify",
  "verify",
  "challenge",
  "save_to_brain",
]);
export const challengeFailureTypeEnum = pgEnum("challenge_failure_type", [
  "weak_evidence",
  "missing_counterargument",
  "shaky_assumption",
  "analogy_break",
  "dependency_risk",
  "unaddressed_precedent",
  "premise_rejection",
  "definition_failure",
]);
export const challengeStrengthEnum = pgEnum("challenge_strength", ["weak", "moderate", "strong"]);
export const challengeRoundStatusEnum = pgEnum("challenge_round_status", ["open", "responded"]);
export const challengeRoundResponseEnum = pgEnum("challenge_round_response", ["defend", "revise", "absorb"]);
export const brainRunOperationEnum = pgEnum("brain_run_operation", [
  "brain.seed",
  "brain.challenge",
  "brain.learn.inline",
  "brain.artifact.challenge_brief",
  "verify_run",
]);
export const brainRunStatusEnum = pgEnum("brain_run_status", ["running", "succeeded", "failed"]);
export const recipeKindEnum = pgEnum("recipe_kind", ["learn", "verify", "check"]);
export const recipeStepStatusEnum = pgEnum("recipe_step_status", [
  "pending",
  "running",
  "completed",
  "limited",
  "failed",
  "skipped",
]);
export const commandIdempotencyStatusEnum = pgEnum("command_idempotency_status", [
  "running",
  "succeeded",
  "failed",
]);
export const moveKindEnum = pgEnum("move_kind", [
  "seed_claim_created",
  "assumptions_extracted",
  "first_challenge_suggested",
  "assumption_confirmed",
  "assumption_rejected",
  "assumption_refined",
  "challenge_issued",
  "user_defended",
  "claim_revised",
  "critique_absorbed",
  "learning_triggered",
  "next_move_recomputed",
  "autopilot_suggested",
  "autopilot_focus_started",
  "manual_node_selected",
  "focus_completed",
  "verify_run",
  "confidence_update_accepted",
  "confidence_update_rejected",
  "artifact_created",
  "wiki_page_compiled",
  "source.recorded",
  "claim.created",
  "edge.created",
  "assumption.extracted",
  "exploration.suggested",
  "challenge.created",
  "artifact.created",
  "challenge.response.defended",
  "challenge.response.revised",
  "challenge.response.absorbed",
]);
export const artifactKindEnum = pgEnum("artifact_kind", ["idea_map", "challenge_brief", "idea_map_challenge_brief"]);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    status: sessionStatusEnum("status").notNull().default("open"),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [
    index("sessions_status_idx").on(table.status),
    index("sessions_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("sessions_created_at_idx").on(table.createdAt),
  ],
);

export const brainRecents = pgTable(
  "brain_recents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),
    kind: text("kind").notNull().default("raw_idea"),
    title: text("title").notNull(),
    summary: text("summary"),
    body: text("body").notNull(),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("brain_recents_session_id_idx").on(table.sessionId),
    index("brain_recents_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("brain_recents_kind_idx").on(table.kind),
    index("brain_recents_updated_at_idx").on(table.updatedAt),
    check("brain_recents_kind_present", sql`length(trim(${table.kind})) > 0`),
    check("brain_recents_title_present", sql`length(trim(${table.title})) > 0`),
    check("brain_recents_body_present", sql`length(trim(${table.body})) > 0`),
  ],
);

export const brainObjects = pgTable(
  "brain_objects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),
    sourceRecentId: uuid("source_recent_id").references(() => brainRecents.id, { onDelete: "set null" }),
    objectType: text("object_type").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    body: text("body").notNull(),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("brain_objects_session_id_idx").on(table.sessionId),
    index("brain_objects_source_recent_id_idx").on(table.sourceRecentId),
    index("brain_objects_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("brain_objects_type_idx").on(table.objectType),
    index("brain_objects_updated_at_idx").on(table.updatedAt),
    check("brain_objects_type_present", sql`length(trim(${table.objectType})) > 0`),
    check("brain_objects_title_present", sql`length(trim(${table.title})) > 0`),
  ],
);

export const sessionNotes = pgTable(
  "session_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    content: text("content").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("session_notes_session_id_idx").on(table.sessionId),
    index("session_notes_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("session_notes_updated_at_idx").on(table.updatedAt),
  ],
);

export const brainEmbeddings = pgTable(
  "brain_embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),
    objectType: brainEmbeddingObjectTypeEnum("object_type").notNull(),
    objectId: uuid("object_id").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(),
    embeddingModel: text("embedding_model").notNull(),
    embeddingJson: jsonb("embedding_json").$type<number[]>().notNull().default([]),
    embeddingText: text("embedding_text").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("brain_embeddings_object_idx").on(table.objectType, table.objectId),
    index("brain_embeddings_session_id_idx").on(table.sessionId),
    index("brain_embeddings_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("brain_embeddings_type_idx").on(table.objectType),
    index("brain_embeddings_model_idx").on(table.embeddingModel),
    index("brain_embeddings_updated_at_idx").on(table.updatedAt),
    index("brain_embeddings_expires_at_idx").on(table.expiresAt),
    check("brain_embeddings_title_present", sql`length(trim(${table.title})) > 0`),
    check("brain_embeddings_content_present", sql`length(trim(${table.content})) > 0`),
    check("brain_embeddings_content_hash_present", sql`length(trim(${table.contentHash})) > 0`),
    check("brain_embeddings_embedding_model_present", sql`length(trim(${table.embeddingModel})) > 0`),
    check("brain_embeddings_embedding_text_present", sql`length(trim(${table.embeddingText})) > 0`),
  ],
);

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    kind: sourceKindEnum("kind").notNull().default("raw_idea"),
    rawText: text("raw_text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sources_session_id_idx").on(table.sessionId),
    index("sources_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
  ],
);

export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
    kind: claimKindEnum("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("claims_session_id_idx").on(table.sessionId),
    index("claims_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("claims_source_id_idx").on(table.sourceId),
    index("claims_kind_idx").on(table.kind),
  ],
);

export const claimVersions = pgTable(
  "claim_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
    brainRunId: uuid("brain_run_id").references(() => brainRuns.id, { onDelete: "set null" }),
    moveId: uuid("move_id").references(() => moves.id),
    content: text("content").notNull(),
    status: claimStatusEnum("status").notNull().default("exploratory"),
    confidence: integer("confidence").notNull().default(60),
    isCurrent: boolean("is_current").notNull().default(true),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    supersededByVersionId: uuid("superseded_by_version_id").references((): AnyPgColumn => claimVersions.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("claim_versions_claim_id_idx").on(table.claimId),
    index("claim_versions_source_id_idx").on(table.sourceId),
    index("claim_versions_brain_run_id_idx").on(table.brainRunId),
    index("claim_versions_move_id_idx").on(table.moveId),
    index("claim_versions_current_idx").on(table.claimId, table.isCurrent),
    index("claim_versions_validity_idx").on(table.claimId, table.validFrom, table.validUntil),
    index("claim_versions_superseded_by_idx").on(table.supersededByVersionId),
    uniqueIndex("claim_versions_one_current_idx").on(table.claimId).where(sql`${table.isCurrent} = true`),
    check("claim_versions_confidence_range", sql`${table.confidence} >= 0 AND ${table.confidence} <= 100`),
    check(
      "claim_versions_validity_range",
      sql`${table.validUntil} IS NULL OR ${table.validUntil} >= ${table.validFrom}`,
    ),
    check(
      "claim_versions_current_open_validity",
      sql`(${table.isCurrent} = true AND ${table.validUntil} IS NULL AND ${table.supersededByVersionId} IS NULL) OR (${table.isCurrent} = false)`,
    ),
    check(
      "claim_versions_provenance_present",
      sql`${table.sourceId} IS NOT NULL OR ${table.brainRunId} IS NOT NULL OR ${table.moveId} IS NOT NULL`,
    ),
  ],
);

export const claimEdges = pgTable(
  "claim_edges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    fromClaimId: uuid("from_claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    toClaimId: uuid("to_claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    kind: claimEdgeKindEnum("kind").notNull(),
    status: claimEdgeStatusEnum("status").notNull().default("active"),
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("claim_edges_session_id_idx").on(table.sessionId),
    index("claim_edges_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("claim_edges_from_claim_id_idx").on(table.fromClaimId),
    index("claim_edges_to_claim_id_idx").on(table.toClaimId),
    check("claim_edges_no_self_edge", sql`${table.fromClaimId} <> ${table.toClaimId}`),
  ],
);

export const sourceSpans = pgTable(
  "source_spans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    claimId: uuid("claim_id").references(() => claims.id, { onDelete: "cascade" }),
    claimVersionId: uuid("claim_version_id").references(() => claimVersions.id, { onDelete: "cascade" }),
    startOffset: integer("start_offset").notNull(),
    endOffset: integer("end_offset").notNull(),
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("source_spans_source_id_idx").on(table.sourceId),
    index("source_spans_claim_id_idx").on(table.claimId),
    index("source_spans_claim_version_id_idx").on(table.claimVersionId),
    check("source_spans_start_offset_range", sql`${table.startOffset} >= 0`),
    check("source_spans_end_offset_range", sql`${table.endOffset} >= ${table.startOffset}`),
  ],
);

export const moves = pgTable(
  "moves",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    kind: moveKindEnum("kind").notNull(),
    summary: text("summary").notNull(),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("moves_session_id_idx").on(table.sessionId),
    index("moves_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("moves_kind_idx").on(table.kind),
    index("moves_created_at_idx").on(table.createdAt),
  ],
);

export const focusStates = pgTable(
  "focus_states",
  {
    sessionId: uuid("session_id")
      .primaryKey()
      .references(() => sessions.id, { onDelete: "cascade" }),
    ...scopeColumns(),
    mode: focusModeEnum("mode").notNull().default("brain"),
    focusedClaimId: uuid("focused_claim_id").references(() => claims.id, { onDelete: "set null" }),
    focusedEdgeId: uuid("focused_edge_id").references(() => claimEdges.id, { onDelete: "set null" }),
    source: focusSourceEnum("source").notNull().default("none"),
    suggestionMoveId: uuid("suggestion_move_id").references(() => moves.id, { onDelete: "set null" }),
    manualMoveId: uuid("manual_move_id").references(() => moves.id, { onDelete: "set null" }),
    paused: boolean("paused").notNull().default(false),
    reason: text("reason"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("focus_states_focused_claim_id_idx").on(table.focusedClaimId),
    index("focus_states_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("focus_states_focused_edge_id_idx").on(table.focusedEdgeId),
    index("focus_states_suggestion_move_id_idx").on(table.suggestionMoveId),
    index("focus_states_manual_move_id_idx").on(table.manualMoveId),
    index("focus_states_paused_idx").on(table.paused),
  ],
);

export const nextMoveCandidates = pgTable(
  "next_move_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    ...scopeColumns(),
    candidateId: text("candidate_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    graphHash: text("graph_hash").notNull(),
    action: nextMoveActionEnum("action").notNull(),
    mode: focusModeEnum("mode").notNull(),
    targetClaimId: uuid("target_claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    targetEdgeId: uuid("target_edge_id").references(() => claimEdges.id, { onDelete: "set null" }),
    score: integer("score").notNull(),
    rank: integer("rank").notNull(),
    reason: text("reason").notNull(),
    reasonCodes: jsonb("reason_codes").$type<string[]>().notNull().default([]),
    exitCriteria: jsonb("exit_criteria").notNull().default({}),
    scoreBreakdown: jsonb("score_breakdown").notNull().default({}),
    provenance: jsonb("provenance").notNull().default({}),
    selected: boolean("selected").notNull().default(false),
    selectedAt: timestamp("selected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("next_move_candidates_session_fingerprint_idx").on(table.sessionId, table.fingerprint),
    uniqueIndex("next_move_candidates_session_candidate_id_idx").on(table.sessionId, table.candidateId),
    index("next_move_candidates_session_id_idx").on(table.sessionId),
    index("next_move_candidates_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("next_move_candidates_target_claim_id_idx").on(table.targetClaimId),
    index("next_move_candidates_target_edge_id_idx").on(table.targetEdgeId),
    index("next_move_candidates_graph_hash_idx").on(table.graphHash),
    index("next_move_candidates_selected_idx").on(table.sessionId, table.selected),
    check("next_move_candidates_score_nonnegative", sql`${table.score} >= 0`),
    check("next_move_candidates_rank_positive", sql`${table.rank} > 0`),
    check("next_move_candidates_fingerprint_present", sql`length(trim(${table.fingerprint})) > 0`),
    check("next_move_candidates_graph_hash_present", sql`length(trim(${table.graphHash})) > 0`),
  ],
);

export const derivedEffects = pgTable(
  "derived_effects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    sourceMoveId: uuid("source_move_id")
      .notNull()
      .references(() => moves.id, { onDelete: "cascade" }),
    kind: derivedEffectKindEnum("kind").notNull(),
    status: derivedEffectStatusEnum("status").notNull().default("pending_review"),
    version: integer("version").notNull().default(1),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table) => [
    index("derived_effects_session_id_idx").on(table.sessionId),
    index("derived_effects_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("derived_effects_source_move_id_idx").on(table.sourceMoveId),
    index("derived_effects_kind_idx").on(table.kind),
    index("derived_effects_status_idx").on(table.status),
    index("derived_effects_created_at_idx").on(table.createdAt),
    check("derived_effects_version_positive", sql`${table.version} > 0`),
  ],
);

export const challengeRounds = pgTable(
  "challenge_rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    nextMoveCandidateId: uuid("next_move_candidate_id").references(() => nextMoveCandidates.id, {
      onDelete: "set null",
    }),
    candidateId: text("candidate_id"),
    candidateFingerprint: text("candidate_fingerprint"),
    status: challengeRoundStatusEnum("status").notNull().default("open"),
    response: challengeRoundResponseEnum("response"),
    targetClaimId: uuid("target_claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    targetClaimVersionId: uuid("target_claim_version_id")
      .notNull()
      .references(() => claimVersions.id, { onDelete: "cascade" }),
    critiqueClaimId: uuid("critique_claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    critiqueClaimVersionId: uuid("critique_claim_version_id")
      .notNull()
      .references(() => claimVersions.id, { onDelete: "cascade" }),
    challengeEdgeId: uuid("challenge_edge_id")
      .notNull()
      .references(() => claimEdges.id, { onDelete: "cascade" }),
    brainRunId: uuid("brain_run_id")
      .notNull()
      .references(() => brainRuns.id, { onDelete: "cascade" }),
    challengeMoveId: uuid("challenge_move_id")
      .notNull()
      .references(() => moves.id, { onDelete: "cascade" }),
    responseMoveId: uuid("response_move_id").references(() => moves.id, { onDelete: "set null" }),
    focusCompletedMoveId: uuid("focus_completed_move_id").references(() => moves.id, { onDelete: "set null" }),
    failureType: challengeFailureTypeEnum("failure_type").notNull(),
    strength: challengeStrengthEnum("strength").notNull(),
    critique: text("critique").notNull(),
    whyThis: text("why_this").notNull(),
    whatWouldResolveIt: text("what_would_resolve_it").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("challenge_rounds_session_id_idx").on(table.sessionId),
    index("challenge_rounds_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("challenge_rounds_next_move_candidate_id_idx").on(table.nextMoveCandidateId),
    index("challenge_rounds_target_claim_id_idx").on(table.targetClaimId),
    index("challenge_rounds_challenge_edge_id_idx").on(table.challengeEdgeId),
    index("challenge_rounds_status_idx").on(table.status),
    index("challenge_rounds_response_move_id_idx").on(table.responseMoveId),
    index("challenge_rounds_focus_completed_move_id_idx").on(table.focusCompletedMoveId),
    check(
      "challenge_rounds_response_requires_timestamp",
      sql`(${table.status} = 'open' AND ${table.respondedAt} IS NULL AND ${table.response} IS NULL) OR (${table.status} = 'responded' AND ${table.respondedAt} IS NOT NULL AND ${table.response} IS NOT NULL)`,
    ),
    check("challenge_rounds_critique_present", sql`length(trim(${table.critique})) > 0`),
    check("challenge_rounds_why_this_present", sql`length(trim(${table.whyThis})) > 0`),
    check("challenge_rounds_resolution_present", sql`length(trim(${table.whatWouldResolveIt})) > 0`),
  ],
);

export const shapes = pgTable(
  "shapes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    sourceMoveId: uuid("source_move_id")
      .notNull()
      .references(() => moves.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    status: shapeStatusEnum("status").notNull().default("candidate"),
    version: integer("version").notNull().default(1),
    label: text("label").notNull(),
    description: text("description").notNull(),
    confidence: integer("confidence").notNull().default(50),
    supportingMoveIds: jsonb("supporting_move_ids").$type<string[]>().notNull().default([]),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table) => [
    index("shapes_session_id_idx").on(table.sessionId),
    index("shapes_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("shapes_source_move_id_idx").on(table.sourceMoveId),
    index("shapes_key_idx").on(table.key),
    index("shapes_status_idx").on(table.status),
    index("shapes_created_at_idx").on(table.createdAt),
    check("shapes_confidence_range", sql`${table.confidence} >= 0 AND ${table.confidence} <= 100`),
    check("shapes_version_positive", sql`${table.version} > 0`),
  ],
);

export const brainRuns = pgTable(
  "brain_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
    operation: brainRunOperationEnum("operation").notNull(),
    provider: text("provider").notNull(),
    model: text("model"),
    status: brainRunStatusEnum("status").notNull(),
    input: jsonb("input").notNull().default({}),
    output: jsonb("output"),
    error: jsonb("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("brain_runs_session_id_idx").on(table.sessionId),
    index("brain_runs_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("brain_runs_source_id_idx").on(table.sourceId),
    index("brain_runs_operation_idx").on(table.operation),
    index("brain_runs_status_idx").on(table.status),
  ],
);

export const recipeRuns = pgTable(
  "recipe_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    targetClaimId: uuid("target_claim_id").references(() => claims.id, { onDelete: "set null" }),
    brainRunId: uuid("brain_run_id").references(() => brainRuns.id, { onDelete: "set null" }),
    kind: recipeKindEnum("kind").notNull(),
    version: integer("version").notNull().default(1),
    title: text("title").notNull(),
    goal: text("goal").notNull(),
    status: recipeStepStatusEnum("status").notNull().default("pending"),
    input: jsonb("input").notNull().default({}),
    output: jsonb("output"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("recipe_runs_session_id_idx").on(table.sessionId),
    index("recipe_runs_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("recipe_runs_target_claim_id_idx").on(table.targetClaimId),
    index("recipe_runs_brain_run_id_idx").on(table.brainRunId),
    index("recipe_runs_kind_status_idx").on(table.kind, table.status),
    index("recipe_runs_started_at_idx").on(table.startedAt),
    check("recipe_runs_version_positive", sql`${table.version} > 0`),
    check("recipe_runs_title_present", sql`length(trim(${table.title})) > 0`),
    check("recipe_runs_goal_present", sql`length(trim(${table.goal})) > 0`),
    check(
      "recipe_runs_completion_matches_status",
      sql`(${table.status} IN ('completed', 'failed', 'limited', 'skipped') AND ${table.completedAt} IS NOT NULL) OR (${table.status} IN ('pending', 'running') AND ${table.completedAt} IS NULL)`,
    ),
  ],
);

export const recipeSteps = pgTable(
  "recipe_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    recipeRunId: uuid("recipe_run_id")
      .notNull()
      .references(() => recipeRuns.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    stepKey: text("step_key").notNull(),
    title: text("title").notNull(),
    position: integer("position").notNull(),
    status: recipeStepStatusEnum("status").notNull().default("pending"),
    inputs: jsonb("inputs").notNull().default({}),
    outputs: jsonb("outputs"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("recipe_steps_run_step_key_idx").on(table.recipeRunId, table.stepKey),
    index("recipe_steps_recipe_run_id_idx").on(table.recipeRunId),
    index("recipe_steps_session_id_idx").on(table.sessionId),
    index("recipe_steps_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("recipe_steps_status_idx").on(table.status),
    check("recipe_steps_position_positive", sql`${table.position} > 0`),
    check("recipe_steps_key_present", sql`length(trim(${table.stepKey})) > 0`),
    check("recipe_steps_title_present", sql`length(trim(${table.title})) > 0`),
    check(
      "recipe_steps_completion_matches_status",
      sql`(${table.status} IN ('completed', 'failed', 'limited', 'skipped') AND ${table.completedAt} IS NOT NULL) OR (${table.status} IN ('pending', 'running') AND ${table.completedAt} IS NULL)`,
    ),
  ],
);

export const artifacts = pgTable(
  "artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    kind: artifactKindEnum("kind").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("artifacts_session_id_idx").on(table.sessionId),
    index("artifacts_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("artifacts_kind_idx").on(table.kind),
  ],
);

export const wikiPages = pgTable(
  "wiki_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    summary: text("summary").notNull(),
    content: jsonb("content").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("wiki_pages_session_id_idx").on(table.sessionId),
    index("wiki_pages_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("wiki_pages_slug_idx").on(table.slug),
    index("wiki_pages_created_at_idx").on(table.createdAt),
  ],
);

export const commandIdempotencyKeys = pgTable(
  "command_idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    route: text("route").notNull(),
    key: text("key").notNull(),
    scopeHash: text("scope_hash").notNull(),
    requestHash: text("request_hash").notNull(),
    status: commandIdempotencyStatusEnum("status").notNull().default("running"),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body"),
    error: jsonb("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("command_idempotency_route_scope_key_idx").on(table.route, table.scopeHash, table.key),
    index("command_idempotency_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("command_idempotency_route_status_idx").on(table.route, table.status),
    index("command_idempotency_created_at_idx").on(table.createdAt),
    check("command_idempotency_key_present", sql`length(trim(${table.key})) > 0`),
    check("command_idempotency_route_present", sql`length(trim(${table.route})) > 0`),
  ],
);

export const pennySchema = {
  artifacts,
  artifactKindEnum,
  brainObjects,
  brainEmbeddingObjectTypeEnum,
  brainEmbeddings,
  brainRecents,
  brainRunOperationEnum,
  brainRunStatusEnum,
  brainRuns,
  challengeFailureTypeEnum,
  challengeRoundResponseEnum,
  challengeRoundStatusEnum,
  challengeRounds,
  challengeStrengthEnum,
  commandIdempotencyKeys,
  commandIdempotencyStatusEnum,
  claimEdgeKindEnum,
  claimEdgeStatusEnum,
  claimEdges,
  claimKindEnum,
  claims,
  claimStatusEnum,
  claimVersions,
  derivedEffectKindEnum,
  derivedEffectStatusEnum,
  derivedEffects,
  focusModeEnum,
  focusSourceEnum,
  focusStates,
  moveKindEnum,
  moves,
  nextMoveActionEnum,
  nextMoveCandidates,
  recipeKindEnum,
  recipeRuns,
  recipeStepStatusEnum,
  recipeSteps,
  sessionNotes,
  sessionStatusEnum,
  sessions,
  shapeStatusEnum,
  shapes,
  sourceKindEnum,
  sourceSpans,
  sources,
  wikiPages,
};

export type BrainRunOperation = (typeof brainRunOperationEnum.enumValues)[number];
export type BrainRunStatus = (typeof brainRunStatusEnum.enumValues)[number];
