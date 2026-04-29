ALTER TABLE "artifacts" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "sphere_id" text;--> statement-breakpoint
ALTER TABLE "brain_runs" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "brain_runs" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "brain_runs" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "brain_runs" ADD COLUMN "sphere_id" text;--> statement-breakpoint
ALTER TABLE "claim_edges" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "claim_edges" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "claim_edges" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "claim_edges" ADD COLUMN "sphere_id" text;--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "sphere_id" text;--> statement-breakpoint
ALTER TABLE "derived_effects" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "derived_effects" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "derived_effects" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "derived_effects" ADD COLUMN "sphere_id" text;--> statement-breakpoint
ALTER TABLE "moves" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "moves" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "moves" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "moves" ADD COLUMN "sphere_id" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "sphere_id" text;--> statement-breakpoint
ALTER TABLE "shapes" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "shapes" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "shapes" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "shapes" ADD COLUMN "sphere_id" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "sphere_id" text;--> statement-breakpoint
ALTER TABLE "wiki_pages" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "wiki_pages" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "wiki_pages" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "wiki_pages" ADD COLUMN "sphere_id" text;--> statement-breakpoint
CREATE INDEX "artifacts_scope_idx" ON "artifacts" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "brain_runs_scope_idx" ON "brain_runs" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "claim_edges_scope_idx" ON "claim_edges" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "claims_scope_idx" ON "claims" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "derived_effects_scope_idx" ON "derived_effects" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "moves_scope_idx" ON "moves" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "sessions_scope_idx" ON "sessions" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "shapes_scope_idx" ON "shapes" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "sources_scope_idx" ON "sources" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "wiki_pages_scope_idx" ON "wiki_pages" USING btree ("user_id","workspace_id","project_id","sphere_id");