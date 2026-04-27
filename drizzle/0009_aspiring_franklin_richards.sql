ALTER TYPE "public"."move_kind" ADD VALUE 'wiki_page_compiled' BEFORE 'source.recorded';--> statement-breakpoint
CREATE TABLE "wiki_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"summary" text NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wiki_pages" ADD CONSTRAINT "wiki_pages_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wiki_pages_session_id_idx" ON "wiki_pages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "wiki_pages_slug_idx" ON "wiki_pages" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "wiki_pages_created_at_idx" ON "wiki_pages" USING btree ("created_at");