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
export const brainRunOperationEnum = pgEnum("brain_run_operation", [
  "brain.seed",
  "brain.challenge",
  "brain.learn.inline",
  "brain.artifact.challenge_brief",
  "verify_run",
]);
export const brainRunStatusEnum = pgEnum("brain_run_status", ["running", "succeeded", "failed"]);
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
  "autopilot_suggested",
  "manual_node_selected",
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
  brainRunOperationEnum,
  brainRunStatusEnum,
  brainRuns,
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
  moveKindEnum,
  moves,
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
