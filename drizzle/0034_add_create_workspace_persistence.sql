CREATE TABLE "create_option_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"create_project_id" text NOT NULL,
	"create_session_id" text NOT NULL,
	"source_of_truth" text NOT NULL,
	"raw_idea" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"next_best_move" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ranked_candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"memory_used" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sources_used" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "create_option_sets_project_present" CHECK (length(trim("create_option_sets"."create_project_id")) > 0),
	CONSTRAINT "create_option_sets_session_present" CHECK (length(trim("create_option_sets"."create_session_id")) > 0),
	CONSTRAINT "create_option_sets_raw_idea_present" CHECK (length(trim("create_option_sets"."raw_idea")) > 0),
	CONSTRAINT "create_option_sets_source_valid" CHECK ("create_option_sets"."source_of_truth" IN ('rough_idea_context_deterministic_create_lenses', 'rough_idea_context_model_backed_create_lenses'))
);
--> statement-breakpoint
CREATE INDEX "create_option_sets_scope_idx" ON "create_option_sets" USING btree ("user_id","workspace_id","project_id","sphere_id");
--> statement-breakpoint
CREATE INDEX "create_option_sets_create_session_idx" ON "create_option_sets" USING btree ("create_project_id","create_session_id");
--> statement-breakpoint
CREATE INDEX "create_option_sets_created_at_idx" ON "create_option_sets" USING btree ("created_at");
--> statement-breakpoint
CREATE TABLE "create_artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"create_project_id" text NOT NULL,
	"create_session_id" text NOT NULL,
	"title" text NOT NULL,
	"version" integer NOT NULL,
	"raw_idea" text NOT NULL,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_option_set_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"judgment_event_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "create_artifacts_project_present" CHECK (length(trim("create_artifacts"."create_project_id")) > 0),
	CONSTRAINT "create_artifacts_session_present" CHECK (length(trim("create_artifacts"."create_session_id")) > 0),
	CONSTRAINT "create_artifacts_title_present" CHECK (length(trim("create_artifacts"."title")) > 0),
	CONSTRAINT "create_artifacts_version_positive" CHECK ("create_artifacts"."version" > 0),
	CONSTRAINT "create_artifacts_raw_idea_present" CHECK (length(trim("create_artifacts"."raw_idea")) > 0)
);
--> statement-breakpoint
CREATE INDEX "create_artifacts_scope_idx" ON "create_artifacts" USING btree ("user_id","workspace_id","project_id","sphere_id");
--> statement-breakpoint
CREATE INDEX "create_artifacts_create_session_idx" ON "create_artifacts" USING btree ("create_project_id","create_session_id");
--> statement-breakpoint
CREATE INDEX "create_artifacts_updated_at_idx" ON "create_artifacts" USING btree ("updated_at");
--> statement-breakpoint
CREATE TABLE "create_judgment_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"create_project_id" text NOT NULL,
	"create_session_id" text NOT NULL,
	"option_set_id" text NOT NULL,
	"selected_option_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"user_comment" text NOT NULL,
	"inferred_signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"artifact_delta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "create_judgment_events_project_present" CHECK (length(trim("create_judgment_events"."create_project_id")) > 0),
	CONSTRAINT "create_judgment_events_session_present" CHECK (length(trim("create_judgment_events"."create_session_id")) > 0),
	CONSTRAINT "create_judgment_events_option_set_present" CHECK (length(trim("create_judgment_events"."option_set_id")) > 0),
	CONSTRAINT "create_judgment_events_comment_max" CHECK (length("create_judgment_events"."user_comment") <= 8000)
);
--> statement-breakpoint
CREATE INDEX "create_judgment_events_scope_idx" ON "create_judgment_events" USING btree ("user_id","workspace_id","project_id","sphere_id");
--> statement-breakpoint
CREATE INDEX "create_judgment_events_create_session_idx" ON "create_judgment_events" USING btree ("create_project_id","create_session_id");
--> statement-breakpoint
CREATE INDEX "create_judgment_events_option_set_idx" ON "create_judgment_events" USING btree ("option_set_id");
--> statement-breakpoint
CREATE INDEX "create_judgment_events_created_at_idx" ON "create_judgment_events" USING btree ("created_at");
