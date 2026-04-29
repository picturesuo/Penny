CREATE TYPE "public"."focus_mode" AS ENUM('brain', 'challenge', 'verify', 'learn', 'artifact');--> statement-breakpoint
CREATE TYPE "public"."focus_source" AS ENUM('autopilot_suggestion', 'autopilot_started', 'manual_selection', 'challenge_response', 'none');--> statement-breakpoint
CREATE TYPE "public"."next_move_action" AS ENUM('resume_open_challenge', 'learn', 'clarify', 'verify', 'challenge');--> statement-breakpoint
CREATE TABLE "focus_states" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"mode" "focus_mode" DEFAULT 'brain' NOT NULL,
	"focused_claim_id" uuid,
	"focused_edge_id" uuid,
	"source" "focus_source" DEFAULT 'none' NOT NULL,
	"suggestion_move_id" uuid,
	"manual_move_id" uuid,
	"paused" boolean DEFAULT false NOT NULL,
	"reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "next_move_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"candidate_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"graph_hash" text NOT NULL,
	"action" "next_move_action" NOT NULL,
	"mode" "focus_mode" NOT NULL,
	"target_claim_id" uuid NOT NULL,
	"target_edge_id" uuid,
	"score" integer NOT NULL,
	"rank" integer NOT NULL,
	"reason" text NOT NULL,
	"reason_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exit_criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score_breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"selected" boolean DEFAULT false NOT NULL,
	"selected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "next_move_candidates_score_nonnegative" CHECK ("next_move_candidates"."score" >= 0),
	CONSTRAINT "next_move_candidates_rank_positive" CHECK ("next_move_candidates"."rank" > 0),
	CONSTRAINT "next_move_candidates_fingerprint_present" CHECK (length(trim("next_move_candidates"."fingerprint")) > 0),
	CONSTRAINT "next_move_candidates_graph_hash_present" CHECK (length(trim("next_move_candidates"."graph_hash")) > 0)
);
--> statement-breakpoint
ALTER TABLE "focus_states" ADD CONSTRAINT "focus_states_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_states" ADD CONSTRAINT "focus_states_focused_claim_id_claims_id_fk" FOREIGN KEY ("focused_claim_id") REFERENCES "public"."claims"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_states" ADD CONSTRAINT "focus_states_focused_edge_id_claim_edges_id_fk" FOREIGN KEY ("focused_edge_id") REFERENCES "public"."claim_edges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_states" ADD CONSTRAINT "focus_states_suggestion_move_id_moves_id_fk" FOREIGN KEY ("suggestion_move_id") REFERENCES "public"."moves"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_states" ADD CONSTRAINT "focus_states_manual_move_id_moves_id_fk" FOREIGN KEY ("manual_move_id") REFERENCES "public"."moves"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "next_move_candidates" ADD CONSTRAINT "next_move_candidates_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "next_move_candidates" ADD CONSTRAINT "next_move_candidates_target_claim_id_claims_id_fk" FOREIGN KEY ("target_claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "next_move_candidates" ADD CONSTRAINT "next_move_candidates_target_edge_id_claim_edges_id_fk" FOREIGN KEY ("target_edge_id") REFERENCES "public"."claim_edges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "focus_states_focused_claim_id_idx" ON "focus_states" USING btree ("focused_claim_id");--> statement-breakpoint
CREATE INDEX "focus_states_scope_idx" ON "focus_states" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "focus_states_focused_edge_id_idx" ON "focus_states" USING btree ("focused_edge_id");--> statement-breakpoint
CREATE INDEX "focus_states_suggestion_move_id_idx" ON "focus_states" USING btree ("suggestion_move_id");--> statement-breakpoint
CREATE INDEX "focus_states_manual_move_id_idx" ON "focus_states" USING btree ("manual_move_id");--> statement-breakpoint
CREATE INDEX "focus_states_paused_idx" ON "focus_states" USING btree ("paused");--> statement-breakpoint
CREATE UNIQUE INDEX "next_move_candidates_session_fingerprint_idx" ON "next_move_candidates" USING btree ("session_id","fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "next_move_candidates_session_candidate_id_idx" ON "next_move_candidates" USING btree ("session_id","candidate_id");--> statement-breakpoint
CREATE INDEX "next_move_candidates_session_id_idx" ON "next_move_candidates" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "next_move_candidates_scope_idx" ON "next_move_candidates" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "next_move_candidates_target_claim_id_idx" ON "next_move_candidates" USING btree ("target_claim_id");--> statement-breakpoint
CREATE INDEX "next_move_candidates_target_edge_id_idx" ON "next_move_candidates" USING btree ("target_edge_id");--> statement-breakpoint
CREATE INDEX "next_move_candidates_graph_hash_idx" ON "next_move_candidates" USING btree ("graph_hash");--> statement-breakpoint
CREATE INDEX "next_move_candidates_selected_idx" ON "next_move_candidates" USING btree ("session_id","selected");