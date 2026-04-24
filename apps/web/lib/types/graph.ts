export type GraphCluster = "map" | "claim" | "challenge" | "critique" | "learn" | "event" | "context";

export type GraphNodeKind =
  | "map"
  | "claim"
  | "round"
  | "critique"
  | "response"
  | "learn"
  | "event"
  | "context";

export type GraphNodeType = "thought" | "claim" | "session" | "map";

export type GraphEdgeType = "supports" | "depends_on" | "contradicts" | "related";

export type GraphNode = {
  id: string;
  label: string;
  kind?: GraphNodeKind;
  cluster?: GraphCluster;
  type?: GraphNodeType;
  description?: string;
  status?: string;
  confidence?: number | null;
  confidenceBps?: number | null;
  activityAt?: string;
  x?: number;
  y?: number;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  type?: GraphEdgeType;
  label?: string;
  status?: string;
  strength?: number;
};

export type GraphModel = {
  id: string;
  title: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId?: string | null;
};

export type GraphViewport = {
  scale: number;
  translateX: number;
  translateY: number;
};
