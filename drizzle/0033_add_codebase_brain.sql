CREATE TABLE "codebase_scan_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"repo_root" text NOT NULL,
	"git_commit" text,
	"status" text DEFAULT 'running' NOT NULL,
	"file_count" integer DEFAULT 0 NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"symbol_count" integer DEFAULT 0 NOT NULL,
	"import_count" integer DEFAULT 0 NOT NULL,
	"route_count" integer DEFAULT 0 NOT NULL,
	"test_count" integer DEFAULT 0 NOT NULL,
	"doc_count" integer DEFAULT 0 NOT NULL,
	"finding_count" integer DEFAULT 0 NOT NULL,
	"memory_note_count" integer DEFAULT 0 NOT NULL,
	"changed_file_count" integer DEFAULT 0 NOT NULL,
	"stale_file_count" integer DEFAULT 0 NOT NULL,
	"excluded_count" integer DEFAULT 0 NOT NULL,
	"error" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "codebase_scan_runs_repo_root_present" CHECK (length(trim("codebase_scan_runs"."repo_root")) > 0),
	CONSTRAINT "codebase_scan_runs_status_valid" CHECK ("codebase_scan_runs"."status" IN ('running', 'completed', 'failed')),
	CONSTRAINT "codebase_scan_runs_file_count_nonnegative" CHECK ("codebase_scan_runs"."file_count" >= 0),
	CONSTRAINT "codebase_scan_runs_chunk_count_nonnegative" CHECK ("codebase_scan_runs"."chunk_count" >= 0),
	CONSTRAINT "codebase_scan_runs_symbol_count_nonnegative" CHECK ("codebase_scan_runs"."symbol_count" >= 0),
	CONSTRAINT "codebase_scan_runs_changed_count_nonnegative" CHECK ("codebase_scan_runs"."changed_file_count" >= 0),
	CONSTRAINT "codebase_scan_runs_stale_count_nonnegative" CHECK ("codebase_scan_runs"."stale_file_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "code_files" (
	"id" text PRIMARY KEY NOT NULL,
	"scan_run_id" text NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"path" text NOT NULL,
	"hash" text NOT NULL,
	"previous_hash" text,
	"size" integer NOT NULL,
	"language" text NOT NULL,
	"source_kind" text NOT NULL,
	"line_count" integer NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"symbol_count" integer DEFAULT 0 NOT NULL,
	"import_count" integer DEFAULT 0 NOT NULL,
	"route_count" integer DEFAULT 0 NOT NULL,
	"test_count" integer DEFAULT 0 NOT NULL,
	"doc_count" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_modified_at" timestamp with time zone,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "code_files_path_present" CHECK (length(trim("code_files"."path")) > 0),
	CONSTRAINT "code_files_hash_present" CHECK (length(trim("code_files"."hash")) > 0),
	CONSTRAINT "code_files_size_nonnegative" CHECK ("code_files"."size" >= 0),
	CONSTRAINT "code_files_line_count_nonnegative" CHECK ("code_files"."line_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "code_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"file_id" text NOT NULL,
	"scan_run_id" text NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"path" text NOT NULL,
	"hash" text NOT NULL,
	"file_hash" text NOT NULL,
	"size" integer NOT NULL,
	"language" text NOT NULL,
	"source_kind" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"chunk_kind" text NOT NULL,
	"title" text NOT NULL,
	"text" text NOT NULL,
	"char_start" integer NOT NULL,
	"char_end" integer NOT NULL,
	"line_start" integer NOT NULL,
	"line_end" integer NOT NULL,
	"token_estimate" integer NOT NULL,
	"symbol_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "code_chunks_path_present" CHECK (length(trim("code_chunks"."path")) > 0),
	CONSTRAINT "code_chunks_hash_present" CHECK (length(trim("code_chunks"."hash")) > 0),
	CONSTRAINT "code_chunks_title_present" CHECK (length(trim("code_chunks"."title")) > 0),
	CONSTRAINT "code_chunks_text_present" CHECK (length(trim("code_chunks"."text")) > 0),
	CONSTRAINT "code_chunks_index_nonnegative" CHECK ("code_chunks"."chunk_index" >= 0),
	CONSTRAINT "code_chunks_size_nonnegative" CHECK ("code_chunks"."size" >= 0),
	CONSTRAINT "code_chunks_end_after_start" CHECK ("code_chunks"."char_end" >= "code_chunks"."char_start"),
	CONSTRAINT "code_chunks_line_end_after_start" CHECK ("code_chunks"."line_end" >= "code_chunks"."line_start"),
	CONSTRAINT "code_chunks_token_positive" CHECK ("code_chunks"."token_estimate" > 0)
);
--> statement-breakpoint
CREATE TABLE "code_symbols" (
	"id" text PRIMARY KEY NOT NULL,
	"file_id" text NOT NULL,
	"chunk_id" text,
	"scan_run_id" text NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"path" text NOT NULL,
	"hash" text NOT NULL,
	"size" integer NOT NULL,
	"language" text NOT NULL,
	"source_kind" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"exported" boolean DEFAULT false NOT NULL,
	"signature" text,
	"line_start" integer NOT NULL,
	"line_end" integer NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "code_symbols_path_present" CHECK (length(trim("code_symbols"."path")) > 0),
	CONSTRAINT "code_symbols_hash_present" CHECK (length(trim("code_symbols"."hash")) > 0),
	CONSTRAINT "code_symbols_name_present" CHECK (length(trim("code_symbols"."name")) > 0),
	CONSTRAINT "code_symbols_kind_present" CHECK (length(trim("code_symbols"."kind")) > 0),
	CONSTRAINT "code_symbols_size_nonnegative" CHECK ("code_symbols"."size" >= 0)
);
--> statement-breakpoint
CREATE TABLE "code_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"file_id" text NOT NULL,
	"scan_run_id" text NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"path" text NOT NULL,
	"hash" text NOT NULL,
	"size" integer NOT NULL,
	"language" text NOT NULL,
	"source_kind" text NOT NULL,
	"import_source" text NOT NULL,
	"imported_path" text,
	"specifiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"import_kind" text DEFAULT 'static' NOT NULL,
	"line_start" integer NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "code_imports_path_present" CHECK (length(trim("code_imports"."path")) > 0),
	CONSTRAINT "code_imports_hash_present" CHECK (length(trim("code_imports"."hash")) > 0),
	CONSTRAINT "code_imports_source_present" CHECK (length(trim("code_imports"."import_source")) > 0),
	CONSTRAINT "code_imports_size_nonnegative" CHECK ("code_imports"."size" >= 0)
);
--> statement-breakpoint
CREATE TABLE "code_routes" (
	"id" text PRIMARY KEY NOT NULL,
	"file_id" text NOT NULL,
	"chunk_id" text,
	"scan_run_id" text NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"path" text NOT NULL,
	"hash" text NOT NULL,
	"size" integer NOT NULL,
	"language" text NOT NULL,
	"source_kind" text NOT NULL,
	"method" text NOT NULL,
	"route_path" text NOT NULL,
	"handler" text,
	"line_start" integer NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "code_routes_path_present" CHECK (length(trim("code_routes"."path")) > 0),
	CONSTRAINT "code_routes_hash_present" CHECK (length(trim("code_routes"."hash")) > 0),
	CONSTRAINT "code_routes_route_present" CHECK (length(trim("code_routes"."route_path")) > 0),
	CONSTRAINT "code_routes_method_present" CHECK (length(trim("code_routes"."method")) > 0),
	CONSTRAINT "code_routes_size_nonnegative" CHECK ("code_routes"."size" >= 0)
);
--> statement-breakpoint
CREATE TABLE "code_tests" (
	"id" text PRIMARY KEY NOT NULL,
	"file_id" text NOT NULL,
	"chunk_id" text,
	"scan_run_id" text NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"path" text NOT NULL,
	"hash" text NOT NULL,
	"size" integer NOT NULL,
	"language" text NOT NULL,
	"source_kind" text NOT NULL,
	"name" text NOT NULL,
	"test_kind" text DEFAULT 'node_test' NOT NULL,
	"subject_path" text,
	"line_start" integer NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "code_tests_path_present" CHECK (length(trim("code_tests"."path")) > 0),
	CONSTRAINT "code_tests_hash_present" CHECK (length(trim("code_tests"."hash")) > 0),
	CONSTRAINT "code_tests_name_present" CHECK (length(trim("code_tests"."name")) > 0),
	CONSTRAINT "code_tests_size_nonnegative" CHECK ("code_tests"."size" >= 0)
);
--> statement-breakpoint
CREATE TABLE "code_docs" (
	"id" text PRIMARY KEY NOT NULL,
	"file_id" text NOT NULL,
	"chunk_id" text,
	"scan_run_id" text NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"path" text NOT NULL,
	"hash" text NOT NULL,
	"size" integer NOT NULL,
	"language" text NOT NULL,
	"source_kind" text NOT NULL,
	"title" text NOT NULL,
	"section" text,
	"references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"line_start" integer NOT NULL,
	"line_end" integer NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "code_docs_path_present" CHECK (length(trim("code_docs"."path")) > 0),
	CONSTRAINT "code_docs_hash_present" CHECK (length(trim("code_docs"."hash")) > 0),
	CONSTRAINT "code_docs_title_present" CHECK (length(trim("code_docs"."title")) > 0),
	CONSTRAINT "code_docs_size_nonnegative" CHECK ("code_docs"."size" >= 0),
	CONSTRAINT "code_docs_line_end_after_start" CHECK ("code_docs"."line_end" >= "code_docs"."line_start")
);
--> statement-breakpoint
CREATE TABLE "code_findings" (
	"id" text PRIMARY KEY NOT NULL,
	"scan_run_id" text NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"path" text,
	"hash" text,
	"size" integer DEFAULT 0 NOT NULL,
	"language" text DEFAULT 'unknown' NOT NULL,
	"source_kind" text DEFAULT 'unknown' NOT NULL,
	"severity" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "code_findings_severity_valid" CHECK ("code_findings"."severity" IN ('info', 'warning', 'error')),
	CONSTRAINT "code_findings_kind_present" CHECK (length(trim("code_findings"."kind")) > 0),
	CONSTRAINT "code_findings_title_present" CHECK (length(trim("code_findings"."title")) > 0),
	CONSTRAINT "code_findings_message_present" CHECK (length(trim("code_findings"."message")) > 0)
);
--> statement-breakpoint
CREATE TABLE "code_memory_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"file_id" text,
	"chunk_id" text,
	"scan_run_id" text NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"sphere_id" text,
	"path" text NOT NULL,
	"hash" text NOT NULL,
	"size" integer NOT NULL,
	"language" text NOT NULL,
	"source_kind" text NOT NULL,
	"title" text NOT NULL,
	"note_kind" text DEFAULT 'memory' NOT NULL,
	"text" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "code_memory_notes_path_present" CHECK (length(trim("code_memory_notes"."path")) > 0),
	CONSTRAINT "code_memory_notes_hash_present" CHECK (length(trim("code_memory_notes"."hash")) > 0),
	CONSTRAINT "code_memory_notes_title_present" CHECK (length(trim("code_memory_notes"."title")) > 0),
	CONSTRAINT "code_memory_notes_text_present" CHECK (length(trim("code_memory_notes"."text")) > 0),
	CONSTRAINT "code_memory_notes_size_nonnegative" CHECK ("code_memory_notes"."size" >= 0)
);
--> statement-breakpoint
ALTER TABLE "code_files" ADD CONSTRAINT "code_files_scan_run_id_codebase_scan_runs_id_fk" FOREIGN KEY ("scan_run_id") REFERENCES "public"."codebase_scan_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "code_chunks" ADD CONSTRAINT "code_chunks_file_id_code_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."code_files"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "code_chunks" ADD CONSTRAINT "code_chunks_scan_run_id_codebase_scan_runs_id_fk" FOREIGN KEY ("scan_run_id") REFERENCES "public"."codebase_scan_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "code_symbols" ADD CONSTRAINT "code_symbols_file_id_code_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."code_files"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "code_symbols" ADD CONSTRAINT "code_symbols_chunk_id_code_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."code_chunks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "code_symbols" ADD CONSTRAINT "code_symbols_scan_run_id_codebase_scan_runs_id_fk" FOREIGN KEY ("scan_run_id") REFERENCES "public"."codebase_scan_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "code_imports" ADD CONSTRAINT "code_imports_file_id_code_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."code_files"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "code_imports" ADD CONSTRAINT "code_imports_scan_run_id_codebase_scan_runs_id_fk" FOREIGN KEY ("scan_run_id") REFERENCES "public"."codebase_scan_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "code_routes" ADD CONSTRAINT "code_routes_file_id_code_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."code_files"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "code_routes" ADD CONSTRAINT "code_routes_chunk_id_code_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."code_chunks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "code_routes" ADD CONSTRAINT "code_routes_scan_run_id_codebase_scan_runs_id_fk" FOREIGN KEY ("scan_run_id") REFERENCES "public"."codebase_scan_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "code_tests" ADD CONSTRAINT "code_tests_file_id_code_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."code_files"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "code_tests" ADD CONSTRAINT "code_tests_chunk_id_code_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."code_chunks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "code_tests" ADD CONSTRAINT "code_tests_scan_run_id_codebase_scan_runs_id_fk" FOREIGN KEY ("scan_run_id") REFERENCES "public"."codebase_scan_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "code_docs" ADD CONSTRAINT "code_docs_file_id_code_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."code_files"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "code_docs" ADD CONSTRAINT "code_docs_chunk_id_code_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."code_chunks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "code_docs" ADD CONSTRAINT "code_docs_scan_run_id_codebase_scan_runs_id_fk" FOREIGN KEY ("scan_run_id") REFERENCES "public"."codebase_scan_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "code_findings" ADD CONSTRAINT "code_findings_scan_run_id_codebase_scan_runs_id_fk" FOREIGN KEY ("scan_run_id") REFERENCES "public"."codebase_scan_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "code_memory_notes" ADD CONSTRAINT "code_memory_notes_file_id_code_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."code_files"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "code_memory_notes" ADD CONSTRAINT "code_memory_notes_chunk_id_code_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."code_chunks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "code_memory_notes" ADD CONSTRAINT "code_memory_notes_scan_run_id_codebase_scan_runs_id_fk" FOREIGN KEY ("scan_run_id") REFERENCES "public"."codebase_scan_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "codebase_scan_runs_scope_idx" ON "codebase_scan_runs" USING btree ("user_id","workspace_id","project_id","sphere_id");
--> statement-breakpoint
CREATE INDEX "codebase_scan_runs_status_idx" ON "codebase_scan_runs" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "codebase_scan_runs_started_at_idx" ON "codebase_scan_runs" USING btree ("started_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "code_files_scope_path_idx" ON "code_files" USING btree ("id","path");
--> statement-breakpoint
CREATE INDEX "code_files_scan_run_idx" ON "code_files" USING btree ("scan_run_id");
--> statement-breakpoint
CREATE INDEX "code_files_scope_idx" ON "code_files" USING btree ("user_id","workspace_id","project_id","sphere_id");
--> statement-breakpoint
CREATE INDEX "code_files_path_idx" ON "code_files" USING btree ("path");
--> statement-breakpoint
CREATE INDEX "code_files_hash_idx" ON "code_files" USING btree ("hash");
--> statement-breakpoint
CREATE INDEX "code_files_source_kind_idx" ON "code_files" USING btree ("source_kind");
--> statement-breakpoint
CREATE INDEX "code_files_language_idx" ON "code_files" USING btree ("language");
--> statement-breakpoint
CREATE INDEX "code_files_indexed_at_idx" ON "code_files" USING btree ("indexed_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "code_chunks_file_index_idx" ON "code_chunks" USING btree ("file_id","chunk_index");
--> statement-breakpoint
CREATE INDEX "code_chunks_scan_run_idx" ON "code_chunks" USING btree ("scan_run_id");
--> statement-breakpoint
CREATE INDEX "code_chunks_scope_idx" ON "code_chunks" USING btree ("user_id","workspace_id","project_id","sphere_id");
--> statement-breakpoint
CREATE INDEX "code_chunks_path_idx" ON "code_chunks" USING btree ("path");
--> statement-breakpoint
CREATE INDEX "code_chunks_kind_idx" ON "code_chunks" USING btree ("chunk_kind");
--> statement-breakpoint
CREATE INDEX "code_chunks_hash_idx" ON "code_chunks" USING btree ("hash");
--> statement-breakpoint
CREATE INDEX "code_symbols_scan_run_idx" ON "code_symbols" USING btree ("scan_run_id");
--> statement-breakpoint
CREATE INDEX "code_symbols_scope_idx" ON "code_symbols" USING btree ("user_id","workspace_id","project_id","sphere_id");
--> statement-breakpoint
CREATE INDEX "code_symbols_file_idx" ON "code_symbols" USING btree ("file_id");
--> statement-breakpoint
CREATE INDEX "code_symbols_name_idx" ON "code_symbols" USING btree ("name");
--> statement-breakpoint
CREATE INDEX "code_symbols_kind_idx" ON "code_symbols" USING btree ("kind");
--> statement-breakpoint
CREATE INDEX "code_imports_scan_run_idx" ON "code_imports" USING btree ("scan_run_id");
--> statement-breakpoint
CREATE INDEX "code_imports_scope_idx" ON "code_imports" USING btree ("user_id","workspace_id","project_id","sphere_id");
--> statement-breakpoint
CREATE INDEX "code_imports_file_idx" ON "code_imports" USING btree ("file_id");
--> statement-breakpoint
CREATE INDEX "code_imports_source_idx" ON "code_imports" USING btree ("import_source");
--> statement-breakpoint
CREATE INDEX "code_imports_imported_path_idx" ON "code_imports" USING btree ("imported_path");
--> statement-breakpoint
CREATE INDEX "code_routes_scan_run_idx" ON "code_routes" USING btree ("scan_run_id");
--> statement-breakpoint
CREATE INDEX "code_routes_scope_idx" ON "code_routes" USING btree ("user_id","workspace_id","project_id","sphere_id");
--> statement-breakpoint
CREATE INDEX "code_routes_file_idx" ON "code_routes" USING btree ("file_id");
--> statement-breakpoint
CREATE INDEX "code_routes_path_idx" ON "code_routes" USING btree ("route_path");
--> statement-breakpoint
CREATE INDEX "code_routes_method_idx" ON "code_routes" USING btree ("method");
--> statement-breakpoint
CREATE INDEX "code_tests_scan_run_idx" ON "code_tests" USING btree ("scan_run_id");
--> statement-breakpoint
CREATE INDEX "code_tests_scope_idx" ON "code_tests" USING btree ("user_id","workspace_id","project_id","sphere_id");
--> statement-breakpoint
CREATE INDEX "code_tests_file_idx" ON "code_tests" USING btree ("file_id");
--> statement-breakpoint
CREATE INDEX "code_tests_subject_path_idx" ON "code_tests" USING btree ("subject_path");
--> statement-breakpoint
CREATE INDEX "code_docs_scan_run_idx" ON "code_docs" USING btree ("scan_run_id");
--> statement-breakpoint
CREATE INDEX "code_docs_scope_idx" ON "code_docs" USING btree ("user_id","workspace_id","project_id","sphere_id");
--> statement-breakpoint
CREATE INDEX "code_docs_file_idx" ON "code_docs" USING btree ("file_id");
--> statement-breakpoint
CREATE INDEX "code_docs_path_idx" ON "code_docs" USING btree ("path");
--> statement-breakpoint
CREATE INDEX "code_findings_scan_run_idx" ON "code_findings" USING btree ("scan_run_id");
--> statement-breakpoint
CREATE INDEX "code_findings_scope_idx" ON "code_findings" USING btree ("user_id","workspace_id","project_id","sphere_id");
--> statement-breakpoint
CREATE INDEX "code_findings_severity_idx" ON "code_findings" USING btree ("severity");
--> statement-breakpoint
CREATE INDEX "code_findings_path_idx" ON "code_findings" USING btree ("path");
--> statement-breakpoint
CREATE INDEX "code_memory_notes_scan_run_idx" ON "code_memory_notes" USING btree ("scan_run_id");
--> statement-breakpoint
CREATE INDEX "code_memory_notes_scope_idx" ON "code_memory_notes" USING btree ("user_id","workspace_id","project_id","sphere_id");
--> statement-breakpoint
CREATE INDEX "code_memory_notes_path_idx" ON "code_memory_notes" USING btree ("path");
--> statement-breakpoint
CREATE INDEX "code_memory_notes_hash_idx" ON "code_memory_notes" USING btree ("hash");
