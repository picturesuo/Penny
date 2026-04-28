ALTER TABLE "claims" DROP CONSTRAINT "claims_confidence_range";--> statement-breakpoint
ALTER TABLE "claim_versions" ADD COLUMN "brain_run_id" uuid;--> statement-breakpoint
ALTER TABLE "claim_versions" ADD COLUMN "move_id" uuid;--> statement-breakpoint
ALTER TABLE "claim_versions" ADD CONSTRAINT "claim_versions_brain_run_id_brain_runs_id_fk" FOREIGN KEY ("brain_run_id") REFERENCES "public"."brain_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_versions" ADD CONSTRAINT "claim_versions_move_id_moves_id_fk" FOREIGN KEY ("move_id") REFERENCES "public"."moves"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claim_versions_brain_run_id_idx" ON "claim_versions" USING btree ("brain_run_id");--> statement-breakpoint
CREATE INDEX "claim_versions_move_id_idx" ON "claim_versions" USING btree ("move_id");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_versions_one_current_idx" ON "claim_versions" USING btree ("claim_id") WHERE "claim_versions"."is_current" = true;--> statement-breakpoint
ALTER TABLE "claims" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "claims" DROP COLUMN "text";--> statement-breakpoint
ALTER TABLE "claims" DROP COLUMN "confidence";--> statement-breakpoint
ALTER TABLE "claims" DROP COLUMN "updated_at";--> statement-breakpoint
ALTER TABLE "claim_versions" ADD CONSTRAINT "claim_versions_provenance_present" CHECK ("claim_versions"."source_id" IS NOT NULL OR "claim_versions"."brain_run_id" IS NOT NULL OR "claim_versions"."move_id" IS NOT NULL);--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "claims" c
    LEFT JOIN "claim_versions" cv ON cv."claim_id" = c."id" AND cv."is_current" = true
    GROUP BY c."id"
    HAVING count(cv."id") <> 1
  ) THEN
    RAISE EXCEPTION 'Every claim must have exactly one current ClaimVersion before enforcing the invariant.';
  END IF;
END $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "enforce_one_current_claim_version"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_claim_id uuid;
  current_count integer;
BEGIN
  IF TG_TABLE_NAME = 'claims' THEN
    target_claim_id := NEW."id";
  ELSIF TG_OP = 'DELETE' THEN
    target_claim_id := OLD."claim_id";
  ELSE
    target_claim_id := NEW."claim_id";
  END IF;

  IF target_claim_id IS NULL OR NOT EXISTS (SELECT 1 FROM "claims" WHERE "id" = target_claim_id) THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO current_count
  FROM "claim_versions"
  WHERE "claim_id" = target_claim_id AND "is_current" = true;

  IF current_count <> 1 THEN
    RAISE EXCEPTION 'Claim % must have exactly one current ClaimVersion, found %.', target_claim_id, current_count
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END $$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "claims_exactly_one_current_version"
AFTER INSERT OR UPDATE ON "claims"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "enforce_one_current_claim_version"();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "claim_versions_exactly_one_current"
AFTER INSERT OR UPDATE OR DELETE ON "claim_versions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "enforce_one_current_claim_version"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_moves_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Moves are immutable and append-only.'
    USING ERRCODE = '55000';
END $$;--> statement-breakpoint
CREATE TRIGGER "moves_append_only"
BEFORE UPDATE OR DELETE ON "moves"
FOR EACH ROW
EXECUTE FUNCTION "prevent_moves_mutation"();
