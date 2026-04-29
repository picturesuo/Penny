CREATE TYPE "public"."brain_run_operation" AS ENUM('brain.seed', 'brain.challenge', 'brain.learn.inline', 'brain.artifact.challenge_brief', 'verify_run');--> statement-breakpoint
CREATE TYPE "public"."brain_run_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
ALTER TABLE "brain_runs" ALTER COLUMN "operation" SET DATA TYPE "public"."brain_run_operation" USING "operation"::"public"."brain_run_operation";--> statement-breakpoint
ALTER TABLE "brain_runs" ALTER COLUMN "status" SET DATA TYPE "public"."brain_run_status" USING "status"::"public"."brain_run_status";