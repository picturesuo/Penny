-- CreateTable
CREATE TABLE "maps" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "raw_thought" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "claim_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "claims" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "map_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "note" TEXT,
    "kind" TEXT NOT NULL,
    "node_status" TEXT NOT NULL,
    "structure_kind" TEXT,
    "provenance" TEXT NOT NULL,
    "stakes" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "confidence_history" TEXT NOT NULL DEFAULT '[]',
    "resolution_date" DATETIME,
    "parent_claim_id" TEXT,
    "depends_on" TEXT NOT NULL DEFAULT '[]',
    "dialectic_round_count" INTEGER NOT NULL DEFAULT 0,
    "last_challenged_at" DATETIME,
    "steel_man_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "claims_map_id_fkey" FOREIGN KEY ("map_id") REFERENCES "maps" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "claim_confidence_history_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "claim_id" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "changed_at" DATETIME NOT NULL,
    "changed_by" TEXT NOT NULL,
    "reason" TEXT,
    "round_id" TEXT,
    CONSTRAINT "claim_confidence_history_entries_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "claim_confidence_history_entries_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "dialectic_rounds" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "steel_mans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "claim_id" TEXT NOT NULL,
    "map_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "steel_man_text" TEXT NOT NULL,
    "qualityScore" REAL,
    "quality_score_reason" TEXT,
    "used_in_round" TEXT NOT NULL DEFAULT '[]',
    "written_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME,
    "update_history" TEXT NOT NULL DEFAULT '[]'
);

-- CreateTable
CREATE TABLE "response_classifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "round_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "classified_by" TEXT NOT NULL,
    CONSTRAINT "response_classifications_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "dialectic_rounds" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "dialectic_rounds" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "map_id" TEXT NOT NULL,
    "claim_id" TEXT,
    "round_number" INTEGER NOT NULL,
    "prior_round_id" TEXT,
    "critique_generated" TEXT NOT NULL,
    "critique_failure_types" TEXT NOT NULL DEFAULT '[]',
    "critique_lens" TEXT NOT NULL,
    "critique_strength" TEXT NOT NULL,
    "critique_mode" TEXT,
    "voice_label" TEXT,
    "user_response" TEXT NOT NULL,
    "confidence_at_round_start" INTEGER NOT NULL,
    "confidence_at_round_end" INTEGER NOT NULL,
    "confidence_delta" INTEGER NOT NULL,
    "concessions" TEXT NOT NULL DEFAULT '[]',
    "defenses" TEXT NOT NULL DEFAULT '[]',
    "dismissals" TEXT NOT NULL DEFAULT '[]',
    "engagement_score" INTEGER NOT NULL,
    "follow_up_prompt" TEXT,
    "uncertainty" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" DATETIME,
    CONSTRAINT "dialectic_rounds_map_id_fkey" FOREIGN KEY ("map_id") REFERENCES "maps" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "dialectic_rounds_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "learning_prompts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "claim_id" TEXT NOT NULL,
    "round_id" TEXT,
    "user_id" TEXT NOT NULL,
    "prompt_type" TEXT NOT NULL,
    "trigger_condition" TEXT NOT NULL,
    "prompt_text" TEXT NOT NULL,
    "user_engaged" BOOLEAN NOT NULL,
    "engaged_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "learning_prompts_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "learning_prompts_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "dialectic_rounds" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "artifacts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "artifact_type_id" TEXT NOT NULL,
    "artifact_type_name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "audience" TEXT,
    "source_map_id" TEXT NOT NULL,
    "generated_at" DATETIME NOT NULL,
    "version" INTEGER NOT NULL,
    "section_order" TEXT NOT NULL DEFAULT '[]',
    "narrative_glue" TEXT,
    "load_bearing_claims" TEXT NOT NULL DEFAULT '[]',
    "dependency_health" TEXT,
    "outcomes" TEXT NOT NULL DEFAULT '[]',
    "latest_outcome" TEXT,
    CONSTRAINT "artifacts_source_map_id_fkey" FOREIGN KEY ("source_map_id") REFERENCES "maps" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "artifact_contents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "artifact_id" TEXT NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "artifact_contents_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "artifacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "artifact_sections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "artifact_content_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "claim_ids" TEXT NOT NULL DEFAULT '[]',
    "section_type" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "artifact_sections_artifact_content_id_fkey" FOREIGN KEY ("artifact_content_id") REFERENCES "artifact_contents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "map_id" TEXT,
    "title" TEXT NOT NULL,
    "raw_idea" TEXT NOT NULL,
    "category" TEXT,
    "declared_intention" TEXT NOT NULL,
    "intention_type" TEXT NOT NULL,
    "scoped_claim_ids" TEXT NOT NULL DEFAULT '[]',
    "time_budget_minutes" INTEGER,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" DATETIME,
    "actual_duration_minutes" INTEGER,
    "session_events" TEXT NOT NULL DEFAULT '[]',
    "closing_ritual" TEXT,
    "session_summary" TEXT,
    "energy_rating" TEXT,
    "focus_rating" TEXT,
    "productivity_rating" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "current_stage" TEXT NOT NULL DEFAULT 'intake',
    "question_budget" INTEGER NOT NULL DEFAULT 5,
    "clarity_score" INTEGER NOT NULL DEFAULT 18,
    "extracted_problem" TEXT,
    "extracted_customer" TEXT,
    "extracted_solution" TEXT,
    "idea_summary" TEXT,
    "target_user" TEXT,
    "problem" TEXT,
    "solution" TEXT,
    "assumptions" TEXT NOT NULL DEFAULT '[]',
    "resolved_assumptions" TEXT NOT NULL DEFAULT '[]',
    "risks" TEXT NOT NULL DEFAULT '[]',
    "unknowns" TEXT NOT NULL DEFAULT '[]',
    "evidence_for" TEXT NOT NULL DEFAULT '[]',
    "evidence_against" TEXT NOT NULL DEFAULT '[]',
    "market_patterns" TEXT NOT NULL DEFAULT '[]',
    "questions_asked" TEXT NOT NULL DEFAULT '[]',
    "answers" TEXT NOT NULL DEFAULT '[]',
    "conversation" TEXT NOT NULL DEFAULT '[]',
    "concept_brief" TEXT,
    "logic_only_mode" BOOLEAN NOT NULL DEFAULT false,
    "claims_examined" INTEGER NOT NULL DEFAULT 0,
    "claims_updated" INTEGER NOT NULL DEFAULT 0,
    "critiques_run" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "sessions_map_id_fkey" FOREIGN KEY ("map_id") REFERENCES "maps" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "moves" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "map_id" TEXT,
    "claim_id" TEXT,
    "session_id" TEXT,
    "move_type" TEXT NOT NULL,
    "payload" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "moves_map_id_fkey" FOREIGN KEY ("map_id") REFERENCES "maps" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "moves_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "moves_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "idx_maps_user_id" ON "maps"("user_id");

-- CreateIndex
CREATE INDEX "idx_maps_status" ON "maps"("status");

-- CreateIndex
CREATE INDEX "idx_maps_created_at" ON "maps"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "claims_steel_man_id_key" ON "claims"("steel_man_id");

-- CreateIndex
CREATE INDEX "idx_claims_user_id" ON "claims"("user_id");

-- CreateIndex
CREATE INDEX "idx_claims_map_id" ON "claims"("map_id");

-- CreateIndex
CREATE INDEX "idx_claims_status" ON "claims"("status");

-- CreateIndex
CREATE INDEX "idx_claims_created_at" ON "claims"("created_at");

-- CreateIndex
CREATE INDEX "idx_claims_parent_claim_id" ON "claims"("parent_claim_id");

-- CreateIndex
CREATE INDEX "idx_claim_confidence_history_entries_claim_id" ON "claim_confidence_history_entries"("claim_id");

-- CreateIndex
CREATE INDEX "idx_claim_confidence_history_entries_round_id" ON "claim_confidence_history_entries"("round_id");

-- CreateIndex
CREATE INDEX "idx_claim_confidence_history_entries_changed_at" ON "claim_confidence_history_entries"("changed_at");

-- CreateIndex
CREATE INDEX "idx_steel_mans_claim_id" ON "steel_mans"("claim_id");

-- CreateIndex
CREATE INDEX "idx_steel_mans_map_id" ON "steel_mans"("map_id");

-- CreateIndex
CREATE INDEX "idx_steel_mans_user_id" ON "steel_mans"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "response_classifications_round_id_key" ON "response_classifications"("round_id");

-- CreateIndex
CREATE INDEX "idx_response_classifications_round_id" ON "response_classifications"("round_id");

-- CreateIndex
CREATE INDEX "idx_dialectic_rounds_claim_id" ON "dialectic_rounds"("claim_id");

-- CreateIndex
CREATE INDEX "idx_dialectic_rounds_user_id" ON "dialectic_rounds"("user_id");

-- CreateIndex
CREATE INDEX "idx_dialectic_rounds_map_id" ON "dialectic_rounds"("map_id");

-- CreateIndex
CREATE INDEX "idx_dialectic_rounds_created_at" ON "dialectic_rounds"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_dialectic_rounds_claim_round" ON "dialectic_rounds"("claim_id", "round_number");

-- CreateIndex
CREATE INDEX "idx_learning_prompts_claim_id" ON "learning_prompts"("claim_id");

-- CreateIndex
CREATE INDEX "idx_learning_prompts_round_id" ON "learning_prompts"("round_id");

-- CreateIndex
CREATE INDEX "idx_learning_prompts_user_id" ON "learning_prompts"("user_id");

-- CreateIndex
CREATE INDEX "idx_artifacts_user_id" ON "artifacts"("user_id");

-- CreateIndex
CREATE INDEX "idx_artifacts_source_map_id" ON "artifacts"("source_map_id");

-- CreateIndex
CREATE INDEX "idx_artifacts_type_id" ON "artifacts"("artifact_type_id");

-- CreateIndex
CREATE INDEX "idx_artifacts_generated_at" ON "artifacts"("generated_at");

-- CreateIndex
CREATE UNIQUE INDEX "artifact_contents_artifact_id_key" ON "artifact_contents"("artifact_id");

-- CreateIndex
CREATE INDEX "idx_artifact_contents_artifact_id" ON "artifact_contents"("artifact_id");

-- CreateIndex
CREATE INDEX "idx_artifact_sections_artifact_content_id" ON "artifact_sections"("artifact_content_id");

-- CreateIndex
CREATE INDEX "idx_artifact_sections_artifact_content_position" ON "artifact_sections"("artifact_content_id", "position");

-- CreateIndex
CREATE INDEX "idx_sessions_user_id" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "idx_sessions_map_id" ON "sessions"("map_id");

-- CreateIndex
CREATE INDEX "idx_sessions_status" ON "sessions"("status");

-- CreateIndex
CREATE INDEX "idx_sessions_created_at" ON "sessions"("created_at");

-- CreateIndex
CREATE INDEX "idx_moves_user_id" ON "moves"("user_id");

-- CreateIndex
CREATE INDEX "idx_moves_claim_id" ON "moves"("claim_id");

-- CreateIndex
CREATE INDEX "idx_moves_created_at" ON "moves"("created_at");

-- CreateIndex
CREATE INDEX "idx_moves_session_id" ON "moves"("session_id");
