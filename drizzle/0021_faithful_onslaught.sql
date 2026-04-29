CREATE TYPE "public"."challenge_failure_type" AS ENUM('weak_evidence', 'missing_counterargument', 'shaky_assumption', 'analogy_break', 'dependency_risk', 'unaddressed_precedent', 'premise_rejection', 'definition_failure');--> statement-breakpoint
CREATE TYPE "public"."challenge_round_response" AS ENUM('defend', 'revise', 'absorb');--> statement-breakpoint
CREATE TYPE "public"."challenge_round_status" AS ENUM('open', 'responded');--> statement-breakpoint
CREATE TYPE "public"."challenge_strength" AS ENUM('weak', 'moderate', 'strong');--> statement-breakpoint
ALTER TYPE "public"."move_kind" ADD VALUE 'focus_completed' BEFORE 'verify_run';--> statement-breakpoint
CREATE TABLE "challenge_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"session_id" uuid NOT NULL,
	"next_move_candidate_id" uuid,
	"candidate_id" text,
	"candidate_fingerprint" text,
	"status" "challenge_round_status" DEFAULT 'open' NOT NULL,
	"response" "challenge_round_response",
	"target_claim_id" uuid NOT NULL,
	"target_claim_version_id" uuid NOT NULL,
	"critique_claim_id" uuid NOT NULL,
	"critique_claim_version_id" uuid NOT NULL,
	"challenge_edge_id" uuid NOT NULL,
	"brain_run_id" uuid NOT NULL,
	"challenge_move_id" uuid NOT NULL,
	"response_move_id" uuid,
	"focus_completed_move_id" uuid,
	"failure_type" "challenge_failure_type" NOT NULL,
	"strength" "challenge_strength" NOT NULL,
	"critique" text NOT NULL,
	"why_this" text NOT NULL,
	"what_would_resolve_it" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_rounds_response_requires_timestamp" CHECK (("challenge_rounds"."status" = 'open' AND "challenge_rounds"."responded_at" IS NULL AND "challenge_rounds"."response" IS NULL) OR ("challenge_rounds"."status" = 'responded' AND "challenge_rounds"."responded_at" IS NOT NULL AND "challenge_rounds"."response" IS NOT NULL)),
	CONSTRAINT "challenge_rounds_critique_present" CHECK (length(trim("challenge_rounds"."critique")) > 0),
	CONSTRAINT "challenge_rounds_why_this_present" CHECK (length(trim("challenge_rounds"."why_this")) > 0),
	CONSTRAINT "challenge_rounds_resolution_present" CHECK (length(trim("challenge_rounds"."what_would_resolve_it")) > 0)
);
--> statement-breakpoint
ALTER TABLE "challenge_rounds" ADD CONSTRAINT "challenge_rounds_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_rounds" ADD CONSTRAINT "challenge_rounds_next_move_candidate_id_next_move_candidates_id_fk" FOREIGN KEY ("next_move_candidate_id") REFERENCES "public"."next_move_candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_rounds" ADD CONSTRAINT "challenge_rounds_target_claim_id_claims_id_fk" FOREIGN KEY ("target_claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_rounds" ADD CONSTRAINT "challenge_rounds_target_claim_version_id_claim_versions_id_fk" FOREIGN KEY ("target_claim_version_id") REFERENCES "public"."claim_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_rounds" ADD CONSTRAINT "challenge_rounds_critique_claim_id_claims_id_fk" FOREIGN KEY ("critique_claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_rounds" ADD CONSTRAINT "challenge_rounds_critique_claim_version_id_claim_versions_id_fk" FOREIGN KEY ("critique_claim_version_id") REFERENCES "public"."claim_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_rounds" ADD CONSTRAINT "challenge_rounds_challenge_edge_id_claim_edges_id_fk" FOREIGN KEY ("challenge_edge_id") REFERENCES "public"."claim_edges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_rounds" ADD CONSTRAINT "challenge_rounds_brain_run_id_brain_runs_id_fk" FOREIGN KEY ("brain_run_id") REFERENCES "public"."brain_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_rounds" ADD CONSTRAINT "challenge_rounds_challenge_move_id_moves_id_fk" FOREIGN KEY ("challenge_move_id") REFERENCES "public"."moves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_rounds" ADD CONSTRAINT "challenge_rounds_response_move_id_moves_id_fk" FOREIGN KEY ("response_move_id") REFERENCES "public"."moves"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_rounds" ADD CONSTRAINT "challenge_rounds_focus_completed_move_id_moves_id_fk" FOREIGN KEY ("focus_completed_move_id") REFERENCES "public"."moves"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "challenge_rounds_session_id_idx" ON "challenge_rounds" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "challenge_rounds_scope_idx" ON "challenge_rounds" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "challenge_rounds_next_move_candidate_id_idx" ON "challenge_rounds" USING btree ("next_move_candidate_id");--> statement-breakpoint
CREATE INDEX "challenge_rounds_target_claim_id_idx" ON "challenge_rounds" USING btree ("target_claim_id");--> statement-breakpoint
CREATE INDEX "challenge_rounds_challenge_edge_id_idx" ON "challenge_rounds" USING btree ("challenge_edge_id");--> statement-breakpoint
CREATE INDEX "challenge_rounds_status_idx" ON "challenge_rounds" USING btree ("status");--> statement-breakpoint
CREATE INDEX "challenge_rounds_response_move_id_idx" ON "challenge_rounds" USING btree ("response_move_id");--> statement-breakpoint
CREATE INDEX "challenge_rounds_focus_completed_move_id_idx" ON "challenge_rounds" USING btree ("focus_completed_move_id");