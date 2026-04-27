CREATE TABLE "brain_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"source_id" uuid,
	"operation" text NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"status" text NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "claim_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"source_id" uuid,
	"content" text NOT NULL,
	"status" "claim_status" DEFAULT 'exploratory' NOT NULL,
	"confidence" integer DEFAULT 60 NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claim_versions_confidence_range" CHECK ("claim_versions"."confidence" >= 0 AND "claim_versions"."confidence" <= 100)
);
--> statement-breakpoint
CREATE TABLE "source_spans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"claim_id" uuid,
	"claim_version_id" uuid,
	"start_offset" integer NOT NULL,
	"end_offset" integer NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_spans_start_offset_range" CHECK ("source_spans"."start_offset" >= 0),
	CONSTRAINT "source_spans_end_offset_range" CHECK ("source_spans"."end_offset" >= "source_spans"."start_offset")
);
--> statement-breakpoint
ALTER TABLE "brain_runs" ADD CONSTRAINT "brain_runs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_runs" ADD CONSTRAINT "brain_runs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_versions" ADD CONSTRAINT "claim_versions_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_versions" ADD CONSTRAINT "claim_versions_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_spans" ADD CONSTRAINT "source_spans_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_spans" ADD CONSTRAINT "source_spans_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_spans" ADD CONSTRAINT "source_spans_claim_version_id_claim_versions_id_fk" FOREIGN KEY ("claim_version_id") REFERENCES "public"."claim_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "claim_versions" ("claim_id", "source_id", "content", "status", "confidence", "is_current", "created_at")
SELECT "id", "source_id", "text", "status", "confidence", true, "created_at"
FROM "claims";--> statement-breakpoint
INSERT INTO "source_spans" ("source_id", "claim_id", "claim_version_id", "start_offset", "end_offset", "label")
SELECT
  "sources"."id",
  "claims"."id",
  "claim_versions"."id",
  0,
  char_length("sources"."raw_text"),
  CASE WHEN "claims"."text" = "sources"."raw_text" THEN 'seed_claim' ELSE 'legacy_claim' END
FROM "claim_versions"
INNER JOIN "claims" ON "claims"."id" = "claim_versions"."claim_id"
INNER JOIN "sources" ON "sources"."id" = "claims"."source_id"
WHERE "claim_versions"."is_current" = true;--> statement-breakpoint
CREATE INDEX "brain_runs_session_id_idx" ON "brain_runs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "brain_runs_source_id_idx" ON "brain_runs" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "brain_runs_operation_idx" ON "brain_runs" USING btree ("operation");--> statement-breakpoint
CREATE INDEX "brain_runs_status_idx" ON "brain_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "claim_versions_claim_id_idx" ON "claim_versions" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "claim_versions_source_id_idx" ON "claim_versions" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "claim_versions_current_idx" ON "claim_versions" USING btree ("claim_id","is_current");--> statement-breakpoint
CREATE INDEX "source_spans_source_id_idx" ON "source_spans" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "source_spans_claim_id_idx" ON "source_spans" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "source_spans_claim_version_id_idx" ON "source_spans" USING btree ("claim_version_id");
