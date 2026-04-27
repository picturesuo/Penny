CREATE TYPE "public"."claim_edge_status" AS ENUM('active', 'acknowledged_vulnerability');--> statement-breakpoint
ALTER TYPE "public"."claim_edge_kind" ADD VALUE 'contradicts' BEFORE 'clarifies';--> statement-breakpoint
ALTER TYPE "public"."move_kind" ADD VALUE 'challenge_issued' BEFORE 'source.recorded';--> statement-breakpoint
ALTER TYPE "public"."move_kind" ADD VALUE 'user_defended' BEFORE 'source.recorded';--> statement-breakpoint
ALTER TYPE "public"."move_kind" ADD VALUE 'claim_revised' BEFORE 'source.recorded';--> statement-breakpoint
ALTER TYPE "public"."move_kind" ADD VALUE 'critique_absorbed' BEFORE 'source.recorded';--> statement-breakpoint
ALTER TABLE "claim_edges" ADD COLUMN "status" "claim_edge_status" DEFAULT 'active' NOT NULL;