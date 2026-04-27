import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
  claimEdgeKindEnum,
  claimEdges,
  claimKindEnum,
  claims,
  claimStatusEnum,
  moveKindEnum,
  moves,
  sessionStatusEnum,
  sessions,
  sourceKindEnum,
  sources,
};
