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
export const contextProviderEnum = pgEnum("context_provider", [
  "manual",
  "chatgpt",
  "gmail",
  "calendar",
  "slack",
  "canvas",
  "instagram",
]);
export const connectorAccountStatusEnum = pgEnum("connector_account_status", [
  "active",
  "paused",
  "revoked",
  "errored",
]);
export const connectorSyncJobStatusEnum = pgEnum("connector_sync_job_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
]);
export const contextChunkProcessingStatusEnum = pgEnum("context_chunk_processing_status", [
  "ephemeral",
  "redacted",
  "extracted",
  "deleted",
  "retained",
]);
export const memoryShardTypeEnum = pgEnum("memory_shard_type", [
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
export const memorySourceClassEnum = pgEnum("memory_source_class", [
  "manual",
  "private_export",
  "email",
  "calendar_event",
  "chat",
  "learning_platform",
  "social",
]);
export const memoryVisibilityEnum = pgEnum("memory_visibility", ["private", "workspace", "project"]);
export const memoryReviewStatusEnum = pgEnum("memory_review_status", [
  "pending",
  "approved",
  "auto_approved",
  "rejected",
  "merged",
  "deprioritized",
]);
export const evidenceSnippetPolicyEnum = pgEnum("evidence_snippet_policy", [
  "metadata_only",
  "redacted_snippet",
  "full_snippet",
  "blocked",
]);
export const brainNodeTypeEnum = pgEnum("brain_node_type", [
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
export const brainNodeStatusEnum = pgEnum("brain_node_status", [
  "active",
  "needs_review",
  "archived",
  "invalid",
]);
export const brainEdgeTypeEnum = pgEnum("brain_edge_type", [
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
export const checkRiskEnum = pgEnum("check_risk", [
  "contradiction",
  "weak_evidence",
  "stale_assumption",
  "circular_reasoning",
  "missing_user_goal",
  "risky_decision",
]);
export const contextAuditEventEnum = pgEnum("context_audit_event", [
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

export const codebaseScanRuns = pgTable(
  "codebase_scan_runs",
  {
    id: text("id").primaryKey(),
    ...scopeColumns(),
    repoRoot: text("repo_root").notNull(),
    gitCommit: text("git_commit"),
    status: text("status").notNull().default("running"),
    fileCount: integer("file_count").notNull().default(0),
    chunkCount: integer("chunk_count").notNull().default(0),
    symbolCount: integer("symbol_count").notNull().default(0),
    importCount: integer("import_count").notNull().default(0),
    routeCount: integer("route_count").notNull().default(0),
    testCount: integer("test_count").notNull().default(0),
    docCount: integer("doc_count").notNull().default(0),
    findingCount: integer("finding_count").notNull().default(0),
    memoryNoteCount: integer("memory_note_count").notNull().default(0),
    changedFileCount: integer("changed_file_count").notNull().default(0),
    staleFileCount: integer("stale_file_count").notNull().default(0),
    excludedCount: integer("excluded_count").notNull().default(0),
    error: jsonb("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("codebase_scan_runs_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("codebase_scan_runs_status_idx").on(table.status),
    index("codebase_scan_runs_started_at_idx").on(table.startedAt),
    check("codebase_scan_runs_repo_root_present", sql`length(trim(${table.repoRoot})) > 0`),
    check("codebase_scan_runs_status_valid", sql`${table.status} IN ('running', 'completed', 'failed')`),
    check("codebase_scan_runs_file_count_nonnegative", sql`${table.fileCount} >= 0`),
    check("codebase_scan_runs_chunk_count_nonnegative", sql`${table.chunkCount} >= 0`),
    check("codebase_scan_runs_symbol_count_nonnegative", sql`${table.symbolCount} >= 0`),
    check("codebase_scan_runs_changed_count_nonnegative", sql`${table.changedFileCount} >= 0`),
    check("codebase_scan_runs_stale_count_nonnegative", sql`${table.staleFileCount} >= 0`),
  ],
);

export const codeFiles = pgTable(
  "code_files",
  {
    id: text("id").primaryKey(),
    scanRunId: text("scan_run_id")
      .notNull()
      .references(() => codebaseScanRuns.id, { onDelete: "cascade" }),
    ...scopeColumns(),
    path: text("path").notNull(),
    hash: text("hash").notNull(),
    previousHash: text("previous_hash"),
    size: integer("size").notNull(),
    language: text("language").notNull(),
    sourceKind: text("source_kind").notNull(),
    lineCount: integer("line_count").notNull(),
    chunkCount: integer("chunk_count").notNull().default(0),
    symbolCount: integer("symbol_count").notNull().default(0),
    importCount: integer("import_count").notNull().default(0),
    routeCount: integer("route_count").notNull().default(0),
    testCount: integer("test_count").notNull().default(0),
    docCount: integer("doc_count").notNull().default(0),
    metadata: jsonb("metadata").notNull().default({}),
    lastModifiedAt: timestamp("last_modified_at", { withTimezone: true }),
    indexedAt: timestamp("indexed_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("code_files_scope_path_idx").on(table.id, table.path),
    index("code_files_scan_run_idx").on(table.scanRunId),
    index("code_files_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("code_files_path_idx").on(table.path),
    index("code_files_hash_idx").on(table.hash),
    index("code_files_source_kind_idx").on(table.sourceKind),
    index("code_files_language_idx").on(table.language),
    index("code_files_indexed_at_idx").on(table.indexedAt),
    check("code_files_path_present", sql`length(trim(${table.path})) > 0`),
    check("code_files_hash_present", sql`length(trim(${table.hash})) > 0`),
    check("code_files_size_nonnegative", sql`${table.size} >= 0`),
    check("code_files_line_count_nonnegative", sql`${table.lineCount} >= 0`),
  ],
);

export const codeChunks = pgTable(
  "code_chunks",
  {
    id: text("id").primaryKey(),
    fileId: text("file_id")
      .notNull()
      .references(() => codeFiles.id, { onDelete: "cascade" }),
    scanRunId: text("scan_run_id")
      .notNull()
      .references(() => codebaseScanRuns.id, { onDelete: "cascade" }),
    ...scopeColumns(),
    path: text("path").notNull(),
    hash: text("hash").notNull(),
    fileHash: text("file_hash").notNull(),
    size: integer("size").notNull(),
    language: text("language").notNull(),
    sourceKind: text("source_kind").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    chunkKind: text("chunk_kind").notNull(),
    title: text("title").notNull(),
    text: text("text").notNull(),
    charStart: integer("char_start").notNull(),
    charEnd: integer("char_end").notNull(),
    lineStart: integer("line_start").notNull(),
    lineEnd: integer("line_end").notNull(),
    tokenEstimate: integer("token_estimate").notNull(),
    symbolNames: jsonb("symbol_names").$type<string[]>().notNull().default([]),
    metadata: jsonb("metadata").notNull().default({}),
    indexedAt: timestamp("indexed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("code_chunks_file_index_idx").on(table.fileId, table.chunkIndex),
    index("code_chunks_scan_run_idx").on(table.scanRunId),
    index("code_chunks_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("code_chunks_path_idx").on(table.path),
    index("code_chunks_kind_idx").on(table.chunkKind),
    index("code_chunks_hash_idx").on(table.hash),
    check("code_chunks_path_present", sql`length(trim(${table.path})) > 0`),
    check("code_chunks_hash_present", sql`length(trim(${table.hash})) > 0`),
    check("code_chunks_title_present", sql`length(trim(${table.title})) > 0`),
    check("code_chunks_text_present", sql`length(trim(${table.text})) > 0`),
    check("code_chunks_index_nonnegative", sql`${table.chunkIndex} >= 0`),
    check("code_chunks_size_nonnegative", sql`${table.size} >= 0`),
    check("code_chunks_end_after_start", sql`${table.charEnd} >= ${table.charStart}`),
    check("code_chunks_line_end_after_start", sql`${table.lineEnd} >= ${table.lineStart}`),
    check("code_chunks_token_positive", sql`${table.tokenEstimate} > 0`),
  ],
);

export const codeSymbols = pgTable(
  "code_symbols",
  {
    id: text("id").primaryKey(),
    fileId: text("file_id")
      .notNull()
      .references(() => codeFiles.id, { onDelete: "cascade" }),
    chunkId: text("chunk_id").references(() => codeChunks.id, { onDelete: "cascade" }),
    scanRunId: text("scan_run_id")
      .notNull()
      .references(() => codebaseScanRuns.id, { onDelete: "cascade" }),
    ...scopeColumns(),
    path: text("path").notNull(),
    hash: text("hash").notNull(),
    size: integer("size").notNull(),
    language: text("language").notNull(),
    sourceKind: text("source_kind").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    exported: boolean("exported").notNull().default(false),
    signature: text("signature"),
    lineStart: integer("line_start").notNull(),
    lineEnd: integer("line_end").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("code_symbols_scan_run_idx").on(table.scanRunId),
    index("code_symbols_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("code_symbols_file_idx").on(table.fileId),
    index("code_symbols_name_idx").on(table.name),
    index("code_symbols_kind_idx").on(table.kind),
    check("code_symbols_path_present", sql`length(trim(${table.path})) > 0`),
    check("code_symbols_hash_present", sql`length(trim(${table.hash})) > 0`),
    check("code_symbols_name_present", sql`length(trim(${table.name})) > 0`),
    check("code_symbols_kind_present", sql`length(trim(${table.kind})) > 0`),
    check("code_symbols_size_nonnegative", sql`${table.size} >= 0`),
  ],
);

export const codeImports = pgTable(
  "code_imports",
  {
    id: text("id").primaryKey(),
    fileId: text("file_id")
      .notNull()
      .references(() => codeFiles.id, { onDelete: "cascade" }),
    scanRunId: text("scan_run_id")
      .notNull()
      .references(() => codebaseScanRuns.id, { onDelete: "cascade" }),
    ...scopeColumns(),
    path: text("path").notNull(),
    hash: text("hash").notNull(),
    size: integer("size").notNull(),
    language: text("language").notNull(),
    sourceKind: text("source_kind").notNull(),
    importSource: text("import_source").notNull(),
    importedPath: text("imported_path"),
    specifiers: jsonb("specifiers").$type<string[]>().notNull().default([]),
    importKind: text("import_kind").notNull().default("static"),
    lineStart: integer("line_start").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("code_imports_scan_run_idx").on(table.scanRunId),
    index("code_imports_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("code_imports_file_idx").on(table.fileId),
    index("code_imports_source_idx").on(table.importSource),
    index("code_imports_imported_path_idx").on(table.importedPath),
    check("code_imports_path_present", sql`length(trim(${table.path})) > 0`),
    check("code_imports_hash_present", sql`length(trim(${table.hash})) > 0`),
    check("code_imports_source_present", sql`length(trim(${table.importSource})) > 0`),
    check("code_imports_size_nonnegative", sql`${table.size} >= 0`),
  ],
);

export const codeRoutes = pgTable(
  "code_routes",
  {
    id: text("id").primaryKey(),
    fileId: text("file_id")
      .notNull()
      .references(() => codeFiles.id, { onDelete: "cascade" }),
    chunkId: text("chunk_id").references(() => codeChunks.id, { onDelete: "cascade" }),
    scanRunId: text("scan_run_id")
      .notNull()
      .references(() => codebaseScanRuns.id, { onDelete: "cascade" }),
    ...scopeColumns(),
    path: text("path").notNull(),
    hash: text("hash").notNull(),
    size: integer("size").notNull(),
    language: text("language").notNull(),
    sourceKind: text("source_kind").notNull(),
    method: text("method").notNull(),
    routePath: text("route_path").notNull(),
    handler: text("handler"),
    lineStart: integer("line_start").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("code_routes_scan_run_idx").on(table.scanRunId),
    index("code_routes_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("code_routes_file_idx").on(table.fileId),
    index("code_routes_path_idx").on(table.routePath),
    index("code_routes_method_idx").on(table.method),
    check("code_routes_path_present", sql`length(trim(${table.path})) > 0`),
    check("code_routes_hash_present", sql`length(trim(${table.hash})) > 0`),
    check("code_routes_route_present", sql`length(trim(${table.routePath})) > 0`),
    check("code_routes_method_present", sql`length(trim(${table.method})) > 0`),
    check("code_routes_size_nonnegative", sql`${table.size} >= 0`),
  ],
);

export const codeTests = pgTable(
  "code_tests",
  {
    id: text("id").primaryKey(),
    fileId: text("file_id")
      .notNull()
      .references(() => codeFiles.id, { onDelete: "cascade" }),
    chunkId: text("chunk_id").references(() => codeChunks.id, { onDelete: "cascade" }),
    scanRunId: text("scan_run_id")
      .notNull()
      .references(() => codebaseScanRuns.id, { onDelete: "cascade" }),
    ...scopeColumns(),
    path: text("path").notNull(),
    hash: text("hash").notNull(),
    size: integer("size").notNull(),
    language: text("language").notNull(),
    sourceKind: text("source_kind").notNull(),
    name: text("name").notNull(),
    testKind: text("test_kind").notNull().default("node_test"),
    subjectPath: text("subject_path"),
    lineStart: integer("line_start").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("code_tests_scan_run_idx").on(table.scanRunId),
    index("code_tests_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("code_tests_file_idx").on(table.fileId),
    index("code_tests_subject_path_idx").on(table.subjectPath),
    check("code_tests_path_present", sql`length(trim(${table.path})) > 0`),
    check("code_tests_hash_present", sql`length(trim(${table.hash})) > 0`),
    check("code_tests_name_present", sql`length(trim(${table.name})) > 0`),
    check("code_tests_size_nonnegative", sql`${table.size} >= 0`),
  ],
);

export const codeDocs = pgTable(
  "code_docs",
  {
    id: text("id").primaryKey(),
    fileId: text("file_id")
      .notNull()
      .references(() => codeFiles.id, { onDelete: "cascade" }),
    chunkId: text("chunk_id").references(() => codeChunks.id, { onDelete: "cascade" }),
    scanRunId: text("scan_run_id")
      .notNull()
      .references(() => codebaseScanRuns.id, { onDelete: "cascade" }),
    ...scopeColumns(),
    path: text("path").notNull(),
    hash: text("hash").notNull(),
    size: integer("size").notNull(),
    language: text("language").notNull(),
    sourceKind: text("source_kind").notNull(),
    title: text("title").notNull(),
    section: text("section"),
    references: jsonb("references").$type<string[]>().notNull().default([]),
    lineStart: integer("line_start").notNull(),
    lineEnd: integer("line_end").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("code_docs_scan_run_idx").on(table.scanRunId),
    index("code_docs_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("code_docs_file_idx").on(table.fileId),
    index("code_docs_path_idx").on(table.path),
    check("code_docs_path_present", sql`length(trim(${table.path})) > 0`),
    check("code_docs_hash_present", sql`length(trim(${table.hash})) > 0`),
    check("code_docs_title_present", sql`length(trim(${table.title})) > 0`),
    check("code_docs_size_nonnegative", sql`${table.size} >= 0`),
    check("code_docs_line_end_after_start", sql`${table.lineEnd} >= ${table.lineStart}`),
  ],
);

export const codeFindings = pgTable(
  "code_findings",
  {
    id: text("id").primaryKey(),
    scanRunId: text("scan_run_id")
      .notNull()
      .references(() => codebaseScanRuns.id, { onDelete: "cascade" }),
    ...scopeColumns(),
    path: text("path"),
    hash: text("hash"),
    size: integer("size").notNull().default(0),
    language: text("language").notNull().default("unknown"),
    sourceKind: text("source_kind").notNull().default("unknown"),
    severity: text("severity").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("code_findings_scan_run_idx").on(table.scanRunId),
    index("code_findings_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("code_findings_severity_idx").on(table.severity),
    index("code_findings_path_idx").on(table.path),
    check("code_findings_severity_valid", sql`${table.severity} IN ('info', 'warning', 'error')`),
    check("code_findings_kind_present", sql`length(trim(${table.kind})) > 0`),
    check("code_findings_title_present", sql`length(trim(${table.title})) > 0`),
    check("code_findings_message_present", sql`length(trim(${table.message})) > 0`),
  ],
);

export const codeMemoryNotes = pgTable(
  "code_memory_notes",
  {
    id: text("id").primaryKey(),
    fileId: text("file_id").references(() => codeFiles.id, { onDelete: "cascade" }),
    chunkId: text("chunk_id").references(() => codeChunks.id, { onDelete: "cascade" }),
    scanRunId: text("scan_run_id")
      .notNull()
      .references(() => codebaseScanRuns.id, { onDelete: "cascade" }),
    ...scopeColumns(),
    path: text("path").notNull(),
    hash: text("hash").notNull(),
    size: integer("size").notNull(),
    language: text("language").notNull(),
    sourceKind: text("source_kind").notNull(),
    title: text("title").notNull(),
    noteKind: text("note_kind").notNull().default("memory"),
    text: text("text").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("code_memory_notes_scan_run_idx").on(table.scanRunId),
    index("code_memory_notes_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("code_memory_notes_path_idx").on(table.path),
    index("code_memory_notes_hash_idx").on(table.hash),
    check("code_memory_notes_path_present", sql`length(trim(${table.path})) > 0`),
    check("code_memory_notes_hash_present", sql`length(trim(${table.hash})) > 0`),
    check("code_memory_notes_title_present", sql`length(trim(${table.title})) > 0`),
    check("code_memory_notes_text_present", sql`length(trim(${table.text})) > 0`),
    check("code_memory_notes_size_nonnegative", sql`${table.size} >= 0`),
  ],
);

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

export const brainMemorySources = pgTable(
  "brain_memory_sources",
  {
    id: text("id").primaryKey(),
    ...scopeColumns(),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    privacy: jsonb("privacy").notNull().default({}),
    permission: jsonb("permission").notNull().default({}),
    textHash: text("text_hash").notNull(),
    contentLength: integer("content_length").notNull(),
    chunkCount: integer("chunk_count").notNull().default(0),
    memoryNodeCount: integer("memory_node_count").notNull().default(0),
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    sourceUri: text("source_uri"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("brain_memory_sources_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("brain_memory_sources_kind_idx").on(table.kind),
    index("brain_memory_sources_text_hash_idx").on(table.textHash),
    index("brain_memory_sources_deleted_at_idx").on(table.deletedAt),
    index("brain_memory_sources_updated_at_idx").on(table.updatedAt),
    check("brain_memory_sources_kind_present", sql`length(trim(${table.kind})) > 0`),
    check("brain_memory_sources_label_present", sql`length(trim(${table.label})) > 0`),
    check("brain_memory_sources_hash_present", sql`length(trim(${table.textHash})) > 0`),
    check("brain_memory_sources_content_length_nonnegative", sql`${table.contentLength} >= 0`),
    check("brain_memory_sources_chunk_count_nonnegative", sql`${table.chunkCount} >= 0`),
    check("brain_memory_sources_node_count_nonnegative", sql`${table.memoryNodeCount} >= 0`),
  ],
);

export const brainMemorySourceChunks = pgTable(
  "brain_memory_source_chunks",
  {
    id: text("id").primaryKey(),
    ...scopeColumns(),
    sourceId: text("source_id")
      .notNull()
      .references(() => brainMemorySources.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    text: text("text").notNull(),
    charStart: integer("char_start").notNull(),
    charEnd: integer("char_end").notNull(),
    tokenEstimate: integer("token_estimate").notNull(),
    hash: text("hash").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("brain_memory_chunks_source_index_idx").on(table.sourceId, table.chunkIndex),
    index("brain_memory_chunks_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("brain_memory_chunks_source_id_idx").on(table.sourceId),
    index("brain_memory_chunks_hash_idx").on(table.hash),
    index("brain_memory_chunks_deleted_at_idx").on(table.deletedAt),
    check("brain_memory_chunks_text_present", sql`length(trim(${table.text})) > 0`),
    check("brain_memory_chunks_hash_present", sql`length(trim(${table.hash})) > 0`),
    check("brain_memory_chunks_index_nonnegative", sql`${table.chunkIndex} >= 0`),
    check("brain_memory_chunks_start_nonnegative", sql`${table.charStart} >= 0`),
    check("brain_memory_chunks_end_after_start", sql`${table.charEnd} >= ${table.charStart}`),
    check("brain_memory_chunks_token_positive", sql`${table.tokenEstimate} > 0`),
  ],
);

export const brainMemoryNodes = pgTable(
  "brain_memory_nodes",
  {
    id: text("id").primaryKey(),
    ...scopeColumns(),
    sourceId: text("source_id")
      .notNull()
      .references(() => brainMemorySources.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    text: text("text").notNull(),
    chunkIds: jsonb("chunk_ids").$type<string[]>().notNull().default([]),
    confidence: integer("confidence").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    labels: jsonb("labels").$type<string[]>().notNull().default([]),
    evidenceLevel: text("evidence_level").notNull().default("inferred"),
    permission: jsonb("permission").notNull().default({}),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("brain_memory_nodes_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("brain_memory_nodes_source_id_idx").on(table.sourceId),
    index("brain_memory_nodes_type_idx").on(table.type),
    index("brain_memory_nodes_deleted_at_idx").on(table.deletedAt),
    index("brain_memory_nodes_last_seen_at_idx").on(table.lastSeenAt),
    check("brain_memory_nodes_type_present", sql`length(trim(${table.type})) > 0`),
    check("brain_memory_nodes_title_present", sql`length(trim(${table.title})) > 0`),
    check("brain_memory_nodes_summary_present", sql`length(trim(${table.summary})) > 0`),
    check("brain_memory_nodes_text_present", sql`length(trim(${table.text})) > 0`),
    check("brain_memory_nodes_confidence_range", sql`${table.confidence} >= 0 AND ${table.confidence} <= 100`),
    check(
      "brain_memory_nodes_evidence_level_valid",
      sql`${table.evidenceLevel} IN ('user_confirmed', 'grounded', 'inferred')`,
    ),
  ],
);

export const brainMemoryEdges = pgTable(
  "brain_memory_edges",
  {
    id: text("id").primaryKey(),
    ...scopeColumns(),
    kind: text("kind").notNull(),
    fromNodeId: text("from_node_id")
      .notNull()
      .references(() => brainMemoryNodes.id, { onDelete: "cascade" }),
    toNodeId: text("to_node_id")
      .notNull()
      .references(() => brainMemoryNodes.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => brainMemorySources.id, { onDelete: "cascade" }),
    weight: integer("weight").notNull().default(50),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("brain_memory_edges_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("brain_memory_edges_kind_idx").on(table.kind),
    index("brain_memory_edges_from_node_idx").on(table.fromNodeId),
    index("brain_memory_edges_to_node_idx").on(table.toNodeId),
    index("brain_memory_edges_source_id_idx").on(table.sourceId),
    index("brain_memory_edges_deleted_at_idx").on(table.deletedAt),
    check("brain_memory_edges_kind_present", sql`length(trim(${table.kind})) > 0`),
    check("brain_memory_edges_no_self_edge", sql`${table.fromNodeId} <> ${table.toNodeId}`),
    check("brain_memory_edges_weight_range", sql`${table.weight} >= 0 AND ${table.weight} <= 100`),
  ],
);

export const brainMemoryProfileSignals = pgTable(
  "brain_memory_profile_signals",
  {
    id: text("id").primaryKey(),
    ...scopeColumns(),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    summary: text("summary").notNull(),
    weight: integer("weight").notNull().default(50),
    sourceNodeIds: jsonb("source_node_ids").$type<string[]>().notNull().default([]),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("brain_memory_profile_signals_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("brain_memory_profile_signals_kind_idx").on(table.kind),
    index("brain_memory_profile_signals_deleted_at_idx").on(table.deletedAt),
    index("brain_memory_profile_signals_updated_at_idx").on(table.updatedAt),
    check("brain_memory_profile_signals_kind_present", sql`length(trim(${table.kind})) > 0`),
    check("brain_memory_profile_signals_label_present", sql`length(trim(${table.label})) > 0`),
    check("brain_memory_profile_signals_summary_present", sql`length(trim(${table.summary})) > 0`),
    check("brain_memory_profile_signals_weight_range", sql`${table.weight} >= 0 AND ${table.weight} <= 100`),
  ],
);

export const brainMemoryIngestionJobs = pgTable(
  "brain_memory_ingestion_jobs",
  {
    id: text("id").primaryKey(),
    ...scopeColumns(),
    status: text("status").notNull(),
    sourceId: text("source_id").references(() => brainMemorySources.id, { onDelete: "set null" }),
    sourceImport: jsonb("source_import"),
    errorMessages: jsonb("error_messages").$type<string[]>().notNull().default([]),
    counts: jsonb("counts").notNull().default({}),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("brain_memory_jobs_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("brain_memory_jobs_status_idx").on(table.status),
    index("brain_memory_jobs_source_id_idx").on(table.sourceId),
    index("brain_memory_jobs_imported_at_idx").on(table.importedAt),
    check("brain_memory_jobs_status_valid", sql`${table.status} IN ('completed', 'failed')`),
  ],
);

export const brainMemoryRetrievalEvents = pgTable(
  "brain_memory_retrieval_events",
  {
    id: text("id").primaryKey(),
    ...scopeColumns(),
    query: text("query").notNull(),
    contextLight: boolean("context_light").notNull().default(false),
    resultNodeIds: jsonb("result_node_ids").$type<string[]>().notNull().default([]),
    resultSourceIds: jsonb("result_source_ids").$type<string[]>().notNull().default([]),
    resultCount: integer("result_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("brain_memory_retrieval_events_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("brain_memory_retrieval_events_context_light_idx").on(table.contextLight),
    index("brain_memory_retrieval_events_created_at_idx").on(table.createdAt),
    check("brain_memory_retrieval_events_query_present", sql`length(trim(${table.query})) > 0`),
    check("brain_memory_retrieval_events_result_count_nonnegative", sql`${table.resultCount} >= 0`),
  ],
);

export const brainRankerRuns = pgTable(
  "brain_ranker_runs",
  {
    id: text("id").primaryKey(),
    ...scopeColumns(),
    createProjectId: text("create_project_id").notNull(),
    createSessionId: text("create_session_id").notNull(),
    optionSetId: text("option_set_id"),
    rawIdeaHash: text("raw_idea_hash").notNull(),
    contextLight: boolean("context_light").notNull().default(false),
    nextBestMove: jsonb("next_best_move").notNull().default({}),
    rankedCandidateIds: jsonb("ranked_candidate_ids").$type<string[]>().notNull().default([]),
    highValueMemoryNodeIds: jsonb("high_value_memory_node_ids").$type<string[]>().notNull().default([]),
    clusters: jsonb("clusters").notNull().default([]),
    developmentEventIds: jsonb("development_event_ids").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("brain_ranker_runs_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("brain_ranker_runs_create_session_idx").on(table.createProjectId, table.createSessionId),
    index("brain_ranker_runs_option_set_idx").on(table.optionSetId),
    index("brain_ranker_runs_context_light_idx").on(table.contextLight),
    index("brain_ranker_runs_created_at_idx").on(table.createdAt),
    check("brain_ranker_runs_project_present", sql`length(trim(${table.createProjectId})) > 0`),
    check("brain_ranker_runs_session_present", sql`length(trim(${table.createSessionId})) > 0`),
    check("brain_ranker_runs_raw_idea_hash_present", sql`length(trim(${table.rawIdeaHash})) > 0`),
  ],
);

export const brainRankedCandidates = pgTable(
  "brain_ranked_candidates",
  {
    id: text("id").primaryKey(),
    ...scopeColumns(),
    rankerRunId: text("ranker_run_id")
      .notNull()
      .references(() => brainRankerRuns.id, { onDelete: "cascade" }),
    lens: text("lens").notNull(),
    title: text("title").notNull(),
    topReason: text("top_reason").notNull(),
    grounding: text("grounding").notNull(),
    contextLabel: text("context_label").notNull(),
    memoryClass: text("memory_class").notNull(),
    memoryCount: integer("memory_count").notNull().default(0),
    sourceCount: integer("source_count").notNull().default(0),
    reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
    uncertainty: jsonb("uncertainty").$type<string[]>().notNull().default([]),
    memoryRefs: jsonb("memory_refs").notNull().default([]),
    sourceReferences: jsonb("source_references").notNull().default([]),
    nextBestMove: text("next_best_move").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("brain_ranked_candidates_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("brain_ranked_candidates_run_idx").on(table.rankerRunId),
    index("brain_ranked_candidates_lens_idx").on(table.lens),
    index("brain_ranked_candidates_grounding_idx").on(table.grounding),
    check("brain_ranked_candidates_lens_valid", sql`${table.lens} IN ('Personal', 'Practical', 'Valuable', 'Critical', 'Weird')`),
    check("brain_ranked_candidates_title_present", sql`length(trim(${table.title})) > 0`),
    check("brain_ranked_candidates_reason_present", sql`length(trim(${table.topReason})) > 0`),
    check("brain_ranked_candidates_grounding_valid", sql`${table.grounding} IN ('grounded', 'inferred', 'context_light')`),
    check(
      "brain_ranked_candidates_memory_class_valid",
      sql`${table.memoryClass} IN ('semantic', 'episodic', 'procedural', 'emotional_taste')`,
    ),
    check("brain_ranked_candidates_memory_count_nonnegative", sql`${table.memoryCount} >= 0`),
    check("brain_ranked_candidates_source_count_nonnegative", sql`${table.sourceCount} >= 0`),
    check("brain_ranked_candidates_next_move_present", sql`length(trim(${table.nextBestMove})) > 0`),
  ],
);

export const brainDevelopmentEvents = pgTable(
  "brain_development_events",
  {
    id: text("id").primaryKey(),
    ...scopeColumns(),
    kind: text("kind").notNull(),
    explicitness: text("explicitness").notNull().default("implicit"),
    weight: integer("weight").notNull().default(50),
    createProjectId: text("create_project_id"),
    createSessionId: text("create_session_id"),
    optionSetId: text("option_set_id"),
    artifactId: text("artifact_id"),
    exportId: text("export_id"),
    memoryNodeIds: jsonb("memory_node_ids").$type<string[]>().notNull().default([]),
    sourceReferenceIds: jsonb("source_reference_ids").$type<string[]>().notNull().default([]),
    payload: jsonb("payload").notNull().default({}),
    summary: text("summary").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("brain_development_events_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("brain_development_events_kind_idx").on(table.kind),
    index("brain_development_events_explicitness_idx").on(table.explicitness),
    index("brain_development_events_create_session_idx").on(table.createProjectId, table.createSessionId),
    index("brain_development_events_option_set_idx").on(table.optionSetId),
    index("brain_development_events_occurred_at_idx").on(table.occurredAt),
    check("brain_development_events_kind_present", sql`length(trim(${table.kind})) > 0`),
    check("brain_development_events_explicitness_valid", sql`${table.explicitness} IN ('explicit', 'implicit')`),
    check("brain_development_events_weight_range", sql`${table.weight} >= 0 AND ${table.weight} <= 100`),
    check("brain_development_events_summary_present", sql`length(trim(${table.summary})) > 0`),
  ],
);

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

export const connectorAccounts = pgTable(
  "connector_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    provider: contextProviderEnum("provider").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    status: connectorAccountStatusEnum("status").notNull().default("active"),
    encryptedAccessToken: text("encrypted_access_token"),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    lastSync: timestamp("last_sync", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("connector_accounts_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("connector_accounts_provider_idx").on(table.provider),
    index("connector_accounts_status_idx").on(table.status),
    index("connector_accounts_last_sync_idx").on(table.lastSync),
  ],
);

export const connectorSyncJobs = pgTable(
  "connector_sync_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    connectorAccountId: uuid("connector_account_id")
      .notNull()
      .references(() => connectorAccounts.id, { onDelete: "cascade" }),
    provider: contextProviderEnum("provider").notNull(),
    status: connectorSyncJobStatusEnum("status").notNull().default("queued"),
    minimumScope: jsonb("minimum_scope").notNull().default({}),
    rateLimitKey: text("rate_limit_key"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    error: jsonb("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("connector_sync_jobs_account_idx").on(table.connectorAccountId),
    index("connector_sync_jobs_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("connector_sync_jobs_provider_status_idx").on(table.provider, table.status),
    index("connector_sync_jobs_created_at_idx").on(table.createdAt),
    check(
      "connector_sync_jobs_completion_matches_status",
      sql`(${table.status} IN ('succeeded', 'failed', 'canceled') AND ${table.completedAt} IS NOT NULL) OR (${table.status} IN ('queued', 'running') AND ${table.completedAt} IS NULL)`,
    ),
  ],
);

export const connectorConnections = pgTable(
  "connector_connections",
  {
    id: text("id").primaryKey(),
    ...scopeColumns(),
    providerId: text("provider_id").notNull(),
    adapter: text("adapter").notNull().default("nango"),
    providerConfigKey: text("provider_config_key").notNull(),
    externalConnectionId: text("external_connection_id").notNull(),
    credentialRef: jsonb("credential_ref").notNull().default({}),
    status: text("status").notNull().default("connected"),
    surfaces: jsonb("surfaces").$type<string[]>().notNull().default([]),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    nextSyncAt: timestamp("next_sync_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    sourceCounts: jsonb("source_counts").notNull().default({}),
    error: jsonb("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("connector_connections_provider_external_scope_idx").on(
      table.providerId,
      table.externalConnectionId,
      table.userId,
      table.workspaceId,
    ),
    index("connector_connections_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("connector_connections_provider_status_idx").on(table.providerId, table.status),
    index("connector_connections_external_idx").on(table.externalConnectionId),
    index("connector_connections_next_sync_idx").on(table.nextSyncAt),
    check("connector_connections_provider_valid", sql`${table.providerId} IN ('google')`),
    check("connector_connections_adapter_valid", sql`${table.adapter} IN ('nango')`),
    check(
      "connector_connections_status_valid",
      sql`${table.status} IN ('available', 'connected', 'syncing', 'failed', 'revoked', 'unsupported', 'manual_import_only', 'gated_verification_required', 'extension_required')`,
    ),
    check("connector_connections_provider_config_present", sql`length(trim(${table.providerConfigKey})) > 0`),
    check("connector_connections_external_present", sql`length(trim(${table.externalConnectionId})) > 0`),
  ],
);

export const connectorSyncCursors = pgTable(
  "connector_sync_cursors",
  {
    id: text("id").primaryKey(),
    ...scopeColumns(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => connectorConnections.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    surface: text("surface").notNull(),
    cursor: text("cursor"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    nextSyncAt: timestamp("next_sync_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("connector_sync_cursors_connection_surface_idx").on(table.connectionId, table.surface),
    index("connector_sync_cursors_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("connector_sync_cursors_provider_surface_idx").on(table.providerId, table.surface),
    index("connector_sync_cursors_next_sync_idx").on(table.nextSyncAt),
    check("connector_sync_cursors_provider_valid", sql`${table.providerId} IN ('google')`),
    check("connector_sync_cursors_surface_present", sql`length(trim(${table.surface})) > 0`),
  ],
);

export const connectorSyncRuns = pgTable(
  "connector_sync_runs",
  {
    id: text("id").primaryKey(),
    ...scopeColumns(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => connectorConnections.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    surface: text("surface").notNull(),
    status: text("status").notNull().default("queued"),
    cursorBefore: jsonb("cursor_before"),
    cursorAfter: jsonb("cursor_after"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    sourceCounts: jsonb("source_counts").notNull().default({}),
    error: jsonb("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("connector_sync_runs_connection_idx").on(table.connectionId),
    index("connector_sync_runs_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("connector_sync_runs_provider_status_idx").on(table.providerId, table.status),
    index("connector_sync_runs_requested_at_idx").on(table.requestedAt),
    check("connector_sync_runs_provider_valid", sql`${table.providerId} IN ('google')`),
    check("connector_sync_runs_surface_present", sql`length(trim(${table.surface})) > 0`),
    check("connector_sync_runs_status_valid", sql`${table.status} IN ('queued', 'running', 'succeeded', 'failed', 'canceled')`),
    check(
      "connector_sync_runs_completion_matches_status",
      sql`(${table.status} IN ('succeeded', 'failed', 'canceled') AND ${table.completedAt} IS NOT NULL) OR (${table.status} IN ('queued', 'running') AND ${table.completedAt} IS NULL)`,
    ),
  ],
);

export const connectorSourceRefs = pgTable(
  "connector_source_refs",
  {
    id: text("id").primaryKey(),
    ...scopeColumns(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => connectorConnections.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    surface: text("surface").notNull(),
    kind: text("kind").notNull(),
    sourceUri: text("source_uri").notNull(),
    label: text("label").notNull(),
    externalId: text("external_id").notNull(),
    url: text("url"),
    metadata: jsonb("metadata").notNull().default({}),
    provenance: jsonb("provenance").notNull().default({}),
    privacy: jsonb("privacy").notNull().default({}),
    retrievalAccess: text("retrieval_access").notNull().default("enabled"),
    brainSourceId: text("brain_source_id").references(() => brainMemorySources.id, { onDelete: "set null" }),
    brainNodeIds: jsonb("brain_node_ids").$type<string[]>().notNull().default([]),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("connector_source_refs_connection_uri_idx").on(table.connectionId, table.sourceUri),
    index("connector_source_refs_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("connector_source_refs_connection_idx").on(table.connectionId),
    index("connector_source_refs_provider_surface_idx").on(table.providerId, table.surface),
    index("connector_source_refs_brain_source_idx").on(table.brainSourceId),
    index("connector_source_refs_retrieval_idx").on(table.retrievalAccess),
    check("connector_source_refs_provider_valid", sql`${table.providerId} IN ('google')`),
    check("connector_source_refs_surface_present", sql`length(trim(${table.surface})) > 0`),
    check("connector_source_refs_kind_present", sql`length(trim(${table.kind})) > 0`),
    check("connector_source_refs_uri_present", sql`length(trim(${table.sourceUri})) > 0`),
    check("connector_source_refs_label_present", sql`length(trim(${table.label})) > 0`),
    check("connector_source_refs_external_present", sql`length(trim(${table.externalId})) > 0`),
    check("connector_source_refs_retrieval_valid", sql`${table.retrievalAccess} IN ('enabled', 'revoked', 'deleted')`),
  ],
);

export const connectorPermissionAudits = pgTable(
  "connector_permission_audits",
  {
    id: text("id").primaryKey(),
    ...scopeColumns(),
    providerId: text("provider_id").notNull(),
    connectionId: text("connection_id").references(() => connectorConnections.id, { onDelete: "set null" }),
    sourceRefId: text("source_ref_id").references(() => connectorSourceRefs.id, { onDelete: "set null" }),
    actorUserId: text("actor_user_id"),
    event: text("event").notNull(),
    details: jsonb("details").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("connector_permission_audits_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("connector_permission_audits_connection_idx").on(table.connectionId),
    index("connector_permission_audits_source_ref_idx").on(table.sourceRefId),
    index("connector_permission_audits_event_idx").on(table.event),
    index("connector_permission_audits_created_at_idx").on(table.createdAt),
    check("connector_permission_audits_provider_valid", sql`${table.providerId} IN ('google')`),
    check("connector_permission_audits_event_present", sql`length(trim(${table.event})) > 0`),
  ],
);

export const contextSources = pgTable(
  "context_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    connectorAccountId: uuid("connector_account_id").references(() => connectorAccounts.id, { onDelete: "set null" }),
    provider: contextProviderEnum("provider").notNull(),
    sourceUri: text("source_uri").notNull(),
    label: text("label").notNull(),
    owner: text("owner"),
    timeRange: jsonb("time_range").notNull().default({}),
    permissions: jsonb("permissions").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("context_sources_provider_uri_scope_idx").on(table.provider, table.sourceUri, table.userId),
    index("context_sources_account_idx").on(table.connectorAccountId),
    index("context_sources_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("context_sources_provider_idx").on(table.provider),
    check("context_sources_uri_present", sql`length(trim(${table.sourceUri})) > 0`),
    check("context_sources_label_present", sql`length(trim(${table.label})) > 0`),
  ],
);

export const contextChunks = pgTable(
  "context_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => contextSources.id, { onDelete: "cascade" }),
    hash: text("hash").notNull(),
    retentionFlag: boolean("retention_flag").notNull().default(false),
    processingStatus: contextChunkProcessingStatusEnum("processing_status").notNull().default("ephemeral"),
    redactionSummary: jsonb("redaction_summary").notNull().default({}),
    rawDeletedAt: timestamp("raw_deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("context_chunks_source_hash_idx").on(table.sourceId, table.hash),
    index("context_chunks_source_id_idx").on(table.sourceId),
    index("context_chunks_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("context_chunks_status_idx").on(table.processingStatus),
    check("context_chunks_hash_present", sql`length(trim(${table.hash})) > 0`),
    check(
      "context_chunks_deleted_unless_retained",
      sql`${table.retentionFlag} = true OR ${table.processingStatus} <> 'retained'`,
    ),
  ],
);

export const sourceDigests = pgTable(
  "source_digests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => contextSources.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    extractedAt: timestamp("extracted_at", { withTimezone: true }).notNull().defaultNow(),
    provenance: jsonb("provenance").notNull().default({}),
  },
  (table) => [
    index("source_digests_source_id_idx").on(table.sourceId),
    index("source_digests_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    check("source_digests_title_present", sql`length(trim(${table.title})) > 0`),
    check("source_digests_summary_present", sql`length(trim(${table.summary})) > 0`),
  ],
);

export const memoryShards = pgTable(
  "memory_shards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    text: text("text").notNull(),
    type: memoryShardTypeEnum("type").notNull(),
    sourceClass: memorySourceClassEnum("source_class").notNull(),
    confidence: integer("confidence").notNull().default(60),
    decay: integer("decay").notNull().default(0),
    reviewStatus: memoryReviewStatusEnum("review_status").notNull().default("pending"),
    sourceDigestId: uuid("source_digest_id").references(() => sourceDigests.id, { onDelete: "set null" }),
    consent: jsonb("consent").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
    visibility: memoryVisibilityEnum("visibility").notNull().default("private"),
  },
  (table) => [
    index("memory_shards_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("memory_shards_type_idx").on(table.type),
    index("memory_shards_source_class_idx").on(table.sourceClass),
    index("memory_shards_review_status_idx").on(table.reviewStatus),
    index("memory_shards_last_seen_idx").on(table.lastSeen),
    check("memory_shards_text_present", sql`length(trim(${table.text})) > 0`),
    check("memory_shards_confidence_range", sql`${table.confidence} >= 0 AND ${table.confidence} <= 100`),
    check("memory_shards_decay_range", sql`${table.decay} >= 0 AND ${table.decay} <= 100`),
  ],
);

export const claimSuggestions = pgTable(
  "claim_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    shardId: uuid("shard_id").references(() => memoryShards.id, { onDelete: "cascade" }),
    claim: text("claim").notNull(),
    kind: claimKindEnum("kind").notNull().default("belief"),
    confidence: integer("confidence").notNull().default(60),
    reviewStatus: memoryReviewStatusEnum("review_status").notNull().default("pending"),
    rationale: text("rationale"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table) => [
    index("claim_suggestions_shard_idx").on(table.shardId),
    index("claim_suggestions_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("claim_suggestions_review_status_idx").on(table.reviewStatus),
    check("claim_suggestions_claim_present", sql`length(trim(${table.claim})) > 0`),
    check("claim_suggestions_confidence_range", sql`${table.confidence} >= 0 AND ${table.confidence} <= 100`),
  ],
);

export const evidencePointers = pgTable(
  "evidence_pointers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    shardId: uuid("shard_id")
      .notNull()
      .references(() => memoryShards.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => contextSources.id, { onDelete: "cascade" }),
    locator: jsonb("locator").notNull().default({}),
    snippetPolicy: evidenceSnippetPolicyEnum("snippet_policy").notNull().default("redacted_snippet"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("evidence_pointers_shard_id_idx").on(table.shardId),
    index("evidence_pointers_source_id_idx").on(table.sourceId),
    index("evidence_pointers_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("evidence_pointers_snippet_policy_idx").on(table.snippetPolicy),
  ],
);

export const brainNodes = pgTable(
  "brain_nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    type: brainNodeTypeEnum("type").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    status: brainNodeStatusEnum("status").notNull().default("active"),
    memoryShardId: uuid("memory_shard_id").references(() => memoryShards.id, { onDelete: "set null" }),
    claimId: uuid("claim_id").references(() => claims.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("brain_nodes_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("brain_nodes_type_idx").on(table.type),
    index("brain_nodes_status_idx").on(table.status),
    index("brain_nodes_memory_shard_id_idx").on(table.memoryShardId),
    index("brain_nodes_claim_id_idx").on(table.claimId),
    check("brain_nodes_title_present", sql`length(trim(${table.title})) > 0`),
    check("brain_nodes_summary_present", sql`length(trim(${table.summary})) > 0`),
  ],
);

export const brainEdges = pgTable(
  "brain_edges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    fromNode: uuid("from_node")
      .notNull()
      .references(() => brainNodes.id, { onDelete: "cascade" }),
    toNode: uuid("to_node")
      .notNull()
      .references(() => brainNodes.id, { onDelete: "cascade" }),
    type: brainEdgeTypeEnum("type").notNull(),
    weight: integer("weight").notNull().default(50),
    evidenceIds: jsonb("evidence_ids").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("brain_edges_from_node_idx").on(table.fromNode),
    index("brain_edges_to_node_idx").on(table.toNode),
    index("brain_edges_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("brain_edges_type_idx").on(table.type),
    check("brain_edges_no_self_edge", sql`${table.fromNode} <> ${table.toNode}`),
    check("brain_edges_weight_range", sql`${table.weight} >= 0 AND ${table.weight} <= 100`),
  ],
);

export const checkResults = pgTable(
  "check_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => brainNodes.id, { onDelete: "cascade" }),
    claim: text("claim").notNull(),
    risk: checkRiskEnum("risk").notNull(),
    explanation: text("explanation").notNull(),
    evidenceIds: jsonb("evidence_ids").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("check_results_node_id_idx").on(table.nodeId),
    index("check_results_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("check_results_risk_idx").on(table.risk),
    check("check_results_claim_present", sql`length(trim(${table.claim})) > 0`),
    check("check_results_explanation_present", sql`length(trim(${table.explanation})) > 0`),
  ],
);

export const learnCards = pgTable(
  "learn_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => brainNodes.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    answerHint: text("answer_hint").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    strength: integer("strength").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("learn_cards_node_id_idx").on(table.nodeId),
    index("learn_cards_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("learn_cards_due_at_idx").on(table.dueAt),
    check("learn_cards_prompt_present", sql`length(trim(${table.prompt})) > 0`),
    check("learn_cards_answer_hint_present", sql`length(trim(${table.answerHint})) > 0`),
    check("learn_cards_strength_range", sql`${table.strength} >= 0 AND ${table.strength} <= 100`),
  ],
);

export const consentSettings = pgTable(
  "consent_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    memoryEnabled: boolean("memory_enabled").notNull().default(true),
    referenceChatgptImport: boolean("reference_chatgpt_import").notNull().default(false),
    referenceGmail: boolean("reference_gmail").notNull().default(false),
    referenceCalendar: boolean("reference_calendar").notNull().default(false),
    useForPrivateFineTune: boolean("use_for_private_fine_tune").notNull().default(false),
    useToImproveSharedModels: boolean("use_to_improve_shared_models").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("consent_settings_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    check(
      "consent_settings_shared_training_requires_memory",
      sql`${table.memoryEnabled} = true OR ${table.useToImproveSharedModels} = false`,
    ),
  ],
);

export const contextAuditLogs = pgTable(
  "context_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...scopeColumns(),
    event: contextAuditEventEnum("event").notNull(),
    actorUserId: text("actor_user_id"),
    connectorAccountId: uuid("connector_account_id").references(() => connectorAccounts.id, { onDelete: "set null" }),
    sourceId: uuid("source_id").references(() => contextSources.id, { onDelete: "set null" }),
    memoryShardId: uuid("memory_shard_id").references(() => memoryShards.id, { onDelete: "set null" }),
    details: jsonb("details").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("context_audit_logs_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("context_audit_logs_event_idx").on(table.event),
    index("context_audit_logs_connector_account_idx").on(table.connectorAccountId),
    index("context_audit_logs_source_idx").on(table.sourceId),
    index("context_audit_logs_memory_shard_idx").on(table.memoryShardId),
    index("context_audit_logs_created_at_idx").on(table.createdAt),
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

export const createExportFeedback = pgTable(
  "create_export_feedback",
  {
    id: text("id").primaryKey(),
    ...scopeColumns(),
    createProjectId: text("create_project_id").notNull(),
    createSessionId: text("create_session_id").notNull(),
    artifactId: text("artifact_id").notNull(),
    exportId: text("export_id").notNull(),
    rating: text("rating").notNull(),
    reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
    comment: text("comment"),
    promptCompletenessScore: integer("prompt_completeness_score"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("create_export_feedback_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("create_export_feedback_artifact_idx").on(table.artifactId),
    index("create_export_feedback_export_idx").on(table.exportId),
    index("create_export_feedback_rating_idx").on(table.rating),
    index("create_export_feedback_created_at_idx").on(table.createdAt),
    check("create_export_feedback_project_present", sql`length(trim(${table.createProjectId})) > 0`),
    check("create_export_feedback_session_present", sql`length(trim(${table.createSessionId})) > 0`),
    check("create_export_feedback_artifact_present", sql`length(trim(${table.artifactId})) > 0`),
    check("create_export_feedback_export_present", sql`length(trim(${table.exportId})) > 0`),
    check("create_export_feedback_rating_valid", sql`${table.rating} IN ('useful', 'not_useful')`),
    check("create_export_feedback_comment_max", sql`${table.comment} IS NULL OR length(${table.comment}) <= 1000`),
    check(
      "create_export_feedback_score_range",
      sql`${table.promptCompletenessScore} IS NULL OR (${table.promptCompletenessScore} >= 0 AND ${table.promptCompletenessScore} <= 100)`,
    ),
  ],
);

export const createOptionSets = pgTable(
  "create_option_sets",
  {
    id: text("id").primaryKey(),
    ...scopeColumns(),
    createProjectId: text("create_project_id").notNull(),
    createSessionId: text("create_session_id").notNull(),
    sourceOfTruth: text("source_of_truth").notNull(),
    rawIdea: text("raw_idea").notNull(),
    options: jsonb("options").notNull().default([]),
    nextBestMove: jsonb("next_best_move").notNull().default({}),
    rankedCandidates: jsonb("ranked_candidates").notNull().default([]),
    memoryUsed: jsonb("memory_used").notNull().default([]),
    sourcesUsed: jsonb("sources_used").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("create_option_sets_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("create_option_sets_create_session_idx").on(table.createProjectId, table.createSessionId),
    index("create_option_sets_created_at_idx").on(table.createdAt),
    check("create_option_sets_project_present", sql`length(trim(${table.createProjectId})) > 0`),
    check("create_option_sets_session_present", sql`length(trim(${table.createSessionId})) > 0`),
    check("create_option_sets_raw_idea_present", sql`length(trim(${table.rawIdea})) > 0`),
    check(
      "create_option_sets_source_valid",
      sql`${table.sourceOfTruth} IN ('rough_idea_context_deterministic_create_lenses', 'rough_idea_context_model_backed_create_lenses')`,
    ),
  ],
);

export const createArtifacts = pgTable(
  "create_artifacts",
  {
    id: text("id").primaryKey(),
    ...scopeColumns(),
    createProjectId: text("create_project_id").notNull(),
    createSessionId: text("create_session_id").notNull(),
    title: text("title").notNull(),
    version: integer("version").notNull(),
    rawIdea: text("raw_idea").notNull(),
    sections: jsonb("sections").notNull().default([]),
    sourceOptionSetIds: jsonb("source_option_set_ids").$type<string[]>().notNull().default([]),
    judgmentEventIds: jsonb("judgment_event_ids").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("create_artifacts_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("create_artifacts_create_session_idx").on(table.createProjectId, table.createSessionId),
    index("create_artifacts_updated_at_idx").on(table.updatedAt),
    check("create_artifacts_project_present", sql`length(trim(${table.createProjectId})) > 0`),
    check("create_artifacts_session_present", sql`length(trim(${table.createSessionId})) > 0`),
    check("create_artifacts_title_present", sql`length(trim(${table.title})) > 0`),
    check("create_artifacts_version_positive", sql`${table.version} > 0`),
    check("create_artifacts_raw_idea_present", sql`length(trim(${table.rawIdea})) > 0`),
  ],
);

export const createJudgmentEvents = pgTable(
  "create_judgment_events",
  {
    id: text("id").primaryKey(),
    ...scopeColumns(),
    createProjectId: text("create_project_id").notNull(),
    createSessionId: text("create_session_id").notNull(),
    optionSetId: text("option_set_id").notNull(),
    selectedOptionIds: jsonb("selected_option_ids").$type<string[]>().notNull().default([]),
    userComment: text("user_comment").notNull(),
    inferredSignals: jsonb("inferred_signals").$type<string[]>().notNull().default([]),
    artifactDelta: jsonb("artifact_delta").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("create_judgment_events_scope_idx").on(table.userId, table.workspaceId, table.projectId, table.sphereId),
    index("create_judgment_events_create_session_idx").on(table.createProjectId, table.createSessionId),
    index("create_judgment_events_option_set_idx").on(table.optionSetId),
    index("create_judgment_events_created_at_idx").on(table.createdAt),
    check("create_judgment_events_project_present", sql`length(trim(${table.createProjectId})) > 0`),
    check("create_judgment_events_session_present", sql`length(trim(${table.createSessionId})) > 0`),
    check("create_judgment_events_option_set_present", sql`length(trim(${table.optionSetId})) > 0`),
    check("create_judgment_events_comment_max", sql`length(${table.userComment}) <= 8000`),
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
  brainEdgeTypeEnum,
  brainEdges,
  brainDevelopmentEvents,
  brainObjects,
  brainEmbeddingObjectTypeEnum,
  brainEmbeddings,
  brainMemoryEdges,
  brainMemoryIngestionJobs,
  brainMemoryNodes,
  brainMemoryProfileSignals,
  brainMemoryRetrievalEvents,
  brainMemorySourceChunks,
  brainMemorySources,
  brainNodeStatusEnum,
  brainNodeTypeEnum,
  brainNodes,
  brainRankedCandidates,
  brainRankerRuns,
  brainRecents,
  brainRunOperationEnum,
  brainRunStatusEnum,
  brainRuns,
  checkResults,
  checkRiskEnum,
  challengeFailureTypeEnum,
  challengeRoundResponseEnum,
  challengeRoundStatusEnum,
  challengeRounds,
  challengeStrengthEnum,
  claimSuggestions,
  commandIdempotencyKeys,
  commandIdempotencyStatusEnum,
  claimEdgeKindEnum,
  claimEdgeStatusEnum,
  claimEdges,
  claimKindEnum,
  claims,
  claimStatusEnum,
  claimVersions,
  codeChunks,
  codeDocs,
  codeFiles,
  codeFindings,
  codeImports,
  codeMemoryNotes,
  codeRoutes,
  codeSymbols,
  codeTests,
  codebaseScanRuns,
  connectorAccounts,
  connectorAccountStatusEnum,
  connectorConnections,
  connectorPermissionAudits,
  connectorSourceRefs,
  connectorSyncCursors,
  connectorSyncJobs,
  connectorSyncJobStatusEnum,
  connectorSyncRuns,
  consentSettings,
  contextAuditEventEnum,
  contextAuditLogs,
  contextChunkProcessingStatusEnum,
  contextChunks,
  contextProviderEnum,
  contextSources,
  createArtifacts,
  createExportFeedback,
  createJudgmentEvents,
  createOptionSets,
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
  sourceDigests,
  sourceKindEnum,
  sourceSpans,
  sources,
  wikiPages,
};

export type BrainRunOperation = (typeof brainRunOperationEnum.enumValues)[number];
export type BrainRunStatus = (typeof brainRunStatusEnum.enumValues)[number];
