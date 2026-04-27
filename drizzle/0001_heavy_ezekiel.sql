ALTER TABLE "claim_edges" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
UPDATE "claim_edges" SET "kind" = 'depends_on' WHERE "kind" = 'assumes';--> statement-breakpoint
DROP TYPE "public"."claim_edge_kind";--> statement-breakpoint
CREATE TYPE "public"."claim_edge_kind" AS ENUM('depends_on', 'supports', 'questions', 'challenges', 'clarifies');--> statement-breakpoint
ALTER TABLE "claim_edges" ALTER COLUMN "kind" SET DATA TYPE "public"."claim_edge_kind" USING "kind"::"public"."claim_edge_kind";
