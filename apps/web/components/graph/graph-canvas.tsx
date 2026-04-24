import type { GraphEdge as GraphEdgeModel, GraphNode as GraphNodeModel, GraphViewport } from "../../lib/types/graph";
import { ClusterLabel } from "./cluster-label";
import { GraphEdge } from "./graph-edge";
import type { PositionedGraphNode } from "./graph-layout";
import { GraphNode } from "./graph-node";
import { graphViewBoxValue } from "./graph-style";

type GraphCanvasProps = {
  nodes: PositionedGraphNode[];
  edges: GraphEdgeModel[];
  nodesById: Map<string, PositionedGraphNode>;
  viewport: GraphViewport;
  selectedNodeId?: string | null;
  onSelectNode?: (node: GraphNodeModel) => void;
};

export function GraphCanvas({ nodes, edges, nodesById, viewport, selectedNodeId, onSelectNode }: GraphCanvasProps) {
  const viewTransform = `translate(${viewport.translateX} ${viewport.translateY}) scale(${viewport.scale})`;
  const clusters = Array.from(new Set(nodes.map((node) => node.cluster)));

  return (
    <svg aria-label="Graph canvas" width="100%" height="100%" viewBox={graphViewBoxValue}>
      <g transform={viewTransform}>
        {clusters.map((cluster) => (
          <ClusterLabel key={cluster} cluster={cluster} nodes={nodes} />
        ))}
        {edges.map((edge) => {
          const source = nodesById.get(edge.source);
          const target = nodesById.get(edge.target);

          if (!source || !target) {
            return null;
          }

          const emphasized = source.id === selectedNodeId || target.id === selectedNodeId;
          return <GraphEdge key={edge.id} edge={edge} source={source} target={target} emphasized={emphasized} />;
        })}
        {nodes.map((node) => (
          <GraphNode
            key={node.id}
            node={node}
            selected={node.id === selectedNodeId}
            onSelectNode={onSelectNode}
          />
        ))}
      </g>
    </svg>
  );
}
