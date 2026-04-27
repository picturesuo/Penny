import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const sessionStatusEnum = pgEnum("session_status", ["open", "completed"]);
export const sourceKindEnum = pgEnum("source_kind", ["raw_idea"]);
export const claimKindEnum = pgEnum("claim_kind", ["belief", "assumption", "question", "concept"]);
export const claimStatusEnum = pgEnum("claim_status", ["exploratory", "committed", "resolved"]);
export const claimEdgeKindEnum = pgEnum("claim_edge_kind", [
  "depends_on",
  "supports",
  "questions",
  "challenges",
  "clarifies",
]);
export const moveKindEnum = pgEnum("move_kind", [
  "seed_claim_created",
  "assumptions_extracted",
  "first_challenge_suggested",
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
export const artifactKindEnum = pgEnum("artifact_kind", ["idea_map", "challenge_brief"]);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    status: sessionStatusEnum("status").notNull().default("open"),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [
    index("sessions_status_idx").on(table.status),
    index("sessions_created_at_idx").on(table.createdAt),
  ],
);

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    kind: sourceKindEnum("kind").notNull().default("raw_idea"),
    rawText: text("raw_text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sources_session_id_idx").on(table.sessionId)],
);

export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
    kind: claimKindEnum("kind").notNull(),
    status: claimStatusEnum("status").notNull().default("exploratory"),
    text: text("text").notNull(),
    confidence: integer("confidence").notNull().default(60),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("claims_session_id_idx").on(table.sessionId),
    index("claims_source_id_idx").on(table.sourceId),
    index("claims_kind_idx").on(table.kind),
    check("claims_confidence_range", sql`${table.confidence} >= 0 AND ${table.confidence} <= 100`),
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
    content: text("content").notNull(),
    status: claimStatusEnum("status").notNull().default("exploratory"),
    confidence: integer("confidence").notNull().default(60),
    isCurrent: boolean("is_current").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("claim_versions_claim_id_idx").on(table.claimId),
    index("claim_versions_source_id_idx").on(table.sourceId),
    index("claim_versions_current_idx").on(table.claimId, table.isCurrent),
    check("claim_versions_confidence_range", sql`${table.confidence} >= 0 AND ${table.confidence} <= 100`),
  ],
);

export const claimEdges = pgTable(
  "claim_edges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("claim_edges_session_id_idx").on(table.sessionId),
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
    index("moves_kind_idx").on(table.kind),
    index("moves_created_at_idx").on(table.createdAt),
  ],
);

export const brainRuns = pgTable(
  "brain_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
    operation: text("operation").notNull(),
    provider: text("provider").notNull(),
    model: text("model"),
    status: text("status").notNull(),
    input: jsonb("input").notNull().default({}),
    output: jsonb("output"),
    error: jsonb("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("brain_runs_session_id_idx").on(table.sessionId),
    index("brain_runs_source_id_idx").on(table.sourceId),
    index("brain_runs_operation_idx").on(table.operation),
    index("brain_runs_status_idx").on(table.status),
  ],
);

export const artifacts = pgTable(
  "artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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
    index("artifacts_kind_idx").on(table.kind),
  ],
);

export const pennySchema = {
  artifacts,
  artifactKindEnum,
  brainRuns,
  claimEdgeKindEnum,
  claimEdges,
  claimKindEnum,
  claims,
  claimStatusEnum,
  claimVersions,
  moveKindEnum,
  moves,
  sessionStatusEnum,
  sessions,
  sourceKindEnum,
  sourceSpans,
  sources,
};
