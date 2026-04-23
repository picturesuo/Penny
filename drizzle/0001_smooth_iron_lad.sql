CREATE TABLE "challenge_critique_job_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"map_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"status" varchar(32) DEFAULT 'queued' NOT NULL,
	"provider" varchar(64),
	"model" varchar(160),
	"prompt_version" varchar(64),
	"error_message" text,
	"validation_issues" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_critique_job_attempts_status_check" CHECK ("challenge_critique_job_attempts"."status" in ('queued', 'running', 'succeeded', 'failed', 'validation_failed'))
);
--> statement-breakpoint
ALTER TABLE "challenge_critique_job_attempts" ADD CONSTRAINT "challenge_critique_job_attempts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "challenge_critique_job_attempts" ADD CONSTRAINT "challenge_critique_job_attempts_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "challenge_critique_job_attempts" ADD CONSTRAINT "challenge_critique_job_attempts_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "challenge_critique_job_attempts" ADD CONSTRAINT "challenge_critique_job_attempts_round_id_challenge_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."challenge_rounds"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_critique_job_attempts_round_idempotency_unique" ON "challenge_critique_job_attempts" USING btree ("round_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "challenge_critique_job_attempts_user_idx" ON "challenge_critique_job_attempts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "challenge_critique_job_attempts_map_idx" ON "challenge_critique_job_attempts" USING btree ("map_id");--> statement-breakpoint
CREATE INDEX "challenge_critique_job_attempts_claim_idx" ON "challenge_critique_job_attempts" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "challenge_critique_job_attempts_round_idx" ON "challenge_critique_job_attempts" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "challenge_critique_job_attempts_status_idx" ON "challenge_critique_job_attempts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "challenge_critique_job_attempts_queued_at_idx" ON "challenge_critique_job_attempts" USING btree ("queued_at");
