CREATE TYPE "public"."ai_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid,
	"type" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"prompt_version_id" uuid,
	"status" "ai_job_status" DEFAULT 'queued' NOT NULL,
	"input_json" jsonb NOT NULL,
	"output_json" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "confidence_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"rating_bps" integer NOT NULL,
	"rationale" text,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "graph_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"map_id" uuid NOT NULL,
	"source_node_id" uuid NOT NULL,
	"target_node_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"weight_bps" integer,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "graph_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"map_id" uuid NOT NULL,
	"claim_id" uuid,
	"thought_id" uuid,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation" text NOT NULL,
	"version" text NOT NULL,
	"prompt_hash" text NOT NULL,
	"prompt_text" text NOT NULL,
	"output_schema_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thoughts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"map_id" uuid,
	"raw_text" text NOT NULL,
	"source" text,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "activity_events_user_id_idx" ON "activity_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_events_session_id_idx" ON "activity_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "activity_events_aggregate_id_idx" ON "activity_events" USING btree ("aggregate_id");--> statement-breakpoint
CREATE INDEX "activity_events_type_idx" ON "activity_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "ai_jobs_user_id_idx" ON "ai_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_jobs_operation_idx" ON "ai_jobs" USING btree ("operation");--> statement-breakpoint
CREATE INDEX "ai_jobs_prompt_version_id_idx" ON "ai_jobs" USING btree ("prompt_version_id");--> statement-breakpoint
CREATE INDEX "ai_jobs_status_idx" ON "ai_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "confidence_ratings_user_id_idx" ON "confidence_ratings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "confidence_ratings_claim_id_idx" ON "confidence_ratings" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "graph_edges_user_id_idx" ON "graph_edges" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "graph_edges_map_id_idx" ON "graph_edges" USING btree ("map_id");--> statement-breakpoint
CREATE INDEX "graph_edges_source_node_id_idx" ON "graph_edges" USING btree ("source_node_id");--> statement-breakpoint
CREATE INDEX "graph_edges_target_node_id_idx" ON "graph_edges" USING btree ("target_node_id");--> statement-breakpoint
CREATE INDEX "graph_nodes_user_id_idx" ON "graph_nodes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "graph_nodes_map_id_idx" ON "graph_nodes" USING btree ("map_id");--> statement-breakpoint
CREATE INDEX "graph_nodes_claim_id_idx" ON "graph_nodes" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "graph_nodes_thought_id_idx" ON "graph_nodes" USING btree ("thought_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_versions_operation_version_unique" ON "prompt_versions" USING btree ("operation","version");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_versions_prompt_hash_unique" ON "prompt_versions" USING btree ("prompt_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "thoughts_user_id_idx" ON "thoughts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "thoughts_map_id_idx" ON "thoughts" USING btree ("map_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");