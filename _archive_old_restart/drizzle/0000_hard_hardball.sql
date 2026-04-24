CREATE TYPE "public"."moves_event_type" AS ENUM('map.created', 'claim.created', 'claim.updated', 'claim.confidence_changed', 'challenge.started', 'challenge.critique_generated', 'challenge.round_responded', 'learning.prompt_generated', 'teachback.submitted', 'concept.created', 'concept.linked', 'workspace.selection_changed');--> statement-breakpoint
CREATE TYPE "public"."workspace_mode" AS ENUM('brain', 'challenge', 'learn');--> statement-breakpoint
CREATE TABLE "challenge_critiques" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"map_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"workspace_context_id" uuid,
	"provider" varchar(64) NOT NULL,
	"model" varchar(160) NOT NULL,
	"prompt_version" varchar(64) DEFAULT 'v1' NOT NULL,
	"headline" varchar(240) NOT NULL,
	"critique_text" text NOT NULL,
	"critique_lens" varchar(128) DEFAULT 'default' NOT NULL,
	"failure_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dependency_risks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"why_now" text NOT NULL,
	"validated_output" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenge_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"map_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"workspace_context_id" uuid,
	"prior_round_id" uuid,
	"round_number" integer NOT NULL,
	"critique_generated" text NOT NULL,
	"critique_failure_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"critique_lens" varchar(128) DEFAULT 'default' NOT NULL,
	"critique_strength" varchar(64) DEFAULT 'moderate' NOT NULL,
	"critique_mode" varchar(64),
	"voice_label" varchar(120),
	"response_path" varchar(32),
	"user_response" text,
	"confidence_at_round_start" integer NOT NULL,
	"confidence_at_round_end" integer,
	"confidence_delta" integer,
	"concessions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"defenses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dismissals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"engagement_score" integer,
	"follow_up_prompt" text,
	"uncertainty" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_rounds_confidence_start_range" CHECK ("challenge_rounds"."confidence_at_round_start" >= 0 AND "challenge_rounds"."confidence_at_round_start" <= 100),
	CONSTRAINT "challenge_rounds_confidence_end_range" CHECK ("challenge_rounds"."confidence_at_round_end" IS NULL OR ("challenge_rounds"."confidence_at_round_end" >= 0 AND "challenge_rounds"."confidence_at_round_end" <= 100))
);
--> statement-breakpoint
CREATE TABLE "claim_concept_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	"relation_type" varchar(64) DEFAULT 'references' NOT NULL,
	"confidence" integer DEFAULT 50 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claim_concept_edges_confidence_range" CHECK ("claim_concept_edges"."confidence" >= 0 AND "claim_concept_edges"."confidence" <= 100)
);
--> statement-breakpoint
CREATE TABLE "claim_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"map_id" uuid NOT NULL,
	"from_claim_id" uuid NOT NULL,
	"to_claim_id" uuid NOT NULL,
	"edge_type" varchar(64) NOT NULL,
	"weight" integer DEFAULT 50 NOT NULL,
	"rationale" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claim_edges_weight_range" CHECK ("claim_edges"."weight" >= 0 AND "claim_edges"."weight" <= 100),
	CONSTRAINT "claim_edges_not_self_referential" CHECK ("claim_edges"."from_claim_id" <> "claim_edges"."to_claim_id")
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"map_id" uuid NOT NULL,
	"parent_claim_id" uuid,
	"text" text NOT NULL,
	"note" text,
	"kind" varchar(64) DEFAULT 'claim' NOT NULL,
	"structure_kind" varchar(64),
	"provenance" varchar(64) DEFAULT 'user' NOT NULL,
	"status" varchar(64) DEFAULT 'open' NOT NULL,
	"confidence" integer DEFAULT 50 NOT NULL,
	"resolution_date" timestamp with time zone,
	"last_challenged_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claims_confidence_range" CHECK ("claims"."confidence" >= 0 AND "claims"."confidence" <= 100)
);
--> statement-breakpoint
CREATE TABLE "concepts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"sphere_id" uuid,
	"name" varchar(160) NOT NULL,
	"slug" varchar(128) NOT NULL,
	"description" text,
	"status" varchar(64) DEFAULT 'active' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"claim_id" uuid,
	"concept_id" uuid,
	"round_id" uuid,
	"workspace_context_id" uuid,
	"prompt_type" varchar(64) NOT NULL,
	"trigger_condition" varchar(128) NOT NULL,
	"prompt_text" text NOT NULL,
	"prompt_version" varchar(64) DEFAULT 'v1' NOT NULL,
	"provider_model" varchar(128),
	"status" varchar(64) DEFAULT 'generated' NOT NULL,
	"prompt_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"user_engaged" boolean DEFAULT false NOT NULL,
	"engaged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"sphere_id" uuid,
	"title" varchar(200) NOT NULL,
	"raw_thought" text NOT NULL,
	"status" varchar(64) DEFAULT 'draft' NOT NULL,
	"claim_count" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moves_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"map_id" uuid NOT NULL,
	"claim_id" uuid,
	"concept_id" uuid,
	"request_id" varchar(160),
	"type" "moves_event_type" NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"display_name" varchar(160),
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spheres" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"slug" varchar(96) NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text,
	"color_token" varchar(64),
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_contexts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"sphere_id" uuid,
	"map_id" uuid,
	"selected_claim_id" uuid,
	"selected_concept_id" uuid,
	"context_key" varchar(160) NOT NULL,
	"mode" "workspace_mode" DEFAULT 'brain' NOT NULL,
	"breadcrumb" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"context_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "challenge_critiques" ADD CONSTRAINT "challenge_critiques_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "challenge_critiques" ADD CONSTRAINT "challenge_critiques_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "challenge_critiques" ADD CONSTRAINT "challenge_critiques_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "challenge_critiques" ADD CONSTRAINT "challenge_critiques_round_id_challenge_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."challenge_rounds"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "challenge_critiques" ADD CONSTRAINT "challenge_critiques_workspace_context_id_workspace_contexts_id_fk" FOREIGN KEY ("workspace_context_id") REFERENCES "public"."workspace_contexts"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "challenge_rounds" ADD CONSTRAINT "challenge_rounds_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "challenge_rounds" ADD CONSTRAINT "challenge_rounds_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "challenge_rounds" ADD CONSTRAINT "challenge_rounds_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "challenge_rounds" ADD CONSTRAINT "challenge_rounds_workspace_context_id_workspace_contexts_id_fk" FOREIGN KEY ("workspace_context_id") REFERENCES "public"."workspace_contexts"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "challenge_rounds" ADD CONSTRAINT "challenge_rounds_prior_round_id_challenge_rounds_id_fk" FOREIGN KEY ("prior_round_id") REFERENCES "public"."challenge_rounds"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "claim_concept_edges" ADD CONSTRAINT "claim_concept_edges_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "claim_concept_edges" ADD CONSTRAINT "claim_concept_edges_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "claim_edges" ADD CONSTRAINT "claim_edges_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "claim_edges" ADD CONSTRAINT "claim_edges_from_claim_id_claims_id_fk" FOREIGN KEY ("from_claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "claim_edges" ADD CONSTRAINT "claim_edges_to_claim_id_claims_id_fk" FOREIGN KEY ("to_claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_parent_claim_id_claims_id_fk" FOREIGN KEY ("parent_claim_id") REFERENCES "public"."claims"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_sphere_id_spheres_id_fk" FOREIGN KEY ("sphere_id") REFERENCES "public"."spheres"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "learning_prompts" ADD CONSTRAINT "learning_prompts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "learning_prompts" ADD CONSTRAINT "learning_prompts_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "learning_prompts" ADD CONSTRAINT "learning_prompts_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "learning_prompts" ADD CONSTRAINT "learning_prompts_round_id_challenge_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."challenge_rounds"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "learning_prompts" ADD CONSTRAINT "learning_prompts_workspace_context_id_workspace_contexts_id_fk" FOREIGN KEY ("workspace_context_id") REFERENCES "public"."workspace_contexts"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "maps" ADD CONSTRAINT "maps_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "maps" ADD CONSTRAINT "maps_sphere_id_spheres_id_fk" FOREIGN KEY ("sphere_id") REFERENCES "public"."spheres"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "moves_events" ADD CONSTRAINT "moves_events_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "moves_events" ADD CONSTRAINT "moves_events_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "moves_events" ADD CONSTRAINT "moves_events_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "moves_events" ADD CONSTRAINT "moves_events_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "spheres" ADD CONSTRAINT "spheres_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "workspace_contexts" ADD CONSTRAINT "workspace_contexts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "workspace_contexts" ADD CONSTRAINT "workspace_contexts_sphere_id_spheres_id_fk" FOREIGN KEY ("sphere_id") REFERENCES "public"."spheres"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "workspace_contexts" ADD CONSTRAINT "workspace_contexts_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "workspace_contexts" ADD CONSTRAINT "workspace_contexts_selected_claim_id_claims_id_fk" FOREIGN KEY ("selected_claim_id") REFERENCES "public"."claims"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "workspace_contexts" ADD CONSTRAINT "workspace_contexts_selected_concept_id_concepts_id_fk" FOREIGN KEY ("selected_concept_id") REFERENCES "public"."concepts"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "challenge_critiques_user_idx" ON "challenge_critiques" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "challenge_critiques_map_idx" ON "challenge_critiques" USING btree ("map_id");--> statement-breakpoint
CREATE INDEX "challenge_critiques_claim_idx" ON "challenge_critiques" USING btree ("claim_id");--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_critiques_round_id_unique" ON "challenge_critiques" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "challenge_critiques_workspace_context_idx" ON "challenge_critiques" USING btree ("workspace_context_id");--> statement-breakpoint
CREATE INDEX "challenge_critiques_created_at_idx" ON "challenge_critiques" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_rounds_claim_round_unique" ON "challenge_rounds" USING btree ("claim_id","round_number");--> statement-breakpoint
CREATE INDEX "challenge_rounds_user_idx" ON "challenge_rounds" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "challenge_rounds_map_idx" ON "challenge_rounds" USING btree ("map_id");--> statement-breakpoint
CREATE INDEX "challenge_rounds_claim_idx" ON "challenge_rounds" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "challenge_rounds_workspace_context_idx" ON "challenge_rounds" USING btree ("workspace_context_id");--> statement-breakpoint
CREATE INDEX "challenge_rounds_created_at_idx" ON "challenge_rounds" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_concept_edges_unique" ON "claim_concept_edges" USING btree ("claim_id","concept_id","relation_type");--> statement-breakpoint
CREATE INDEX "claim_concept_edges_claim_idx" ON "claim_concept_edges" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "claim_concept_edges_concept_idx" ON "claim_concept_edges" USING btree ("concept_id");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_edges_unique" ON "claim_edges" USING btree ("from_claim_id","to_claim_id","edge_type");--> statement-breakpoint
CREATE INDEX "claim_edges_map_idx" ON "claim_edges" USING btree ("map_id");--> statement-breakpoint
CREATE INDEX "claim_edges_from_claim_idx" ON "claim_edges" USING btree ("from_claim_id");--> statement-breakpoint
CREATE INDEX "claim_edges_to_claim_idx" ON "claim_edges" USING btree ("to_claim_id");--> statement-breakpoint
CREATE INDEX "claims_user_idx" ON "claims" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "claims_map_idx" ON "claims" USING btree ("map_id");--> statement-breakpoint
CREATE INDEX "claims_parent_claim_idx" ON "claims" USING btree ("parent_claim_id");--> statement-breakpoint
CREATE INDEX "claims_status_idx" ON "claims" USING btree ("status");--> statement-breakpoint
CREATE INDEX "claims_updated_at_idx" ON "claims" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "concepts_user_slug_unique" ON "concepts" USING btree ("user_id","slug");--> statement-breakpoint
CREATE INDEX "concepts_sphere_idx" ON "concepts" USING btree ("sphere_id");--> statement-breakpoint
CREATE INDEX "concepts_updated_at_idx" ON "concepts" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "learning_prompts_user_idx" ON "learning_prompts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "learning_prompts_claim_idx" ON "learning_prompts" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "learning_prompts_concept_idx" ON "learning_prompts" USING btree ("concept_id");--> statement-breakpoint
CREATE INDEX "learning_prompts_round_idx" ON "learning_prompts" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "learning_prompts_workspace_context_idx" ON "learning_prompts" USING btree ("workspace_context_id");--> statement-breakpoint
CREATE INDEX "learning_prompts_created_at_idx" ON "learning_prompts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "maps_user_idx" ON "maps" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "maps_sphere_idx" ON "maps" USING btree ("sphere_id");--> statement-breakpoint
CREATE INDEX "maps_status_idx" ON "maps" USING btree ("status");--> statement-breakpoint
CREATE INDEX "maps_updated_at_idx" ON "maps" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "moves_events_user_idx" ON "moves_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "moves_events_map_idx" ON "moves_events" USING btree ("map_id");--> statement-breakpoint
CREATE INDEX "moves_events_claim_idx" ON "moves_events" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "moves_events_concept_idx" ON "moves_events" USING btree ("concept_id");--> statement-breakpoint
CREATE INDEX "moves_events_request_id_idx" ON "moves_events" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "moves_events_type_idx" ON "moves_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "moves_events_created_at_idx" ON "moves_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_email_unique" ON "profiles" USING btree ("email");--> statement-breakpoint
CREATE INDEX "profiles_updated_at_idx" ON "profiles" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "spheres_user_slug_unique" ON "spheres" USING btree ("user_id","slug");--> statement-breakpoint
CREATE INDEX "spheres_user_updated_at_idx" ON "spheres" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_contexts_context_key_unique" ON "workspace_contexts" USING btree ("context_key");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_contexts_user_id_unique" ON "workspace_contexts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workspace_contexts_map_idx" ON "workspace_contexts" USING btree ("map_id");--> statement-breakpoint
CREATE INDEX "workspace_contexts_mode_idx" ON "workspace_contexts" USING btree ("mode");--> statement-breakpoint
CREATE INDEX "workspace_contexts_updated_at_idx" ON "workspace_contexts" USING btree ("updated_at");