DELETE FROM graph_edges
WHERE source_node_id = target_node_id;
--> statement-breakpoint
ALTER TABLE "graph_edges"
ADD CONSTRAINT "graph_edges_no_self_loop_check"
CHECK (source_node_id <> target_node_id);
