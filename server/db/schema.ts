import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const maps = pgTable("maps", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

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

export const workspaceMode = pgEnum("workspace_mode", ["brain", "challenge", "learn"]);

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

export type MapRecord = typeof maps.$inferSelect;
export type NewMapRecord = typeof maps.$inferInsert;
