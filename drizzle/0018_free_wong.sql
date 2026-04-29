ALTER TYPE "public"."move_kind" ADD VALUE 'autopilot_suggested' BEFORE 'verify_run';--> statement-breakpoint
ALTER TYPE "public"."move_kind" ADD VALUE 'manual_node_selected' BEFORE 'verify_run';