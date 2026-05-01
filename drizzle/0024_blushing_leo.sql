CREATE TYPE "public"."brain_embedding_object_type" AS ENUM('brain_object', 'session_note', 'claim_version', 'brain_recent', 'artifact');--> statement-breakpoint
-- TODO(production-vector): this Wave 7 migration is the safe fallback path. If pgvector is available in the target
-- PostgreSQL environment, add a `vector` column and ANN index in a follow-up migration while keeping
-- `embedding_json`/`embedding_text` as replayable provider-safe storage.
CREATE TABLE "brain_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"session_id" uuid,
	"object_type" "brain_embedding_object_type" NOT NULL,
	"object_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"embedding_model" text NOT NULL,
	"embedding_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"embedding_text" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brain_embeddings_title_present" CHECK (length(trim("brain_embeddings"."title")) > 0),
	CONSTRAINT "brain_embeddings_content_present" CHECK (length(trim("brain_embeddings"."content")) > 0),
	CONSTRAINT "brain_embeddings_content_hash_present" CHECK (length(trim("brain_embeddings"."content_hash")) > 0),
	CONSTRAINT "brain_embeddings_embedding_model_present" CHECK (length(trim("brain_embeddings"."embedding_model")) > 0),
	CONSTRAINT "brain_embeddings_embedding_text_present" CHECK (length(trim("brain_embeddings"."embedding_text")) > 0)
);
--> statement-breakpoint
ALTER TABLE "brain_embeddings" ADD CONSTRAINT "brain_embeddings_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brain_embeddings_object_idx" ON "brain_embeddings" USING btree ("object_type","object_id");--> statement-breakpoint
CREATE INDEX "brain_embeddings_session_id_idx" ON "brain_embeddings" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "brain_embeddings_scope_idx" ON "brain_embeddings" USING btree ("user_id","workspace_id","project_id","sphere_id");--> statement-breakpoint
CREATE INDEX "brain_embeddings_type_idx" ON "brain_embeddings" USING btree ("object_type");--> statement-breakpoint
CREATE INDEX "brain_embeddings_model_idx" ON "brain_embeddings" USING btree ("embedding_model");--> statement-breakpoint
CREATE INDEX "brain_embeddings_updated_at_idx" ON "brain_embeddings" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "brain_embeddings_expires_at_idx" ON "brain_embeddings" USING btree ("expires_at");
