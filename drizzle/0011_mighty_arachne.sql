CREATE TYPE "public"."derived_effect_kind" AS ENUM('shape_candidate', 'confidence_cascade', 'unresolved_risk', 'stale_artifact', 'next_move_recommendation');--> statement-breakpoint
CREATE TYPE "public"."derived_effect_status" AS ENUM('pending_review', 'accepted', 'rejected', 'superseded');--> statement-breakpoint
CREATE TABLE "derived_effects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"source_move_id" uuid NOT NULL,
	"kind" "derived_effect_kind" NOT NULL,
	"status" "derived_effect_status" DEFAULT 'pending_review' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "derived_effects_version_positive" CHECK ("derived_effects"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "derived_effects" ADD CONSTRAINT "derived_effects_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_effects" ADD CONSTRAINT "derived_effects_source_move_id_moves_id_fk" FOREIGN KEY ("source_move_id") REFERENCES "public"."moves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "derived_effects_session_id_idx" ON "derived_effects" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "derived_effects_source_move_id_idx" ON "derived_effects" USING btree ("source_move_id");--> statement-breakpoint
CREATE INDEX "derived_effects_kind_idx" ON "derived_effects" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "derived_effects_status_idx" ON "derived_effects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "derived_effects_created_at_idx" ON "derived_effects" USING btree ("created_at");