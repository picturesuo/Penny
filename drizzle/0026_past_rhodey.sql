CREATE TYPE "public"."brain_edge_type" AS ENUM('supports', 'contradicts', 'inspired_by', 'depends_on', 'person_related', 'project_related', 'deadline_for', 'learned_from', 'checked_by');--> statement-breakpoint
CREATE TYPE "public"."brain_node_status" AS ENUM('active', 'needs_review', 'archived', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."brain_node_type" AS ENUM('claim', 'assumption', 'counterargument', 'concept', 'project', 'person', 'deadline', 'source_digest', 'memory_shard');--> statement-breakpoint
CREATE TYPE "public"."check_risk" AS ENUM('contradiction', 'weak_evidence', 'stale_assumption', 'circular_reasoning', 'missing_user_goal', 'risky_decision');--> statement-breakpoint
CREATE TYPE "public"."connector_account_status" AS ENUM('active', 'paused', 'revoked', 'errored');--> statement-breakpoint
CREATE TYPE "public"."connector_sync_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."context_audit_event" AS ENUM('connector.connected', 'connector.synced', 'connector.revoked', 'source.fetched', 'chunk.redacted', 'chunk.deleted', 'memory.extracted', 'memory.approved', 'memory.rejected', 'memory.edited', 'memory.merged', 'memory.deleted', 'consent.updated', 'training.preference.updated');--> statement-breakpoint
CREATE TYPE "public"."context_chunk_processing_status" AS ENUM('ephemeral', 'redacted', 'extracted', 'deleted', 'retained');--> statement-breakpoint
CREATE TYPE "public"."context_provider" AS ENUM('manual', 'chatgpt', 'gmail', 'calendar', 'slack', 'canvas', 'instagram');--> statement-breakpoint
CREATE TYPE "public"."evidence_snippet_policy" AS ENUM('metadata_only', 'redacted_snippet', 'full_snippet', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."memory_review_status" AS ENUM('pending', 'approved', 'auto_approved', 'rejected', 'merged', 'deprioritized');--> statement-breakpoint
CREATE TYPE "public"."memory_shard_type" AS ENUM('claim', 'preference', 'goal', 'taste', 'style', 'idea_history', 'project', 'person', 'deadline', 'concept');--> statement-breakpoint
CREATE TYPE "public"."memory_source_class" AS ENUM('manual', 'private_export', 'email', 'calendar_event', 'chat', 'learning_platform', 'social');--> statement-breakpoint
CREATE TYPE "public"."memory_visibility" AS ENUM('private', 'workspace', 'project');--> statement-breakpoint
CREATE TABLE "brain_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"from_node" uuid NOT NULL,
	"to_node" uuid NOT NULL,
	"type" "brain_edge_type" NOT NULL,
	"weight" integer DEFAULT 50 NOT NULL,
	"evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brain_edges_no_self_edge" CHECK ("brain_edges"."from_node" <> "brain_edges"."to_node"),
	CONSTRAINT "brain_edges_weight_range" CHECK ("brain_edges"."weight" >= 0 AND "brain_edges"."weight" <= 100)
);
--> statement-breakpoint
CREATE TABLE "brain_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"type" "brain_node_type" NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"status" "brain_node_status" DEFAULT 'active' NOT NULL,
	"memory_shard_id" uuid,
	"claim_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brain_nodes_title_present" CHECK (length(trim("brain_nodes"."title")) > 0),
	CONSTRAINT "brain_nodes_summary_present" CHECK (length(trim("brain_nodes"."summary")) > 0)
);
--> statement-breakpoint
CREATE TABLE "check_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"node_id" uuid NOT NULL,
	"claim" text NOT NULL,
	"risk" "check_risk" NOT NULL,
	"explanation" text NOT NULL,
	"evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "check_results_claim_present" CHECK (length(trim("check_results"."claim")) > 0),
	CONSTRAINT "check_results_explanation_present" CHECK (length(trim("check_results"."explanation")) > 0)
);
--> statement-breakpoint
CREATE TABLE "claim_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"shard_id" uuid,
	"claim" text NOT NULL,
	"kind" "claim_kind" DEFAULT 'belief' NOT NULL,
	"confidence" integer DEFAULT 60 NOT NULL,
	"review_status" "memory_review_status" DEFAULT 'pending' NOT NULL,
	"rationale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "claim_suggestions_claim_present" CHECK (length(trim("claim_suggestions"."claim")) > 0),
	CONSTRAINT "claim_suggestions_confidence_range" CHECK ("claim_suggestions"."confidence" >= 0 AND "claim_suggestions"."confidence" <= 100)
);
--> statement-breakpoint
CREATE TABLE "connector_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"provider" "context_provider" NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "connector_account_status" DEFAULT 'active' NOT NULL,
	"encrypted_access_token" text,
	"encrypted_refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"last_sync" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connector_sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"connector_account_id" uuid NOT NULL,
	"provider" "context_provider" NOT NULL,
	"status" "connector_sync_job_status" DEFAULT 'queued' NOT NULL,
	"minimum_scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rate_limit_key" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connector_sync_jobs_completion_matches_status" CHECK (("connector_sync_jobs"."status" IN ('succeeded', 'failed', 'canceled') AND "connector_sync_jobs"."completed_at" IS NOT NULL) OR ("connector_sync_jobs"."status" IN ('queued', 'running') AND "connector_sync_jobs"."completed_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "consent_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"memory_enabled" boolean DEFAULT true NOT NULL,
	"reference_chatgpt_import" boolean DEFAULT false NOT NULL,
	"reference_gmail" boolean DEFAULT false NOT NULL,
	"reference_calendar" boolean DEFAULT false NOT NULL,
	"use_for_private_fine_tune" boolean DEFAULT false NOT NULL,
	"use_to_improve_shared_models" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consent_settings_shared_training_requires_memory" CHECK ("consent_settings"."memory_enabled" = true OR "consent_settings"."use_to_improve_shared_models" = false)
);
--> statement-breakpoint
CREATE TABLE "context_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"event" "context_audit_event" NOT NULL,
	"actor_user_id" text,
	"connector_account_id" uuid,
	"source_id" uuid,
	"memory_shard_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "context_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"source_id" uuid NOT NULL,
	"hash" text NOT NULL,
	"retention_flag" boolean DEFAULT false NOT NULL,
	"processing_status" "context_chunk_processing_status" DEFAULT 'ephemeral' NOT NULL,
	"redaction_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"raw_deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "context_chunks_hash_present" CHECK (length(trim("context_chunks"."hash")) > 0),
	CONSTRAINT "context_chunks_deleted_unless_retained" CHECK ("context_chunks"."retention_flag" = true OR "context_chunks"."processing_status" <> 'retained')
);
--> statement-breakpoint
CREATE TABLE "context_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"connector_account_id" uuid,
	"provider" "context_provider" NOT NULL,
	"source_uri" text NOT NULL,
	"label" text NOT NULL,
	"owner" text,
	"time_range" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "context_sources_uri_present" CHECK (length(trim("context_sources"."source_uri")) > 0),
	CONSTRAINT "context_sources_label_present" CHECK (length(trim("context_sources"."label")) > 0)
);
--> statement-breakpoint
CREATE TABLE "evidence_pointers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"shard_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"locator" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"snippet_policy" "evidence_snippet_policy" DEFAULT 'redacted_snippet' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learn_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"node_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"answer_hint" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"strength" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learn_cards_prompt_present" CHECK (length(trim("learn_cards"."prompt")) > 0),
	CONSTRAINT "learn_cards_answer_hint_present" CHECK (length(trim("learn_cards"."answer_hint")) > 0),
	CONSTRAINT "learn_cards_strength_range" CHECK ("learn_cards"."strength" >= 0 AND "learn_cards"."strength" <= 100)
);
--> statement-breakpoint
CREATE TABLE "memory_shards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"text" text NOT NULL,
	"type" "memory_shard_type" NOT NULL,
	"source_class" "memory_source_class" NOT NULL,
	"confidence" integer DEFAULT 60 NOT NULL,
	"decay" integer DEFAULT 0 NOT NULL,
	"review_status" "memory_review_status" DEFAULT 'pending' NOT NULL,
	"source_digest_id" uuid,
	"consent" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"visibility" "memory_visibility" DEFAULT 'private' NOT NULL,
	CONSTRAINT "memory_shards_text_present" CHECK (length(trim("memory_shards"."text")) > 0),
	CONSTRAINT "memory_shards_confidence_range" CHECK ("memory_shards"."confidence" >= 0 AND "memory_shards"."confidence" <= 100),
	CONSTRAINT "memory_shards_decay_range" CHECK ("memory_shards"."decay" >= 0 AND "memory_shards"."decay" <= 100)
);
--> statement-breakpoint
CREATE TABLE "source_digests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"source_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"extracted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "source_digests_title_present" CHECK (length(trim("source_digests"."title")) > 0),
	CONSTRAINT "source_digests_summary_present" CHECK (length(trim("source_digests"."summary")) > 0)
);
--> statement-breakpoint
ALTER TABLE "brain_edges" ADD CONSTRAINT "brain_edges_from_node_brain_nodes_id_fk" FOREIGN KEY ("from_node") REFERENCES "public"."brain_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_edges" ADD CONSTRAINT "brain_edges_to_node_brain_nodes_id_fk" FOREIGN KEY ("to_node") REFERENCES "public"."brain_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_nodes" ADD CONSTRAINT "brain_nodes_memory_shard_id_memory_shards_id_fk" FOREIGN KEY ("memory_shard_id") REFERENCES "public"."memory_shards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_nodes" ADD CONSTRAINT "brain_nodes_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_results" ADD CONSTRAINT "check_results_node_id_brain_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."brain_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_suggestions" ADD CONSTRAINT "claim_suggestions_shard_id_memory_shards_id_fk" FOREIGN KEY ("shard_id") REFERENCES "public"."memory_shards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_sync_jobs" ADD CONSTRAINT "connector_sync_jobs_connector_account_id_connector_accounts_id_fk" FOREIGN KEY ("connector_account_id") REFERENCES "public"."connector_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_audit_logs" ADD CONSTRAINT "context_audit_logs_connector_account_id_connector_accounts_id_fk" FOREIGN KEY ("connector_account_id") REFERENCES "public"."connector_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_audit_logs" ADD CONSTRAINT "context_audit_logs_source_id_context_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."context_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_audit_logs" ADD CONSTRAINT "context_audit_logs_memory_shard_id_memory_shards_id_fk" FOREIGN KEY ("memory_shard_id") REFERENCES "public"."memory_shards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_chunks" ADD CONSTRAINT "context_chunks_source_id_context_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."context_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_sources" ADD CONSTRAINT "context_sources_connector_account_id_connector_accounts_id_fk" FOREIGN KEY ("connector_account_id") REFERENCES "public"."connector_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_pointers" ADD CONSTRAINT "evidence_pointers_shard_id_memory_shards_id_fk" FOREIGN KEY ("shard_id") REFERENCES "public"."memory_shards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_pointers" ADD CONSTRAINT "evidence_pointers_source_id_context_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."context_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learn_cards" ADD CONSTRAINT "learn_cards_node_id_brain_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."brain_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_shards" ADD CONSTRAINT "memory_shards_source_digest_id_source_digests_id_fk" FOREIGN KEY ("source_digest_id") REFERENCES "public"."source_digests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_digests" ADD CONSTRAINT "source_digests_source_id_context_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."context_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brain_edges_from_node_idx" ON "brain_edges" USING btree ("from_node");--> statement-breakpoint
CREATE INDEX "brain_edges_to_node_idx" ON "brain_edges" USING btree ("to_node");--> statement-breakpoint
CREATE INDEX "brain_edges_scope_idx" ON "brain_edges" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "brain_edges_type_idx" ON "brain_edges" USING btree ("type");--> statement-breakpoint
CREATE INDEX "brain_nodes_scope_idx" ON "brain_nodes" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "brain_nodes_type_idx" ON "brain_nodes" USING btree ("type");--> statement-breakpoint
CREATE INDEX "brain_nodes_status_idx" ON "brain_nodes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "brain_nodes_memory_shard_id_idx" ON "brain_nodes" USING btree ("memory_shard_id");--> statement-breakpoint
CREATE INDEX "brain_nodes_claim_id_idx" ON "brain_nodes" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "check_results_node_id_idx" ON "check_results" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "check_results_scope_idx" ON "check_results" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "check_results_risk_idx" ON "check_results" USING btree ("risk");--> statement-breakpoint
CREATE INDEX "claim_suggestions_shard_idx" ON "claim_suggestions" USING btree ("shard_id");--> statement-breakpoint
CREATE INDEX "claim_suggestions_scope_idx" ON "claim_suggestions" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "claim_suggestions_review_status_idx" ON "claim_suggestions" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "connector_accounts_scope_idx" ON "connector_accounts" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "connector_accounts_provider_idx" ON "connector_accounts" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "connector_accounts_status_idx" ON "connector_accounts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "connector_accounts_last_sync_idx" ON "connector_accounts" USING btree ("last_sync");--> statement-breakpoint
CREATE INDEX "connector_sync_jobs_account_idx" ON "connector_sync_jobs" USING btree ("connector_account_id");--> statement-breakpoint
CREATE INDEX "connector_sync_jobs_scope_idx" ON "connector_sync_jobs" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "connector_sync_jobs_provider_status_idx" ON "connector_sync_jobs" USING btree ("provider","status");--> statement-breakpoint
CREATE INDEX "connector_sync_jobs_created_at_idx" ON "connector_sync_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "consent_settings_scope_idx" ON "consent_settings" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "context_audit_logs_scope_idx" ON "context_audit_logs" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "context_audit_logs_event_idx" ON "context_audit_logs" USING btree ("event");--> statement-breakpoint
CREATE INDEX "context_audit_logs_connector_account_idx" ON "context_audit_logs" USING btree ("connector_account_id");--> statement-breakpoint
CREATE INDEX "context_audit_logs_source_idx" ON "context_audit_logs" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "context_audit_logs_memory_shard_idx" ON "context_audit_logs" USING btree ("memory_shard_id");--> statement-breakpoint
CREATE INDEX "context_audit_logs_created_at_idx" ON "context_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "context_chunks_source_hash_idx" ON "context_chunks" USING btree ("source_id","hash");--> statement-breakpoint
CREATE INDEX "context_chunks_source_id_idx" ON "context_chunks" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "context_chunks_scope_idx" ON "context_chunks" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "context_chunks_status_idx" ON "context_chunks" USING btree ("processing_status");--> statement-breakpoint
CREATE UNIQUE INDEX "context_sources_provider_uri_scope_idx" ON "context_sources" USING btree ("provider","source_uri","user_id");--> statement-breakpoint
CREATE INDEX "context_sources_account_idx" ON "context_sources" USING btree ("connector_account_id");--> statement-breakpoint
CREATE INDEX "context_sources_scope_idx" ON "context_sources" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "context_sources_provider_idx" ON "context_sources" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "evidence_pointers_shard_id_idx" ON "evidence_pointers" USING btree ("shard_id");--> statement-breakpoint
CREATE INDEX "evidence_pointers_source_id_idx" ON "evidence_pointers" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "evidence_pointers_scope_idx" ON "evidence_pointers" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "evidence_pointers_snippet_policy_idx" ON "evidence_pointers" USING btree ("snippet_policy");--> statement-breakpoint
CREATE INDEX "learn_cards_node_id_idx" ON "learn_cards" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "learn_cards_scope_idx" ON "learn_cards" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "learn_cards_due_at_idx" ON "learn_cards" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "memory_shards_scope_idx" ON "memory_shards" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "memory_shards_type_idx" ON "memory_shards" USING btree ("type");--> statement-breakpoint
CREATE INDEX "memory_shards_source_class_idx" ON "memory_shards" USING btree ("source_class");--> statement-breakpoint
CREATE INDEX "memory_shards_review_status_idx" ON "memory_shards" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "memory_shards_last_seen_idx" ON "memory_shards" USING btree ("last_seen");--> statement-breakpoint
CREATE INDEX "source_digests_source_id_idx" ON "source_digests" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "source_digests_scope_idx" ON "source_digests" USING btree ("user_id","workspace_id","project_id","sphere_id");