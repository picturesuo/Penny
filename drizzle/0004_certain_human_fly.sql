ALTER TYPE "public"."claim_status" ADD VALUE 'rejected';--> statement-breakpoint
ALTER TYPE "public"."move_kind" ADD VALUE 'assumption_confirmed' BEFORE 'source.recorded';--> statement-breakpoint
ALTER TYPE "public"."move_kind" ADD VALUE 'assumption_rejected' BEFORE 'source.recorded';--> statement-breakpoint
ALTER TYPE "public"."move_kind" ADD VALUE 'assumption_refined' BEFORE 'source.recorded';