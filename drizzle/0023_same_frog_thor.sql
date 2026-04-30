CREATE TABLE "brain_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"session_id" uuid,
	"source_recent_id" uuid,
	"object_type" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"body" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brain_objects_type_present" CHECK (length(trim("brain_objects"."object_type")) > 0),
	CONSTRAINT "brain_objects_title_present" CHECK (length(trim("brain_objects"."title")) > 0)
);
--> statement-breakpoint
CREATE TABLE "brain_recents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"session_id" uuid,
	"kind" text DEFAULT 'raw_idea' NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"body" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brain_recents_kind_present" CHECK (length(trim("brain_recents"."kind")) > 0),
	CONSTRAINT "brain_recents_title_present" CHECK (length(trim("brain_recents"."title")) > 0),
	CONSTRAINT "brain_recents_body_present" CHECK (length(trim("brain_recents"."body")) > 0)
);
--> statement-breakpoint
CREATE TABLE "session_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"session_id" uuid NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brain_objects" ADD CONSTRAINT "brain_objects_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_objects" ADD CONSTRAINT "brain_objects_source_recent_id_brain_recents_id_fk" FOREIGN KEY ("source_recent_id") REFERENCES "public"."brain_recents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_recents" ADD CONSTRAINT "brain_recents_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brain_objects_session_id_idx" ON "brain_objects" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "brain_objects_source_recent_id_idx" ON "brain_objects" USING btree ("source_recent_id");--> statement-breakpoint
CREATE INDEX "brain_objects_scope_idx" ON "brain_objects" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "brain_objects_type_idx" ON "brain_objects" USING btree ("object_type");--> statement-breakpoint
CREATE INDEX "brain_objects_updated_at_idx" ON "brain_objects" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "brain_recents_session_id_idx" ON "brain_recents" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "brain_recents_scope_idx" ON "brain_recents" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "brain_recents_kind_idx" ON "brain_recents" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "brain_recents_updated_at_idx" ON "brain_recents" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "session_notes_session_id_idx" ON "session_notes" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "session_notes_scope_idx" ON "session_notes" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "session_notes_updated_at_idx" ON "session_notes" USING btree ("updated_at");