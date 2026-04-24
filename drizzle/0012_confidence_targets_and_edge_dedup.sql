DELETE FROM confidence_ratings
WHERE (
  (thought_id IS NOT NULL)::integer +
  (claim_id IS NOT NULL)::integer +
  (graph_node_id IS NOT NULL)::integer
) <> 1
OR (
  thought_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM thoughts
    WHERE thoughts.id = confidence_ratings.thought_id
  )
)
OR (
  claim_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM claims
    WHERE claims.id = confidence_ratings.claim_id
  )
)
OR (
  graph_node_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM graph_nodes
    WHERE graph_nodes.id = confidence_ratings.graph_node_id
  )
);
--> statement-breakpoint
WITH ranked_edges AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, source_node_id, target_node_id, kind
      ORDER BY created_at, id
    ) AS duplicate_rank
  FROM graph_edges
)
DELETE FROM graph_edges
USING ranked_edges
WHERE graph_edges.id = ranked_edges.id
  AND ranked_edges.duplicate_rank > 1;
--> statement-breakpoint
ALTER TABLE "confidence_ratings"
ADD CONSTRAINT "confidence_ratings_one_target_check"
CHECK (
  (
    (thought_id IS NOT NULL)::integer +
    (claim_id IS NOT NULL)::integer +
    (graph_node_id IS NOT NULL)::integer
  ) = 1
);
--> statement-breakpoint
ALTER TABLE "confidence_ratings"
ADD CONSTRAINT "confidence_ratings_rating_bps_check"
CHECK (rating_bps >= 0 AND rating_bps <= 10000);
--> statement-breakpoint
ALTER TABLE "confidence_ratings"
ADD CONSTRAINT "confidence_ratings_thought_id_thoughts_id_fk"
FOREIGN KEY ("thought_id")
REFERENCES "public"."thoughts"("id")
ON DELETE CASCADE
ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "confidence_ratings"
ADD CONSTRAINT "confidence_ratings_claim_id_claims_id_fk"
FOREIGN KEY ("claim_id")
REFERENCES "public"."claims"("id")
ON DELETE CASCADE
ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "confidence_ratings"
ADD CONSTRAINT "confidence_ratings_graph_node_id_graph_nodes_id_fk"
FOREIGN KEY ("graph_node_id")
REFERENCES "public"."graph_nodes"("id")
ON DELETE CASCADE
ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE UNIQUE INDEX "graph_edges_user_source_target_kind_unique"
ON "graph_edges" USING btree ("user_id", "source_node_id", "target_node_id", "kind");
