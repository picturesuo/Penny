import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
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
  varchar,
} from "drizzle-orm/pg-core";

const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true })
  .notNull()
  .defaultNow()
  .$onUpdateFn(() => sql`now()`);

const jsonObjectDefault = sql`'{}'::jsonb`;
const jsonArrayDefault = sql`'[]'::jsonb`;

export const workspaceModeEnum = pgEnum("workspace_mode", ["brain", "challenge", "learn"]);
export const movesEventTypeEnum = pgEnum("moves_event_type", [
  "map.created",
  "claim.created",
  "claim.updated",
  "claim.confidence.changed",
  "challenge.round.started",
  "challenge.critique.requested",
  "challenge.critique.generated",
  "challenge.response.recorded",
  "learning.prompt_generated",
  "teachback.submitted",
  "concept.created",
  "concept.linked",
  "workspace.selection.changed",
]);

// Phase 1 core schema starts here. The older broader tables remain below as
// deferred compatibility surfaces until the command/projection layer is pruned.
export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    displayName: varchar("display_name", { length: 160 }),
    avatarUrl: text("avatar_url"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("profiles_email_unique").on(table.email),
    index("profiles_updated_at_idx").on(table.updatedAt),
  ],
);

export const users = profiles;

export const spheres = pgTable(
  "spheres",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    slug: varchar("slug", { length: 96 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    description: text("description"),
    colorToken: varchar("color_token", { length: 64 }),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("spheres_user_slug_unique").on(table.userId, table.slug),
    index("spheres_user_updated_at_idx").on(table.userId, table.updatedAt),
  ],
);

export const maps = pgTable(
  "maps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    sphereId: uuid("sphere_id").references(() => spheres.id, { onDelete: "set null", onUpdate: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    rawThought: text("raw_thought").notNull(),
    status: varchar("status", { length: 64 }).notNull().default("draft"),
    claimCount: integer("claim_count").notNull().default(0),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(jsonObjectDefault),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("maps_user_idx").on(table.userId),
    index("maps_sphere_idx").on(table.sphereId),
    index("maps_status_idx").on(table.status),
    index("maps_updated_at_idx").on(table.updatedAt),
  ],
);

export const concepts = pgTable(
  "concepts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    sphereId: uuid("sphere_id").references(() => spheres.id, { onDelete: "set null", onUpdate: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 128 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 64 }).notNull().default("active"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(jsonObjectDefault),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("concepts_user_slug_unique").on(table.userId, table.slug),
    index("concepts_sphere_idx").on(table.sphereId),
    index("concepts_updated_at_idx").on(table.updatedAt),
  ],
);

export const claims = pgTable(
  "claims",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    mapId: uuid("map_id")
      .notNull()
      .references(() => maps.id, { onDelete: "cascade", onUpdate: "cascade" }),
    parentClaimId: uuid("parent_claim_id").references((): AnyPgColumn => claims.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    text: text("text").notNull(),
    note: text("note"),
    kind: varchar("kind", { length: 64 }).notNull().default("claim"),
    structureKind: varchar("structure_kind", { length: 64 }),
    provenance: varchar("provenance", { length: 64 }).notNull().default("user"),
    status: varchar("status", { length: 64 }).notNull().default("open"),
    confidence: integer("confidence").notNull().default(50),
    resolutionDate: timestamp("resolution_date", { withTimezone: true }),
    lastChallengedAt: timestamp("last_challenged_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(jsonObjectDefault),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("claims_user_idx").on(table.userId),
    index("claims_map_idx").on(table.mapId),
    index("claims_parent_claim_idx").on(table.parentClaimId),
    index("claims_status_idx").on(table.status),
    index("claims_updated_at_idx").on(table.updatedAt),
    check("claims_confidence_range", sql`${table.confidence} >= 0 AND ${table.confidence} <= 100`),
  ],
);

export const workspaceContexts = pgTable(
  "workspace_contexts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    sphereId: uuid("sphere_id").references(() => spheres.id, { onDelete: "set null", onUpdate: "cascade" }),
    mapId: uuid("map_id").references(() => maps.id, { onDelete: "set null", onUpdate: "cascade" }),
    selectedClaimId: uuid("selected_claim_id").references(() => claims.id, { onDelete: "set null", onUpdate: "cascade" }),
    selectedConceptId: uuid("selected_concept_id").references(() => concepts.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    contextKey: varchar("context_key", { length: 160 }).notNull(),
    mode: workspaceModeEnum("mode").notNull().default("brain"),
    breadcrumb: jsonb("breadcrumb").$type<string[]>().notNull().default(jsonArrayDefault),
    contextSnapshot: jsonb("context_snapshot").$type<Record<string, unknown>>().notNull().default(jsonObjectDefault),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("workspace_contexts_context_key_unique").on(table.contextKey),
    uniqueIndex("workspace_contexts_user_id_unique").on(table.userId),
    index("workspace_contexts_map_idx").on(table.mapId),
    index("workspace_contexts_mode_idx").on(table.mode),
    index("workspace_contexts_updated_at_idx").on(table.updatedAt),
  ],
);

export const claimEdges = pgTable(
  "claim_edges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    mapId: uuid("map_id")
      .notNull()
      .references(() => maps.id, { onDelete: "cascade", onUpdate: "cascade" }),
    fromClaimId: uuid("from_claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade", onUpdate: "cascade" }),
    toClaimId: uuid("to_claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade", onUpdate: "cascade" }),
    edgeType: varchar("edge_type", { length: 64 }).notNull(),
    weight: integer("weight").notNull().default(50),
    rationale: text("rationale"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(jsonObjectDefault),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("claim_edges_unique").on(table.fromClaimId, table.toClaimId, table.edgeType),
    index("claim_edges_map_idx").on(table.mapId),
    index("claim_edges_from_claim_idx").on(table.fromClaimId),
    index("claim_edges_to_claim_idx").on(table.toClaimId),
    check("claim_edges_weight_range", sql`${table.weight} >= 0 AND ${table.weight} <= 100`),
    check("claim_edges_not_self_referential", sql`${table.fromClaimId} <> ${table.toClaimId}`),
  ],
);

export const claimConceptEdges = pgTable(
  "claim_concept_edges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade", onUpdate: "cascade" }),
    conceptId: uuid("concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade", onUpdate: "cascade" }),
    relationType: varchar("relation_type", { length: 64 }).notNull().default("references"),
    confidence: integer("confidence").notNull().default(50),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(jsonObjectDefault),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("claim_concept_edges_unique").on(table.claimId, table.conceptId, table.relationType),
    index("claim_concept_edges_claim_idx").on(table.claimId),
    index("claim_concept_edges_concept_idx").on(table.conceptId),
    check("claim_concept_edges_confidence_range", sql`${table.confidence} >= 0 AND ${table.confidence} <= 100`),
  ],
);

export const challengeRounds = pgTable(
  "challenge_rounds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    mapId: uuid("map_id")
      .notNull()
      .references(() => maps.id, { onDelete: "cascade", onUpdate: "cascade" }),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade", onUpdate: "cascade" }),
    workspaceContextId: uuid("workspace_context_id").references(() => workspaceContexts.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    priorRoundId: uuid("prior_round_id").references((): AnyPgColumn => challengeRounds.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    roundNumber: integer("round_number").notNull(),
    critiqueGenerated: text("critique_generated").notNull(),
    critiqueFailureTypes: jsonb("critique_failure_types").$type<string[]>().notNull().default(jsonArrayDefault),
    critiqueLens: varchar("critique_lens", { length: 128 }).notNull().default("default"),
    critiqueStrength: varchar("critique_strength", { length: 64 }).notNull().default("moderate"),
    critiqueMode: varchar("critique_mode", { length: 64 }),
    voiceLabel: varchar("voice_label", { length: 120 }),
    responsePath: varchar("response_path", { length: 32 }),
    userResponse: text("user_response"),
    confidenceAtRoundStart: integer("confidence_at_round_start").notNull(),
    confidenceAtRoundEnd: integer("confidence_at_round_end"),
    confidenceDelta: integer("confidence_delta"),
    concessions: jsonb("concessions").$type<string[]>().notNull().default(jsonArrayDefault),
    defenses: jsonb("defenses").$type<string[]>().notNull().default(jsonArrayDefault),
    dismissals: jsonb("dismissals").$type<string[]>().notNull().default(jsonArrayDefault),
    engagementScore: integer("engagement_score"),
    followUpPrompt: text("follow_up_prompt"),
    uncertainty: jsonb("uncertainty").$type<Record<string, unknown>>().notNull().default(jsonObjectDefault),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("challenge_rounds_claim_round_unique").on(table.claimId, table.roundNumber),
    index("challenge_rounds_user_idx").on(table.userId),
    index("challenge_rounds_map_idx").on(table.mapId),
    index("challenge_rounds_claim_idx").on(table.claimId),
    index("challenge_rounds_workspace_context_idx").on(table.workspaceContextId),
    index("challenge_rounds_created_at_idx").on(table.createdAt),
    check(
      "challenge_rounds_confidence_start_range",
      sql`${table.confidenceAtRoundStart} >= 0 AND ${table.confidenceAtRoundStart} <= 100`,
    ),
    check(
      "challenge_rounds_confidence_end_range",
      sql`${table.confidenceAtRoundEnd} IS NULL OR (${table.confidenceAtRoundEnd} >= 0 AND ${table.confidenceAtRoundEnd} <= 100)`,
    ),
  ],
);

export const dialecticRounds = challengeRounds;

export const challengeCritiques = pgTable(
  "challenge_critiques",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade", onUpdate: "cascade" }),
    mapId: uuid("map_id")
      .notNull()
      .references(() => maps.id, { onDelete: "cascade", onUpdate: "cascade" }),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade", onUpdate: "cascade" }),
    roundId: uuid("round_id")
      .notNull()
      .references(() => challengeRounds.id, { onDelete: "cascade", onUpdate: "cascade" }),
    workspaceContextId: uuid("workspace_context_id").references(() => workspaceContexts.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    provider: varchar("provider", { length: 64 }).notNull(),
    model: varchar("model", { length: 160 }).notNull(),
    promptVersion: varchar("prompt_version", { length: 64 }).notNull().default("v1"),
    headline: varchar("headline", { length: 240 }).notNull(),
    critiqueText: text("critique_text").notNull(),
    critiqueLens: varchar("critique_lens", { length: 128 }).notNull().default("default"),
    failureTypes: jsonb("failure_types").$type<string[]>().notNull().default(jsonArrayDefault),
    dependencyRisks: jsonb("dependency_risks").$type<string[]>().notNull().default(jsonArrayDefault),
    whyNow: text("why_now").notNull(),
    validatedOutput: jsonb("validated_output").$type<Record<string, unknown>>().notNull().default(jsonObjectDefault),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("challenge_critiques_user_idx").on(table.userId),
    index("challenge_critiques_map_idx").on(table.mapId),
    index("challenge_critiques_claim_idx").on(table.claimId),
    uniqueIndex("challenge_critiques_round_id_unique").on(table.roundId),
    index("challenge_critiques_workspace_context_idx").on(table.workspaceContextId),
    index("challenge_critiques_created_at_idx").on(table.createdAt),
  ],
);

export const learningPrompts = pgTable(
  "learning_prompts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    claimId: uuid("claim_id").references(() => claims.id, { onDelete: "set null", onUpdate: "cascade" }),
    conceptId: uuid("concept_id").references(() => concepts.id, { onDelete: "set null", onUpdate: "cascade" }),
    roundId: uuid("round_id").references(() => challengeRounds.id, { onDelete: "set null", onUpdate: "cascade" }),
    workspaceContextId: uuid("workspace_context_id").references(() => workspaceContexts.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    promptType: varchar("prompt_type", { length: 64 }).notNull(),
    triggerCondition: varchar("trigger_condition", { length: 128 }).notNull(),
    promptText: text("prompt_text").notNull(),
    promptVersion: varchar("prompt_version", { length: 64 }).notNull().default("v1"),
    providerModel: varchar("provider_model", { length: 128 }),
    status: varchar("status", { length: 64 }).notNull().default("generated"),
    promptPayload: jsonb("prompt_payload").$type<Record<string, unknown>>().notNull().default(jsonObjectDefault),
    userEngaged: boolean("user_engaged").notNull().default(false),
    engagedAt: timestamp("engaged_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("learning_prompts_user_idx").on(table.userId),
    index("learning_prompts_claim_idx").on(table.claimId),
    index("learning_prompts_concept_idx").on(table.conceptId),
    index("learning_prompts_round_idx").on(table.roundId),
    index("learning_prompts_workspace_context_idx").on(table.workspaceContextId),
    index("learning_prompts_created_at_idx").on(table.createdAt),
  ],
);

export const movesEvents = pgTable(
  "moves_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    mapId: uuid("map_id")
      .notNull()
      .references(() => maps.id, { onDelete: "cascade", onUpdate: "cascade" }),
    claimId: uuid("claim_id").references(() => claims.id, { onDelete: "set null", onUpdate: "cascade" }),
    conceptId: uuid("concept_id").references(() => concepts.id, { onDelete: "set null", onUpdate: "cascade" }),
    requestId: varchar("request_id", { length: 160 }),
    type: movesEventTypeEnum("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(jsonObjectDefault),
    createdAt,
  },
  (table) => [
    index("moves_events_user_idx").on(table.userId),
    index("moves_events_map_idx").on(table.mapId),
    index("moves_events_claim_idx").on(table.claimId),
    index("moves_events_concept_idx").on(table.conceptId),
    index("moves_events_request_id_idx").on(table.requestId),
    index("moves_events_type_idx").on(table.type),
    index("moves_events_created_at_idx").on(table.createdAt),
  ],
);
