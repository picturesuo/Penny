CREATE TYPE "public"."command_idempotency_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "command_idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"route" text NOT NULL,
	"key" text NOT NULL,
	"scope_hash" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" "command_idempotency_status" DEFAULT 'running' NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "command_idempotency_key_present" CHECK (length(trim("command_idempotency_keys"."key")) > 0),
	CONSTRAINT "command_idempotency_route_present" CHECK (length(trim("command_idempotency_keys"."route")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "command_idempotency_route_scope_key_idx" ON "command_idempotency_keys" USING btree ("route","scope_hash","key");--> statement-breakpoint
CREATE INDEX "command_idempotency_scope_idx" ON "command_idempotency_keys" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "command_idempotency_route_status_idx" ON "command_idempotency_keys" USING btree ("route","status");--> statement-breakpoint
CREATE INDEX "command_idempotency_created_at_idx" ON "command_idempotency_keys" USING btree ("created_at");