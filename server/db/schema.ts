import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
  ],
);

export const maps = pgTable("maps", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const thoughts = pgTable(
  "thoughts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    mapId: uuid("map_id"),
    rawText: text("raw_text").notNull(),
    source: text("source"),
    metadataJson: jsonb("metadata_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("thoughts_user_id_idx").on(table.userId), index("thoughts_map_id_idx").on(table.mapId)],
);

export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey(),
    mapId: uuid("map_id").notNull(),
    userId: uuid("user_id").notNull(),
    body: text("body").notNull(),
    confidenceBps: integer("confidence_bps").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("claims_map_id_idx").on(table.mapId), index("claims_user_id_idx").on(table.userId)],
);

export const graphNodes = pgTable(
  "graph_nodes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    mapId: uuid("map_id").notNull(),
    claimId: uuid("claim_id"),
    thoughtId: uuid("thought_id"),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    metadataJson: jsonb("metadata_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("graph_nodes_user_id_idx").on(table.userId),
    index("graph_nodes_map_id_idx").on(table.mapId),
    index("graph_nodes_claim_id_idx").on(table.claimId),
    index("graph_nodes_thought_id_idx").on(table.thoughtId),
  ],
);

export const graphEdges = pgTable(
  "graph_edges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    mapId: uuid("map_id").notNull(),
    sourceNodeId: uuid("source_node_id").notNull(),
    targetNodeId: uuid("target_node_id").notNull(),
    kind: text("kind").notNull(),
    weightBps: integer("weight_bps"),
    metadataJson: jsonb("metadata_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("graph_edges_user_id_idx").on(table.userId),
    index("graph_edges_map_id_idx").on(table.mapId),
    index("graph_edges_source_node_id_idx").on(table.sourceNodeId),
    index("graph_edges_target_node_id_idx").on(table.targetNodeId),
  ],
);

export const confidenceRatings = pgTable(
  "confidence_ratings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    claimId: uuid("claim_id").notNull(),
    ratingBps: integer("rating_bps").notNull(),
    rationale: text("rationale"),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("confidence_ratings_user_id_idx").on(table.userId), index("confidence_ratings_claim_id_idx").on(table.claimId)],
);

export const challengeRounds = pgTable("challenge_rounds", {
  id: uuid("id").primaryKey(),
  mapId: uuid("map_id").notNull(),
  claimId: uuid("claim_id").notNull(),
  userId: uuid("user_id").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const challengeCritiques = pgTable(
  "challenge_critiques",
  {
    id: uuid("id").primaryKey(),
    roundId: uuid("round_id").notNull(),
    mapId: uuid("map_id").notNull(),
    claimId: uuid("claim_id").notNull(),
    userId: uuid("user_id").notNull(),
    status: text("status").notNull(),
    body: text("body"),
    critiqueJson: jsonb("critique_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("challenge_critiques_round_id_idx").on(table.roundId), index("challenge_critiques_user_id_idx").on(table.userId)],
);

export const movesEvents = pgTable(
  "moves_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    type: text("type").notNull(),
    payloadJson: jsonb("payload_json").notNull(),
    requestId: text("request_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("moves_events_user_id_idx").on(table.userId),
    index("moves_events_aggregate_id_idx").on(table.aggregateId),
    index("moves_events_request_id_idx").on(table.requestId),
  ],
);

export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    sessionId: uuid("session_id"),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id"),
    type: text("type").notNull(),
    payloadJson: jsonb("payload_json").notNull(),
    requestId: text("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("activity_events_user_id_idx").on(table.userId),
    index("activity_events_session_id_idx").on(table.sessionId),
    index("activity_events_aggregate_id_idx").on(table.aggregateId),
    index("activity_events_type_idx").on(table.type),
  ],
);

export const workspaceMode = pgEnum("workspace_mode", ["brain", "challenge", "learn"]);

export const aiJobStatus = pgEnum("ai_job_status", ["queued", "running", "succeeded", "failed", "cancelled"]);

export const workspaceContexts = pgTable(
  "workspace_contexts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    mapId: uuid("map_id"),
    claimId: uuid("claim_id"),
    mode: workspaceMode("mode").notNull().default("brain"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("workspace_contexts_user_id_unique").on(table.userId)],
);

export const promptVersions = pgTable(
  "prompt_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    operation: text("operation").notNull(),
    version: text("version").notNull(),
    promptHash: text("prompt_hash").notNull(),
    promptText: text("prompt_text").notNull(),
    outputSchemaJson: jsonb("output_schema_json").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("prompt_versions_operation_version_unique").on(table.operation, table.version),
    uniqueIndex("prompt_versions_prompt_hash_unique").on(table.promptHash),
  ],
);

export const aiJobs = pgTable(
  "ai_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    operation: text("operation").notNull(),
    promptVersionId: uuid("prompt_version_id"),
    status: aiJobStatus("status").notNull().default("queued"),
    inputJson: jsonb("input_json").notNull(),
    outputJson: jsonb("output_json"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("ai_jobs_user_id_idx").on(table.userId),
    index("ai_jobs_operation_idx").on(table.operation),
    index("ai_jobs_prompt_version_id_idx").on(table.promptVersionId),
    index("ai_jobs_status_idx").on(table.status),
  ],
);

export type UserRecord = typeof users.$inferSelect;
export type NewUserRecord = typeof users.$inferInsert;
export type SessionRecord = typeof sessions.$inferSelect;
export type NewSessionRecord = typeof sessions.$inferInsert;
export type MapRecord = typeof maps.$inferSelect;
export type NewMapRecord = typeof maps.$inferInsert;
export type ThoughtRecord = typeof thoughts.$inferSelect;
export type NewThoughtRecord = typeof thoughts.$inferInsert;
export type ClaimRecord = typeof claims.$inferSelect;
export type NewClaimRecord = typeof claims.$inferInsert;
export type GraphNodeRecord = typeof graphNodes.$inferSelect;
export type NewGraphNodeRecord = typeof graphNodes.$inferInsert;
export type GraphEdgeRecord = typeof graphEdges.$inferSelect;
export type NewGraphEdgeRecord = typeof graphEdges.$inferInsert;
export type ConfidenceRatingRecord = typeof confidenceRatings.$inferSelect;
export type NewConfidenceRatingRecord = typeof confidenceRatings.$inferInsert;
export type ActivityEventRecord = typeof activityEvents.$inferSelect;
export type NewActivityEventRecord = typeof activityEvents.$inferInsert;
export type PromptVersionRecord = typeof promptVersions.$inferSelect;
export type NewPromptVersionRecord = typeof promptVersions.$inferInsert;
export type AIJobRecord = typeof aiJobs.$inferSelect;
export type NewAIJobRecord = typeof aiJobs.$inferInsert;
