CREATE TABLE "brain_memory_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"privacy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"permission" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"text_hash" text NOT NULL,
	"content_length" integer NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"memory_node_count" integer DEFAULT 0 NOT NULL,
	"file_name" text,
	"mime_type" text,
	"source_uri" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brain_memory_sources_kind_present" CHECK (length(trim("brain_memory_sources"."kind")) > 0),
	CONSTRAINT "brain_memory_sources_label_present" CHECK (length(trim("brain_memory_sources"."label")) > 0),
	CONSTRAINT "brain_memory_sources_hash_present" CHECK (length(trim("brain_memory_sources"."text_hash")) > 0),
	CONSTRAINT "brain_memory_sources_content_length_nonnegative" CHECK ("brain_memory_sources"."content_length" >= 0),
	CONSTRAINT "brain_memory_sources_chunk_count_nonnegative" CHECK ("brain_memory_sources"."chunk_count" >= 0),
	CONSTRAINT "brain_memory_sources_node_count_nonnegative" CHECK ("brain_memory_sources"."memory_node_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "brain_memory_source_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"source_id" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"text" text NOT NULL,
	"char_start" integer NOT NULL,
	"char_end" integer NOT NULL,
	"token_estimate" integer NOT NULL,
	"hash" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brain_memory_chunks_text_present" CHECK (length(trim("brain_memory_source_chunks"."text")) > 0),
	CONSTRAINT "brain_memory_chunks_hash_present" CHECK (length(trim("brain_memory_source_chunks"."hash")) > 0),
	CONSTRAINT "brain_memory_chunks_index_nonnegative" CHECK ("brain_memory_source_chunks"."chunk_index" >= 0),
	CONSTRAINT "brain_memory_chunks_start_nonnegative" CHECK ("brain_memory_source_chunks"."char_start" >= 0),
	CONSTRAINT "brain_memory_chunks_end_after_start" CHECK ("brain_memory_source_chunks"."char_end" >= "brain_memory_source_chunks"."char_start"),
	CONSTRAINT "brain_memory_chunks_token_positive" CHECK ("brain_memory_source_chunks"."token_estimate" > 0)
);
--> statement-breakpoint
CREATE TABLE "brain_memory_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"source_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"text" text NOT NULL,
	"chunk_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" integer NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_level" text DEFAULT 'inferred' NOT NULL,
	"permission" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brain_memory_nodes_type_present" CHECK (length(trim("brain_memory_nodes"."type")) > 0),
	CONSTRAINT "brain_memory_nodes_title_present" CHECK (length(trim("brain_memory_nodes"."title")) > 0),
	CONSTRAINT "brain_memory_nodes_summary_present" CHECK (length(trim("brain_memory_nodes"."summary")) > 0),
	CONSTRAINT "brain_memory_nodes_text_present" CHECK (length(trim("brain_memory_nodes"."text")) > 0),
	CONSTRAINT "brain_memory_nodes_confidence_range" CHECK ("brain_memory_nodes"."confidence" >= 0 AND "brain_memory_nodes"."confidence" <= 100),
	CONSTRAINT "brain_memory_nodes_evidence_level_valid" CHECK ("brain_memory_nodes"."evidence_level" IN ('user_confirmed', 'grounded', 'inferred'))
);
--> statement-breakpoint
CREATE TABLE "brain_memory_edges" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"kind" text NOT NULL,
	"from_node_id" text NOT NULL,
	"to_node_id" text NOT NULL,
	"source_id" text NOT NULL,
	"weight" integer DEFAULT 50 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brain_memory_edges_kind_present" CHECK (length(trim("brain_memory_edges"."kind")) > 0),
	CONSTRAINT "brain_memory_edges_no_self_edge" CHECK ("brain_memory_edges"."from_node_id" <> "brain_memory_edges"."to_node_id"),
	CONSTRAINT "brain_memory_edges_weight_range" CHECK ("brain_memory_edges"."weight" >= 0 AND "brain_memory_edges"."weight" <= 100)
);
--> statement-breakpoint
CREATE TABLE "brain_memory_profile_signals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"summary" text NOT NULL,
	"weight" integer DEFAULT 50 NOT NULL,
	"source_node_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brain_memory_profile_signals_kind_present" CHECK (length(trim("brain_memory_profile_signals"."kind")) > 0),
	CONSTRAINT "brain_memory_profile_signals_label_present" CHECK (length(trim("brain_memory_profile_signals"."label")) > 0),
	CONSTRAINT "brain_memory_profile_signals_summary_present" CHECK (length(trim("brain_memory_profile_signals"."summary")) > 0),
	CONSTRAINT "brain_memory_profile_signals_weight_range" CHECK ("brain_memory_profile_signals"."weight" >= 0 AND "brain_memory_profile_signals"."weight" <= 100)
);
--> statement-breakpoint
CREATE TABLE "brain_memory_ingestion_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"status" text NOT NULL,
	"source_id" text,
	"source_import" jsonb,
	"error_messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brain_memory_jobs_status_valid" CHECK ("brain_memory_ingestion_jobs"."status" IN ('completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "brain_memory_retrieval_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"query" text NOT NULL,
	"context_light" boolean DEFAULT false NOT NULL,
	"result_node_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"result_source_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"result_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brain_memory_retrieval_events_query_present" CHECK (length(trim("brain_memory_retrieval_events"."query")) > 0),
	CONSTRAINT "brain_memory_retrieval_events_result_count_nonnegative" CHECK ("brain_memory_retrieval_events"."result_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "brain_memory_source_chunks" ADD CONSTRAINT "brain_memory_source_chunks_source_id_brain_memory_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."brain_memory_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_memory_nodes" ADD CONSTRAINT "brain_memory_nodes_source_id_brain_memory_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."brain_memory_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_memory_edges" ADD CONSTRAINT "brain_memory_edges_from_node_id_brain_memory_nodes_id_fk" FOREIGN KEY ("from_node_id") REFERENCES "public"."brain_memory_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_memory_edges" ADD CONSTRAINT "brain_memory_edges_to_node_id_brain_memory_nodes_id_fk" FOREIGN KEY ("to_node_id") REFERENCES "public"."brain_memory_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_memory_edges" ADD CONSTRAINT "brain_memory_edges_source_id_brain_memory_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."brain_memory_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_memory_ingestion_jobs" ADD CONSTRAINT "brain_memory_ingestion_jobs_source_id_brain_memory_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."brain_memory_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brain_memory_sources_scope_idx" ON "brain_memory_sources" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "brain_memory_sources_kind_idx" ON "brain_memory_sources" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "brain_memory_sources_text_hash_idx" ON "brain_memory_sources" USING btree ("text_hash");--> statement-breakpoint
CREATE INDEX "brain_memory_sources_deleted_at_idx" ON "brain_memory_sources" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "brain_memory_sources_updated_at_idx" ON "brain_memory_sources" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_memory_chunks_source_index_idx" ON "brain_memory_source_chunks" USING btree ("source_id","chunk_index");--> statement-breakpoint
CREATE INDEX "brain_memory_chunks_scope_idx" ON "brain_memory_source_chunks" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "brain_memory_chunks_source_id_idx" ON "brain_memory_source_chunks" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "brain_memory_chunks_hash_idx" ON "brain_memory_source_chunks" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "brain_memory_chunks_deleted_at_idx" ON "brain_memory_source_chunks" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "brain_memory_nodes_scope_idx" ON "brain_memory_nodes" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "brain_memory_nodes_source_id_idx" ON "brain_memory_nodes" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "brain_memory_nodes_type_idx" ON "brain_memory_nodes" USING btree ("type");--> statement-breakpoint
CREATE INDEX "brain_memory_nodes_deleted_at_idx" ON "brain_memory_nodes" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "brain_memory_nodes_last_seen_at_idx" ON "brain_memory_nodes" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "brain_memory_edges_scope_idx" ON "brain_memory_edges" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "brain_memory_edges_kind_idx" ON "brain_memory_edges" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "brain_memory_edges_from_node_idx" ON "brain_memory_edges" USING btree ("from_node_id");--> statement-breakpoint
CREATE INDEX "brain_memory_edges_to_node_idx" ON "brain_memory_edges" USING btree ("to_node_id");--> statement-breakpoint
CREATE INDEX "brain_memory_edges_source_id_idx" ON "brain_memory_edges" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "brain_memory_edges_deleted_at_idx" ON "brain_memory_edges" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "brain_memory_profile_signals_scope_idx" ON "brain_memory_profile_signals" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "brain_memory_profile_signals_kind_idx" ON "brain_memory_profile_signals" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "brain_memory_profile_signals_deleted_at_idx" ON "brain_memory_profile_signals" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "brain_memory_profile_signals_updated_at_idx" ON "brain_memory_profile_signals" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "brain_memory_jobs_scope_idx" ON "brain_memory_ingestion_jobs" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "brain_memory_jobs_status_idx" ON "brain_memory_ingestion_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "brain_memory_jobs_source_id_idx" ON "brain_memory_ingestion_jobs" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "brain_memory_jobs_imported_at_idx" ON "brain_memory_ingestion_jobs" USING btree ("imported_at");--> statement-breakpoint
CREATE INDEX "brain_memory_retrieval_events_scope_idx" ON "brain_memory_retrieval_events" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "brain_memory_retrieval_events_context_light_idx" ON "brain_memory_retrieval_events" USING btree ("context_light");--> statement-breakpoint
CREATE INDEX "brain_memory_retrieval_events_created_at_idx" ON "brain_memory_retrieval_events" USING btree ("created_at");
