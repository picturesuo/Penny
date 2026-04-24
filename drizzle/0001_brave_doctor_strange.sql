CREATE TYPE "public"."workspace_mode" AS ENUM('brain', 'challenge', 'learn');--> statement-breakpoint
CREATE TABLE "maps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_contexts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"map_id" uuid,
	"claim_id" uuid,
	"mode" "workspace_mode" DEFAULT 'brain' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_contexts_user_id_unique" ON "workspace_contexts" USING btree ("user_id");