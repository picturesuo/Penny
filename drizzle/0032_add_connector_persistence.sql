CREATE TABLE "connector_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"provider_id" text NOT NULL,
	"adapter" text DEFAULT 'nango' NOT NULL,
	"provider_config_key" text NOT NULL,
	"external_connection_id" text NOT NULL,
	"credential_ref" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"surfaces" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_synced_at" timestamp with time zone,
	"next_sync_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"source_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connector_connections_provider_valid" CHECK ("connector_connections"."provider_id" IN ('google')),
	CONSTRAINT "connector_connections_adapter_valid" CHECK ("connector_connections"."adapter" IN ('nango')),
	CONSTRAINT "connector_connections_status_valid" CHECK ("connector_connections"."status" IN ('available', 'connected', 'syncing', 'failed', 'revoked', 'unsupported', 'manual_import_only', 'gated_verification_required', 'extension_required')),
	CONSTRAINT "connector_connections_provider_config_present" CHECK (length(trim("connector_connections"."provider_config_key")) > 0),
	CONSTRAINT "connector_connections_external_present" CHECK (length(trim("connector_connections"."external_connection_id")) > 0)
);
--> statement-breakpoint
CREATE TABLE "connector_sync_cursors" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"connection_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"surface" text NOT NULL,
	"cursor" text,
	"last_synced_at" timestamp with time zone,
	"next_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connector_sync_cursors_provider_valid" CHECK ("connector_sync_cursors"."provider_id" IN ('google')),
	CONSTRAINT "connector_sync_cursors_surface_present" CHECK (length(trim("connector_sync_cursors"."surface")) > 0)
);
--> statement-breakpoint
CREATE TABLE "connector_sync_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"connection_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"surface" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"cursor_before" jsonb,
	"cursor_after" jsonb,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"source_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connector_sync_runs_provider_valid" CHECK ("connector_sync_runs"."provider_id" IN ('google')),
	CONSTRAINT "connector_sync_runs_surface_present" CHECK (length(trim("connector_sync_runs"."surface")) > 0),
	CONSTRAINT "connector_sync_runs_status_valid" CHECK ("connector_sync_runs"."status" IN ('queued', 'running', 'succeeded', 'failed', 'canceled')),
	CONSTRAINT "connector_sync_runs_completion_matches_status" CHECK (("connector_sync_runs"."status" IN ('succeeded', 'failed', 'canceled') AND "connector_sync_runs"."completed_at" IS NOT NULL) OR ("connector_sync_runs"."status" IN ('queued', 'running') AND "connector_sync_runs"."completed_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "connector_source_refs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"connection_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"surface" text NOT NULL,
	"kind" text NOT NULL,
	"source_uri" text NOT NULL,
	"label" text NOT NULL,
	"external_id" text NOT NULL,
	"url" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"privacy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"retrieval_access" text DEFAULT 'enabled' NOT NULL,
	"brain_source_id" text,
	"brain_node_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_synced_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connector_source_refs_provider_valid" CHECK ("connector_source_refs"."provider_id" IN ('google')),
	CONSTRAINT "connector_source_refs_surface_present" CHECK (length(trim("connector_source_refs"."surface")) > 0),
	CONSTRAINT "connector_source_refs_kind_present" CHECK (length(trim("connector_source_refs"."kind")) > 0),
	CONSTRAINT "connector_source_refs_uri_present" CHECK (length(trim("connector_source_refs"."source_uri")) > 0),
	CONSTRAINT "connector_source_refs_label_present" CHECK (length(trim("connector_source_refs"."label")) > 0),
	CONSTRAINT "connector_source_refs_external_present" CHECK (length(trim("connector_source_refs"."external_id")) > 0),
	CONSTRAINT "connector_source_refs_retrieval_valid" CHECK ("connector_source_refs"."retrieval_access" IN ('enabled', 'revoked', 'deleted'))
);
--> statement-breakpoint
CREATE TABLE "connector_permission_audits" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"provider_id" text NOT NULL,
	"connection_id" text,
	"source_ref_id" text,
	"actor_user_id" text,
	"event" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connector_permission_audits_provider_valid" CHECK ("connector_permission_audits"."provider_id" IN ('google')),
	CONSTRAINT "connector_permission_audits_event_present" CHECK (length(trim("connector_permission_audits"."event")) > 0)
);
--> statement-breakpoint
ALTER TABLE "connector_sync_cursors" ADD CONSTRAINT "connector_sync_cursors_connection_id_connector_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connector_connections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "connector_sync_runs" ADD CONSTRAINT "connector_sync_runs_connection_id_connector_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connector_connections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "connector_source_refs" ADD CONSTRAINT "connector_source_refs_connection_id_connector_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connector_connections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "connector_source_refs" ADD CONSTRAINT "connector_source_refs_brain_source_id_brain_memory_sources_id_fk" FOREIGN KEY ("brain_source_id") REFERENCES "public"."brain_memory_sources"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "connector_permission_audits" ADD CONSTRAINT "connector_permission_audits_connection_id_connector_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connector_connections"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "connector_permission_audits" ADD CONSTRAINT "connector_permission_audits_source_ref_id_connector_source_refs_id_fk" FOREIGN KEY ("source_ref_id") REFERENCES "public"."connector_source_refs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "connector_connections_provider_external_scope_idx" ON "connector_connections" USING btree ("provider_id","external_connection_id","user_id","workspace_id");
--> statement-breakpoint
CREATE INDEX "connector_connections_scope_idx" ON "connector_connections" USING btree ("user_id","workspace_id","project_id","sphere_id");
--> statement-breakpoint
CREATE INDEX "connector_connections_provider_status_idx" ON "connector_connections" USING btree ("provider_id","status");
--> statement-breakpoint
CREATE INDEX "connector_connections_external_idx" ON "connector_connections" USING btree ("external_connection_id");
--> statement-breakpoint
CREATE INDEX "connector_connections_next_sync_idx" ON "connector_connections" USING btree ("next_sync_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "connector_sync_cursors_connection_surface_idx" ON "connector_sync_cursors" USING btree ("connection_id","surface");
--> statement-breakpoint
CREATE INDEX "connector_sync_cursors_scope_idx" ON "connector_sync_cursors" USING btree ("user_id","workspace_id","project_id","sphere_id");
--> statement-breakpoint
CREATE INDEX "connector_sync_cursors_provider_surface_idx" ON "connector_sync_cursors" USING btree ("provider_id","surface");
--> statement-breakpoint
CREATE INDEX "connector_sync_cursors_next_sync_idx" ON "connector_sync_cursors" USING btree ("next_sync_at");
--> statement-breakpoint
CREATE INDEX "connector_sync_runs_connection_idx" ON "connector_sync_runs" USING btree ("connection_id");
--> statement-breakpoint
CREATE INDEX "connector_sync_runs_scope_idx" ON "connector_sync_runs" USING btree ("user_id","workspace_id","project_id","sphere_id");
--> statement-breakpoint
CREATE INDEX "connector_sync_runs_provider_status_idx" ON "connector_sync_runs" USING btree ("provider_id","status");
--> statement-breakpoint
CREATE INDEX "connector_sync_runs_requested_at_idx" ON "connector_sync_runs" USING btree ("requested_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "connector_source_refs_connection_uri_idx" ON "connector_source_refs" USING btree ("connection_id","source_uri");
--> statement-breakpoint
CREATE INDEX "connector_source_refs_scope_idx" ON "connector_source_refs" USING btree ("user_id","workspace_id","project_id","sphere_id");
--> statement-breakpoint
CREATE INDEX "connector_source_refs_connection_idx" ON "connector_source_refs" USING btree ("connection_id");
--> statement-breakpoint
CREATE INDEX "connector_source_refs_provider_surface_idx" ON "connector_source_refs" USING btree ("provider_id","surface");
--> statement-breakpoint
CREATE INDEX "connector_source_refs_brain_source_idx" ON "connector_source_refs" USING btree ("brain_source_id");
--> statement-breakpoint
CREATE INDEX "connector_source_refs_retrieval_idx" ON "connector_source_refs" USING btree ("retrieval_access");
--> statement-breakpoint
CREATE INDEX "connector_permission_audits_scope_idx" ON "connector_permission_audits" USING btree ("user_id","workspace_id","project_id","sphere_id");
--> statement-breakpoint
CREATE INDEX "connector_permission_audits_connection_idx" ON "connector_permission_audits" USING btree ("connection_id");
--> statement-breakpoint
CREATE INDEX "connector_permission_audits_source_ref_idx" ON "connector_permission_audits" USING btree ("source_ref_id");
--> statement-breakpoint
CREATE INDEX "connector_permission_audits_event_idx" ON "connector_permission_audits" USING btree ("event");
--> statement-breakpoint
CREATE INDEX "connector_permission_audits_created_at_idx" ON "connector_permission_audits" USING btree ("created_at");
