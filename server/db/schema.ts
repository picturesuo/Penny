import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
