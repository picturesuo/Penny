ALTER TYPE "public"."move_kind" ADD VALUE 'seed_claim_created' BEFORE 'source.recorded';--> statement-breakpoint
ALTER TYPE "public"."move_kind" ADD VALUE 'assumptions_extracted' BEFORE 'source.recorded';--> statement-breakpoint
ALTER TYPE "public"."move_kind" ADD VALUE 'first_challenge_suggested' BEFORE 'source.recorded';