CREATE TABLE "brain_ranker_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"create_project_id" text NOT NULL,
	"create_session_id" text NOT NULL,
	"option_set_id" text,
	"raw_idea_hash" text NOT NULL,
	"context_light" boolean DEFAULT false NOT NULL,
	"next_best_move" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ranked_candidate_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"high_value_memory_node_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"clusters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"development_event_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brain_ranker_runs_project_present" CHECK (length(trim("brain_ranker_runs"."create_project_id")) > 0),
	CONSTRAINT "brain_ranker_runs_session_present" CHECK (length(trim("brain_ranker_runs"."create_session_id")) > 0),
	CONSTRAINT "brain_ranker_runs_raw_idea_hash_present" CHECK (length(trim("brain_ranker_runs"."raw_idea_hash")) > 0)
);
--> statement-breakpoint
CREATE TABLE "brain_ranked_candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"ranker_run_id" text NOT NULL,
	"lens" text NOT NULL,
	"title" text NOT NULL,
	"top_reason" text NOT NULL,
	"grounding" text NOT NULL,
	"context_label" text NOT NULL,
	"memory_class" text NOT NULL,
	"memory_count" integer DEFAULT 0 NOT NULL,
	"source_count" integer DEFAULT 0 NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"uncertainty" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"memory_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"next_best_move" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brain_ranked_candidates_lens_valid" CHECK ("brain_ranked_candidates"."lens" IN ('Personal', 'Practical', 'Valuable', 'Critical', 'Weird')),
	CONSTRAINT "brain_ranked_candidates_title_present" CHECK (length(trim("brain_ranked_candidates"."title")) > 0),
	CONSTRAINT "brain_ranked_candidates_reason_present" CHECK (length(trim("brain_ranked_candidates"."top_reason")) > 0),
	CONSTRAINT "brain_ranked_candidates_grounding_valid" CHECK ("brain_ranked_candidates"."grounding" IN ('grounded', 'inferred', 'context_light')),
	CONSTRAINT "brain_ranked_candidates_memory_class_valid" CHECK ("brain_ranked_candidates"."memory_class" IN ('semantic', 'episodic', 'procedural', 'emotional_taste')),
	CONSTRAINT "brain_ranked_candidates_memory_count_nonnegative" CHECK ("brain_ranked_candidates"."memory_count" >= 0),
	CONSTRAINT "brain_ranked_candidates_source_count_nonnegative" CHECK ("brain_ranked_candidates"."source_count" >= 0),
	CONSTRAINT "brain_ranked_candidates_next_move_present" CHECK (length(trim("brain_ranked_candidates"."next_best_move")) > 0)
);
--> statement-breakpoint
CREATE TABLE "brain_development_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"kind" text NOT NULL,
	"explicitness" text DEFAULT 'implicit' NOT NULL,
	"weight" integer DEFAULT 50 NOT NULL,
	"create_project_id" text,
	"create_session_id" text,
	"option_set_id" text,
	"artifact_id" text,
	"export_id" text,
	"memory_node_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_reference_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brain_development_events_kind_present" CHECK (length(trim("brain_development_events"."kind")) > 0),
	CONSTRAINT "brain_development_events_explicitness_valid" CHECK ("brain_development_events"."explicitness" IN ('explicit', 'implicit')),
	CONSTRAINT "brain_development_events_weight_range" CHECK ("brain_development_events"."weight" >= 0 AND "brain_development_events"."weight" <= 100),
	CONSTRAINT "brain_development_events_summary_present" CHECK (length(trim("brain_development_events"."summary")) > 0)
);
--> statement-breakpoint
ALTER TABLE "brain_ranked_candidates" ADD CONSTRAINT "brain_ranked_candidates_ranker_run_id_brain_ranker_runs_id_fk" FOREIGN KEY ("ranker_run_id") REFERENCES "public"."brain_ranker_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "brain_ranker_runs_scope_idx" ON "brain_ranker_runs" USING btree ("user_id","workspace_id","project_id","sphere_id");
--> statement-breakpoint
CREATE INDEX "brain_ranker_runs_create_session_idx" ON "brain_ranker_runs" USING btree ("create_project_id","create_session_id");
--> statement-breakpoint
CREATE INDEX "brain_ranker_runs_option_set_idx" ON "brain_ranker_runs" USING btree ("option_set_id");
--> statement-breakpoint
CREATE INDEX "brain_ranker_runs_context_light_idx" ON "brain_ranker_runs" USING btree ("context_light");
--> statement-breakpoint
CREATE INDEX "brain_ranker_runs_created_at_idx" ON "brain_ranker_runs" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "brain_ranked_candidates_scope_idx" ON "brain_ranked_candidates" USING btree ("user_id","workspace_id","project_id","sphere_id");
--> statement-breakpoint
CREATE INDEX "brain_ranked_candidates_run_idx" ON "brain_ranked_candidates" USING btree ("ranker_run_id");
--> statement-breakpoint
CREATE INDEX "brain_ranked_candidates_lens_idx" ON "brain_ranked_candidates" USING btree ("lens");
--> statement-breakpoint
CREATE INDEX "brain_ranked_candidates_grounding_idx" ON "brain_ranked_candidates" USING btree ("grounding");
--> statement-breakpoint
CREATE INDEX "brain_development_events_scope_idx" ON "brain_development_events" USING btree ("user_id","workspace_id","project_id","sphere_id");
--> statement-breakpoint
CREATE INDEX "brain_development_events_kind_idx" ON "brain_development_events" USING btree ("kind");
--> statement-breakpoint
CREATE INDEX "brain_development_events_explicitness_idx" ON "brain_development_events" USING btree ("explicitness");
--> statement-breakpoint
CREATE INDEX "brain_development_events_create_session_idx" ON "brain_development_events" USING btree ("create_project_id","create_session_id");
--> statement-breakpoint
CREATE INDEX "brain_development_events_option_set_idx" ON "brain_development_events" USING btree ("option_set_id");
--> statement-breakpoint
CREATE INDEX "brain_development_events_occurred_at_idx" ON "brain_development_events" USING btree ("occurred_at");
