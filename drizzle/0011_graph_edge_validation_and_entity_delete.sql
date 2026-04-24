DELETE FROM graph_edges
WHERE kind NOT IN (
  'supports',
  'depends_on',
  'contradicts',
  'related',
  'relates_to',
  'extracted_claim',
  'extracts',
  'cross_map'
);
--> statement-breakpoint
DELETE FROM graph_nodes
WHERE claim_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM claims
    WHERE claims.id = graph_nodes.claim_id
  );
--> statement-breakpoint
ALTER TABLE "graph_edges"
ADD CONSTRAINT "graph_edges_kind_valid_check"
CHECK (kind IN (
  'supports',
  'depends_on',
  'contradicts',
  'related',
  'relates_to',
  'extracted_claim',
  'extracts',
  'cross_map'
));
--> statement-breakpoint
ALTER TABLE "graph_nodes"
ADD CONSTRAINT "graph_nodes_claim_id_claims_id_fk"
FOREIGN KEY ("claim_id")
REFERENCES "public"."claims"("id")
ON DELETE CASCADE
ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION remove_deleted_thought_graph_refs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE claims
  SET thought_id = NULL
  WHERE thought_id = OLD.id;

  UPDATE graph_nodes
  SET thought_id = NULL,
      updated_at = now()
  WHERE thought_id = OLD.id
    AND kind <> 'thought';

  DELETE FROM graph_nodes
  WHERE thought_id = OLD.id
    AND kind = 'thought';

  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "thoughts_remove_graph_refs"
BEFORE DELETE ON "thoughts"
FOR EACH ROW
EXECUTE FUNCTION remove_deleted_thought_graph_refs();
