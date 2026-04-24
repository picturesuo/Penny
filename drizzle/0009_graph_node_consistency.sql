DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM thoughts
    WHERE map_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot ensure every thought has a graph node while thoughts.map_id is null.';
  END IF;
END $$;
--> statement-breakpoint
INSERT INTO graph_nodes (
  id,
  user_id,
  session_id,
  map_id,
  thought_id,
  kind,
  label,
  metadata_json,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  thoughts.user_id,
  thoughts.session_id,
  thoughts.map_id,
  thoughts.id,
  'thought',
  left(
    coalesce(
      thoughts.metadata_json->>'suggestedTitle',
      thoughts.metadata_json->>'summary',
      thoughts.raw_text
    ),
    240
  ),
  jsonb_build_object(
    'cluster',
    'thought',
    'source',
    'data-consistency-backfill'
  ),
  thoughts.created_at,
  thoughts.updated_at
FROM thoughts
WHERE NOT EXISTS (
  SELECT 1
  FROM graph_nodes
  WHERE graph_nodes.thought_id = thoughts.id
    AND graph_nodes.kind = 'thought'
);
--> statement-breakpoint
INSERT INTO graph_nodes (
  id,
  user_id,
  map_id,
  claim_id,
  thought_id,
  kind,
  label,
  metadata_json,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  claims.user_id,
  claims.map_id,
  claims.id,
  claims.thought_id,
  'claim',
  left(claims.body, 240),
  jsonb_build_object(
    'cluster',
    'claim',
    'confidenceBps',
    claims.confidence_bps,
    'source',
    'data-consistency-backfill'
  ),
  claims.created_at,
  claims.updated_at
FROM claims
WHERE NOT EXISTS (
  SELECT 1
  FROM graph_nodes
  WHERE graph_nodes.claim_id = claims.id
    AND graph_nodes.kind = 'claim'
);
--> statement-breakpoint
CREATE UNIQUE INDEX "graph_nodes_claim_node_unique_idx"
ON "graph_nodes" USING btree ("claim_id")
WHERE "claim_id" IS NOT NULL AND "kind" = 'claim';
--> statement-breakpoint
CREATE UNIQUE INDEX "graph_nodes_thought_node_unique_idx"
ON "graph_nodes" USING btree ("thought_id")
WHERE "thought_id" IS NOT NULL AND "kind" = 'thought';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ensure_thought_graph_node()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.map_id IS NULL THEN
    RAISE EXCEPTION 'Cannot create thought % without map_id; every thought requires a graph node.', NEW.id;
  END IF;

  INSERT INTO graph_nodes (
    user_id,
    session_id,
    map_id,
    thought_id,
    kind,
    label,
    metadata_json,
    created_at,
    updated_at
  )
  VALUES (
    NEW.user_id,
    NEW.session_id,
    NEW.map_id,
    NEW.id,
    'thought',
    left(
      coalesce(
        NEW.metadata_json->>'suggestedTitle',
        NEW.metadata_json->>'summary',
        NEW.raw_text
      ),
      240
    ),
    jsonb_build_object(
      'cluster',
      'thought',
      'source',
      'data-consistency-trigger'
    ),
    NEW.created_at,
    NEW.updated_at
  )
  ON CONFLICT ("thought_id") WHERE "thought_id" IS NOT NULL AND "kind" = 'thought'
  DO NOTHING;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ensure_claim_graph_node()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO graph_nodes (
    user_id,
    map_id,
    claim_id,
    thought_id,
    kind,
    label,
    metadata_json,
    created_at,
    updated_at
  )
  VALUES (
    NEW.user_id,
    NEW.map_id,
    NEW.id,
    NEW.thought_id,
    'claim',
    left(NEW.body, 240),
    jsonb_build_object(
      'cluster',
      'claim',
      'confidenceBps',
      NEW.confidence_bps,
      'source',
      'data-consistency-trigger'
    ),
    NEW.created_at,
    NEW.updated_at
  )
  ON CONFLICT ("claim_id") WHERE "claim_id" IS NOT NULL AND "kind" = 'claim'
  DO NOTHING;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "thoughts_ensure_graph_node"
AFTER INSERT ON "thoughts"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION ensure_thought_graph_node();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "claims_ensure_graph_node"
AFTER INSERT ON "claims"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION ensure_claim_graph_node();
