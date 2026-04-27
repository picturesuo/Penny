CREATE TYPE "public"."artifact_kind" AS ENUM('idea_map', 'challenge_brief');--> statement-breakpoint
CREATE TYPE "public"."claim_edge_kind" AS ENUM('assumes', 'supports', 'questions', 'challenges', 'clarifies');--> statement-breakpoint
CREATE TYPE "public"."claim_kind" AS ENUM('belief', 'assumption', 'question', 'concept');--> statement-breakpoint
CREATE TYPE "public"."claim_status" AS ENUM('exploratory', 'committed', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."move_kind" AS ENUM('source.recorded', 'claim.created', 'edge.created', 'assumption.extracted', 'exploration.suggested', 'challenge.created', 'artifact.created', 'challenge.response.defended', 'challenge.response.revised', 'challenge.response.absorbed');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('open', 'completed');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('raw_idea');--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"kind" "artifact_kind" NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"from_claim_id" uuid NOT NULL,
	"to_claim_id" uuid NOT NULL,
	"kind" "claim_edge_kind" NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claim_edges_no_self_edge" CHECK ("claim_edges"."from_claim_id" <> "claim_edges"."to_claim_id")
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"source_id" uuid,
	"kind" "claim_kind" NOT NULL,
	"status" "claim_status" DEFAULT 'exploratory' NOT NULL,
	"text" text NOT NULL,
	"confidence" integer DEFAULT 60 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claims_confidence_range" CHECK ("claims"."confidence" >= 0 AND "claims"."confidence" <= 100)
);
--> statement-breakpoint
CREATE TABLE "moves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"kind" "move_kind" NOT NULL,
	"summary" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "session_status" DEFAULT 'open' NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"kind" "source_kind" DEFAULT 'raw_idea' NOT NULL,
	"raw_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_edges" ADD CONSTRAINT "claim_edges_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_edges" ADD CONSTRAINT "claim_edges_from_claim_id_claims_id_fk" FOREIGN KEY ("from_claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_edges" ADD CONSTRAINT "claim_edges_to_claim_id_claims_id_fk" FOREIGN KEY ("to_claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moves" ADD CONSTRAINT "moves_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifacts_session_id_idx" ON "artifacts" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "artifacts_kind_idx" ON "artifacts" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "claim_edges_session_id_idx" ON "claim_edges" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "claim_edges_from_claim_id_idx" ON "claim_edges" USING btree ("from_claim_id");--> statement-breakpoint
CREATE INDEX "claim_edges_to_claim_id_idx" ON "claim_edges" USING btree ("to_claim_id");--> statement-breakpoint
CREATE INDEX "claims_session_id_idx" ON "claims" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "claims_source_id_idx" ON "claims" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "claims_kind_idx" ON "claims" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "moves_session_id_idx" ON "moves" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "moves_kind_idx" ON "moves" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "moves_created_at_idx" ON "moves" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sessions_status_idx" ON "sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sessions_created_at_idx" ON "sessions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sources_session_id_idx" ON "sources" USING btree ("session_id");