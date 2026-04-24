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

export type GraphNode = {
  id: string;
  label: string;
  kind: GraphNodeKind;
  cluster: GraphCluster;
  description?: string;
  status?: string;
  confidenceBps?: number | null;
  x?: number;
  y?: number;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
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
