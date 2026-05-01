import type { BrainScope } from "./scope.ts";

export const p1CanvasNodeKinds = ["claim", "concept", "question", "artifact", "source", "move"] as const;
export const p1CanvasEdgeKinds = [
  "depends_on",
  "supports",
  "questions",
  "challenges",
  "contradicts",
  "clarifies",
  "teaches",
] as const;
export const p1RetrievalModes = ["learn", "verify"] as const;
export const p1RetrievalMatchKinds = ["claim", "source", "brain_object", "recent", "move", "artifact"] as const;

export type P1CanvasNodeKind = (typeof p1CanvasNodeKinds)[number];
export type P1CanvasEdgeKind = (typeof p1CanvasEdgeKinds)[number];
export type P1RetrievalMode = (typeof p1RetrievalModes)[number];
export type P1RetrievalMatchKind = (typeof p1RetrievalMatchKinds)[number];

export type P1CanvasRef = {
  sessionId: string;
  claimId?: string;
  sourceId?: string;
  moveId?: string;
  artifactId?: string;
};

export type P1CanvasNode = {
  id: string;
  kind: P1CanvasNodeKind;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence?: number;
  status?: "exploratory" | "committed" | "resolved" | "rejected";
  refs: P1CanvasRef;
};

export type P1CanvasEdge = {
  id: string;
  kind: P1CanvasEdgeKind;
  fromNodeId: string;
  toNodeId: string;
  label?: string;
  refs: P1CanvasRef;
};

export type P1CanvasPayload = {
  sourceOfTruth: "brain_graph_projection";
  sessionId: string;
  nodes: P1CanvasNode[];
  edges: P1CanvasEdge[];
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
  selectedNodeId: string | null;
  meta: {
    generatedAt: string;
    graphHash: string;
  };
};

export type P1HybridRetrievalRequest = {
  query: string;
  mode: P1RetrievalMode;
  scope: BrainScope;
  sessionId?: string | null;
  limit?: number;
};

export type P1HybridRetrievalMatch = {
  id: string;
  kind: P1RetrievalMatchKind;
  title: string;
  snippet: string;
  score: number;
  refs: P1CanvasRef;
  retrieval: {
    lexicalScore: number;
    vectorScore: number | null;
    reasonCodes: string[];
  };
};

export type P1HybridRetrievalResult = {
  query: string;
  mode: P1RetrievalMode;
  strategy: "mock" | "lexical" | "hybrid";
  providerName: string;
  matches: P1HybridRetrievalMatch[];
  contextSummary: string;
};

export type P1HybridRetrievalProvider = {
  name: string;
  retrieve(request: P1HybridRetrievalRequest): Promise<P1HybridRetrievalResult>;
};

export function createMockP1HybridRetrievalProvider(
  matches: P1HybridRetrievalMatch[] = [],
): P1HybridRetrievalProvider {
  return {
    name: "p1-hybrid-retrieval-mock",
    async retrieve(request) {
      const limitedMatches = matches.slice(0, normalizedLimit(request.limit));

      return {
        query: request.query,
        mode: request.mode,
        strategy: "mock",
        providerName: "p1-hybrid-retrieval-mock",
        matches: limitedMatches,
        contextSummary: limitedMatches.map((match) => `[${match.kind}] ${match.title}: ${match.snippet}`).join("\n"),
      };
    },
  };
}

export function assertP1CanvasPayload(payload: P1CanvasPayload): P1CanvasPayload {
  const nodeIds = new Set(payload.nodes.map((node) => node.id));

  for (const node of payload.nodes) {
    if (!node.label.trim()) {
      throw new Error(`Canvas node ${node.id} must have a label.`);
    }

    if (node.width <= 0 || node.height <= 0) {
      throw new Error(`Canvas node ${node.id} must have positive dimensions.`);
    }
  }

  for (const edge of payload.edges) {
    if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) {
      throw new Error(`Canvas edge ${edge.id} must connect existing nodes.`);
    }
  }

  if (payload.selectedNodeId && !nodeIds.has(payload.selectedNodeId)) {
    throw new Error("Canvas selectedNodeId must reference an existing node.");
  }

  return payload;
}

function normalizedLimit(limit: number | undefined): number {
  return typeof limit === "number" && Number.isFinite(limit) ? Math.max(1, Math.min(20, Math.round(limit))) : 8;
}
