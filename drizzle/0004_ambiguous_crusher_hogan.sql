CREATE TABLE "challenge_critiques" (
	"id" uuid PRIMARY KEY NOT NULL,
	"round_id" uuid NOT NULL,
	"map_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text NOT NULL,
	"body" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "challenge_critiques_round_id_idx" ON "challenge_critiques" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "challenge_critiques_user_id_idx" ON "challenge_critiques" USING btree ("user_id");