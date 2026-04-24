import type { GraphCluster } from "../../lib/types/graph";
import type { PositionedGraphNode } from "./graph-layout";
import { graphClusterColors } from "./graph-style";

type ClusterLabelProps = {
  cluster: GraphCluster;
  nodes: PositionedGraphNode[];
};

function labelForCluster(cluster: GraphCluster) {
  return cluster.charAt(0).toUpperCase() + cluster.slice(1);
}

export function ClusterLabel({ cluster, nodes }: ClusterLabelProps) {
  const clusterNodes = nodes.filter((node) => node.cluster === cluster);

  if (clusterNodes.length < 2) {
    return null;
  }

  const x = clusterNodes.reduce((sum, node) => sum + node.x, 0) / clusterNodes.length;
  const y = Math.min(...clusterNodes.map((node) => node.y)) - 54;
  const palette = graphClusterColors[cluster];

  return (
    <g transform={`translate(${x} ${y})`} aria-hidden="true">
      <rect x={-44} y={-13} width={88} height={26} rx={6} fill={palette.fill} stroke={palette.stroke} opacity="0.72" />
      <text x={0} y={4} textAnchor="middle" fill="#17201b" fontSize="11" fontWeight="700">
        {labelForCluster(cluster)}
      </text>
    </g>
  );
}
