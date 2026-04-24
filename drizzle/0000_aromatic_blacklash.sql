CREATE TABLE "moves_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"request_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "moves_events_user_id_idx" ON "moves_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "moves_events_aggregate_id_idx" ON "moves_events" USING btree ("aggregate_id");--> statement-breakpoint
CREATE INDEX "moves_events_request_id_idx" ON "moves_events" USING btree ("request_id");