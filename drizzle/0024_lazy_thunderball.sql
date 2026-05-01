CREATE TYPE "public"."recipe_kind" AS ENUM('learn', 'verify', 'check');--> statement-breakpoint
CREATE TYPE "public"."recipe_step_status" AS ENUM('pending', 'running', 'completed', 'limited', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "recipe_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"session_id" uuid NOT NULL,
	"target_claim_id" uuid,
	"brain_run_id" uuid,
	"kind" "recipe_kind" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"title" text NOT NULL,
	"goal" text NOT NULL,
	"status" "recipe_step_status" DEFAULT 'pending' NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_runs_version_positive" CHECK ("recipe_runs"."version" > 0),
	CONSTRAINT "recipe_runs_title_present" CHECK (length(trim("recipe_runs"."title")) > 0),
	CONSTRAINT "recipe_runs_goal_present" CHECK (length(trim("recipe_runs"."goal")) > 0),
	CONSTRAINT "recipe_runs_completion_matches_status" CHECK (("recipe_runs"."status" IN ('completed', 'failed', 'limited', 'skipped') AND "recipe_runs"."completed_at" IS NOT NULL) OR ("recipe_runs"."status" IN ('pending', 'running') AND "recipe_runs"."completed_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "recipe_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"recipe_run_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"step_key" text NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"status" "recipe_step_status" DEFAULT 'pending' NOT NULL,
	"inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"outputs" jsonb,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_steps_position_positive" CHECK ("recipe_steps"."position" > 0),
	CONSTRAINT "recipe_steps_key_present" CHECK (length(trim("recipe_steps"."step_key")) > 0),
	CONSTRAINT "recipe_steps_title_present" CHECK (length(trim("recipe_steps"."title")) > 0),
	CONSTRAINT "recipe_steps_completion_matches_status" CHECK (("recipe_steps"."status" IN ('completed', 'failed', 'limited', 'skipped') AND "recipe_steps"."completed_at" IS NOT NULL) OR ("recipe_steps"."status" IN ('pending', 'running') AND "recipe_steps"."completed_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "recipe_runs" ADD CONSTRAINT "recipe_runs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_runs" ADD CONSTRAINT "recipe_runs_target_claim_id_claims_id_fk" FOREIGN KEY ("target_claim_id") REFERENCES "public"."claims"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_runs" ADD CONSTRAINT "recipe_runs_brain_run_id_brain_runs_id_fk" FOREIGN KEY ("brain_run_id") REFERENCES "public"."brain_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_steps" ADD CONSTRAINT "recipe_steps_recipe_run_id_recipe_runs_id_fk" FOREIGN KEY ("recipe_run_id") REFERENCES "public"."recipe_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_steps" ADD CONSTRAINT "recipe_steps_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_runs_session_id_idx" ON "recipe_runs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "recipe_runs_scope_idx" ON "recipe_runs" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "recipe_runs_target_claim_id_idx" ON "recipe_runs" USING btree ("target_claim_id");--> statement-breakpoint
CREATE INDEX "recipe_runs_brain_run_id_idx" ON "recipe_runs" USING btree ("brain_run_id");--> statement-breakpoint
CREATE INDEX "recipe_runs_kind_status_idx" ON "recipe_runs" USING btree ("kind","status");--> statement-breakpoint
CREATE INDEX "recipe_runs_started_at_idx" ON "recipe_runs" USING btree ("started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_steps_run_step_key_idx" ON "recipe_steps" USING btree ("recipe_run_id","step_key");--> statement-breakpoint
CREATE INDEX "recipe_steps_recipe_run_id_idx" ON "recipe_steps" USING btree ("recipe_run_id");--> statement-breakpoint
CREATE INDEX "recipe_steps_session_id_idx" ON "recipe_steps" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "recipe_steps_scope_idx" ON "recipe_steps" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "recipe_steps_status_idx" ON "recipe_steps" USING btree ("status");