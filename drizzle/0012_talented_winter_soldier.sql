CREATE TYPE "public"."shape_status" AS ENUM('candidate', 'confirmed', 'rejected', 'superseded');--> statement-breakpoint
CREATE TABLE "shapes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"source_move_id" uuid NOT NULL,
	"key" text NOT NULL,
	"status" "shape_status" DEFAULT 'candidate' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"confidence" integer DEFAULT 50 NOT NULL,
	"supporting_move_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "shapes_confidence_range" CHECK ("shapes"."confidence" >= 0 AND "shapes"."confidence" <= 100),
	CONSTRAINT "shapes_version_positive" CHECK ("shapes"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "shapes" ADD CONSTRAINT "shapes_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shapes" ADD CONSTRAINT "shapes_source_move_id_moves_id_fk" FOREIGN KEY ("source_move_id") REFERENCES "public"."moves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shapes_session_id_idx" ON "shapes" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "shapes_source_move_id_idx" ON "shapes" USING btree ("source_move_id");--> statement-breakpoint
CREATE INDEX "shapes_key_idx" ON "shapes" USING btree ("key");--> statement-breakpoint
CREATE INDEX "shapes_status_idx" ON "shapes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "shapes_created_at_idx" ON "shapes" USING btree ("created_at");