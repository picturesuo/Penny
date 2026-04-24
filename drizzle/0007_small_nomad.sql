ALTER TABLE "confidence_ratings" ALTER COLUMN "claim_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_events" ADD COLUMN "map_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_events" ADD COLUMN "thought_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_events" ADD COLUMN "claim_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_events" ADD COLUMN "graph_node_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_events" ADD COLUMN "graph_edge_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_events" ADD COLUMN "confidence_rating_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_events" ADD COLUMN "prompt_version_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_events" ADD COLUMN "ai_job_id" uuid;--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "thought_id" uuid;--> statement-breakpoint
ALTER TABLE "confidence_ratings" ADD COLUMN "thought_id" uuid;--> statement-breakpoint
ALTER TABLE "confidence_ratings" ADD COLUMN "graph_node_id" uuid;--> statement-breakpoint
ALTER TABLE "graph_nodes" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "thoughts" ADD COLUMN "session_id" uuid;--> statement-breakpoint
CREATE INDEX "activity_events_map_id_idx" ON "activity_events" USING btree ("map_id");--> statement-breakpoint
CREATE INDEX "activity_events_thought_id_idx" ON "activity_events" USING btree ("thought_id");--> statement-breakpoint
CREATE INDEX "activity_events_claim_id_idx" ON "activity_events" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "activity_events_graph_node_id_idx" ON "activity_events" USING btree ("graph_node_id");--> statement-breakpoint
CREATE INDEX "activity_events_graph_edge_id_idx" ON "activity_events" USING btree ("graph_edge_id");--> statement-breakpoint
CREATE INDEX "activity_events_confidence_rating_id_idx" ON "activity_events" USING btree ("confidence_rating_id");--> statement-breakpoint
CREATE INDEX "activity_events_prompt_version_id_idx" ON "activity_events" USING btree ("prompt_version_id");--> statement-breakpoint
CREATE INDEX "activity_events_ai_job_id_idx" ON "activity_events" USING btree ("ai_job_id");--> statement-breakpoint
CREATE INDEX "claims_thought_id_idx" ON "claims" USING btree ("thought_id");--> statement-breakpoint
CREATE INDEX "confidence_ratings_thought_id_idx" ON "confidence_ratings" USING btree ("thought_id");--> statement-breakpoint
CREATE INDEX "confidence_ratings_graph_node_id_idx" ON "confidence_ratings" USING btree ("graph_node_id");--> statement-breakpoint
CREATE INDEX "graph_nodes_session_id_idx" ON "graph_nodes" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "thoughts_session_id_idx" ON "thoughts" USING btree ("session_id");