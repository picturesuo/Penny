CREATE TABLE "create_export_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"create_project_id" text NOT NULL,
	"create_session_id" text NOT NULL,
	"artifact_id" text NOT NULL,
	"export_id" text NOT NULL,
	"rating" text NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"comment" text,
	"prompt_completeness_score" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "create_export_feedback_project_present" CHECK (length(trim("create_export_feedback"."create_project_id")) > 0),
	CONSTRAINT "create_export_feedback_session_present" CHECK (length(trim("create_export_feedback"."create_session_id")) > 0),
	CONSTRAINT "create_export_feedback_artifact_present" CHECK (length(trim("create_export_feedback"."artifact_id")) > 0),
	CONSTRAINT "create_export_feedback_export_present" CHECK (length(trim("create_export_feedback"."export_id")) > 0),
	CONSTRAINT "create_export_feedback_rating_valid" CHECK ("create_export_feedback"."rating" IN ('useful', 'not_useful')),
	CONSTRAINT "create_export_feedback_comment_max" CHECK ("create_export_feedback"."comment" IS NULL OR length("create_export_feedback"."comment") <= 1000),
	CONSTRAINT "create_export_feedback_score_range" CHECK ("create_export_feedback"."prompt_completeness_score" IS NULL OR ("create_export_feedback"."prompt_completeness_score" >= 0 AND "create_export_feedback"."prompt_completeness_score" <= 100))
);
--> statement-breakpoint
CREATE INDEX "create_export_feedback_scope_idx" ON "create_export_feedback" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "create_export_feedback_artifact_idx" ON "create_export_feedback" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "create_export_feedback_export_idx" ON "create_export_feedback" USING btree ("export_id");--> statement-breakpoint
CREATE INDEX "create_export_feedback_rating_idx" ON "create_export_feedback" USING btree ("rating");--> statement-breakpoint
CREATE INDEX "create_export_feedback_created_at_idx" ON "create_export_feedback" USING btree ("created_at");
