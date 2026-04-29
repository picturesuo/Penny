ALTER TABLE "claim_versions" ADD COLUMN "valid_from" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "claim_versions" ADD COLUMN "valid_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "claim_versions" ADD COLUMN "superseded_by_version_id" uuid;--> statement-breakpoint
UPDATE "claim_versions" SET "valid_from" = "created_at";--> statement-breakpoint
WITH "next_versions" AS (
	SELECT
		"previous"."id" AS "previous_version_id",
		"next"."id" AS "next_version_id",
		"next"."created_at" AS "next_valid_from"
	FROM "claim_versions" AS "previous"
	JOIN LATERAL (
		SELECT "candidate"."id", "candidate"."created_at"
		FROM "claim_versions" AS "candidate"
		WHERE "candidate"."claim_id" = "previous"."claim_id"
			AND "candidate"."created_at" > "previous"."created_at"
		ORDER BY "candidate"."created_at" ASC, "candidate"."id" ASC
		LIMIT 1
	) AS "next" ON true
	WHERE "previous"."is_current" = false
)
UPDATE "claim_versions"
SET
	"valid_until" = "next_versions"."next_valid_from",
	"superseded_by_version_id" = "next_versions"."next_version_id"
FROM "next_versions"
WHERE "claim_versions"."id" = "next_versions"."previous_version_id";--> statement-breakpoint
ALTER TABLE "claim_versions" ADD CONSTRAINT "claim_versions_superseded_by_version_id_claim_versions_id_fk" FOREIGN KEY ("superseded_by_version_id") REFERENCES "public"."claim_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claim_versions_validity_idx" ON "claim_versions" USING btree ("claim_id","valid_from","valid_until");--> statement-breakpoint
CREATE INDEX "claim_versions_superseded_by_idx" ON "claim_versions" USING btree ("superseded_by_version_id");--> statement-breakpoint
ALTER TABLE "claim_versions" ADD CONSTRAINT "claim_versions_validity_range" CHECK ("claim_versions"."valid_until" IS NULL OR "claim_versions"."valid_until" >= "claim_versions"."valid_from");--> statement-breakpoint
ALTER TABLE "claim_versions" ADD CONSTRAINT "claim_versions_current_open_validity" CHECK (("claim_versions"."is_current" = true AND "claim_versions"."valid_until" IS NULL AND "claim_versions"."superseded_by_version_id" IS NULL) OR ("claim_versions"."is_current" = false));
