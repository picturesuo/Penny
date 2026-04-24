DELETE FROM graph_edges
WHERE NOT EXISTS (
  SELECT 1
  FROM graph_nodes
  WHERE graph_nodes.id = graph_edges.source_node_id
)
OR NOT EXISTS (
  SELECT 1
  FROM graph_nodes
  WHERE graph_nodes.id = graph_edges.target_node_id
);
--> statement-breakpoint
ALTER TABLE "graph_edges"
ADD CONSTRAINT "graph_edges_source_node_id_graph_nodes_id_fk"
FOREIGN KEY ("source_node_id")
REFERENCES "public"."graph_nodes"("id")
ON DELETE CASCADE
ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "graph_edges"
ADD CONSTRAINT "graph_edges_target_node_id_graph_nodes_id_fk"
FOREIGN KEY ("target_node_id")
REFERENCES "public"."graph_nodes"("id")
ON DELETE CASCADE
ON UPDATE NO ACTION;
