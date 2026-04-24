import type { GraphEdge, GraphModel, GraphNode } from "../../lib/types/graph";
import type { BrainView, ChallengeView, ClaimView, LearnView, ShellView } from "../../lib/types/workspace";

const CLAIM_RADIUS = 210;

function truncateLabel(value: string, limit = 84) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit - 1).trim()}...`;
}

function claimPoint(index: number, total: number) {
  if (total <= 1) {
    return { x: 0, y: -CLAIM_RADIUS };
  }

  const start = -Math.PI * 0.88;
  const end = Math.PI * 0.88;
  const angle = start + (index / Math.max(total - 1, 1)) * (end - start);

  return {
    x: Math.cos(angle) * CLAIM_RADIUS,
    y: Math.sin(angle) * 155,
  };
}

function claimNode(claim: ClaimView, index: number, total: number, selectedClaimId?: string | null): GraphNode {
  const point = claimPoint(index, total);

  return {
    id: claim.id,
    label: truncateLabel(claim.body),
    kind: "claim",
    cluster: "claim",
    type: "claim",
    confidence: typeof claim.confidenceBps === "number" ? Math.round(claim.confidenceBps / 100) : null,
    confidenceBps: claim.confidenceBps,
    activityAt: claim.updatedAt ?? claim.createdAt,
    status: selectedClaimId === claim.id ? "selected" : undefined,
    x: point.x,
    y: point.y,
  };
}

function mapNode(id: string, title: string, claimCount?: number): GraphNode {
  return {
    id,
    label: title || "Untitled map",
    kind: "map",
    cluster: "map",
    type: "map",
    description: typeof claimCount === "number" ? `${claimCount} claims` : undefined,
    x: 0,
    y: 0,
  };
}

function selectedFromShell(shell: ShellView | null | undefined) {
  return shell?.claimId ?? shell?.mapId ?? null;
}

export function createBrainGraph(view: BrainView): GraphModel {
  if (!view.mapSummary) {
    return {
      id: "brain-empty",
      title: "Brain graph",
      nodes: [],
      edges: [],
      selectedNodeId: null,
    };
  }

  const selectedClaimId = view.selectedClaim?.id ?? view.workspaceContext.claimId;
  const map = mapNode(view.mapSummary.id, view.mapSummary.title, view.mapSummary.claimCount);
  const claimNodes = view.claims.map((claim, index) => claimNode(claim, index, view.claims.length, selectedClaimId));
  const edges = claimNodes.map<GraphEdge>((claim) => ({
    id: `${map.id}:${claim.id}`,
    source: map.id,
    target: claim.id,
    label: "contains",
    type: "related",
    strength: claim.id === selectedClaimId ? 1.35 : 1,
  }));

  return {
    id: `brain:${map.id}`,
    title: view.mapSummary.title,
    nodes: [map, ...claimNodes],
    edges,
    selectedNodeId: selectedClaimId ?? map.id,
  };
}

export function createChallengeGraph(view: ChallengeView): GraphModel {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const shell = view.workspaceContext ?? view.currentContext ?? view.shellContext;
  const activeClaim = view.activeClaim ?? view.selectedClaim;

  if (shell.mapId) {
    nodes.push(mapNode(shell.mapId, shell.breadcrumb.find((item) => item.kind === "map")?.label ?? "Selected map"));
  }

  if (activeClaim) {
    nodes.push({
      id: activeClaim.id,
      label: truncateLabel(activeClaim.body),
      kind: "claim",
      cluster: "claim",
      type: "claim",
      confidence: typeof activeClaim.confidenceBps === "number" ? Math.round(activeClaim.confidenceBps / 100) : null,
      confidenceBps: activeClaim.confidenceBps,
      activityAt: activeClaim.updatedAt ?? activeClaim.createdAt,
      status: "selected",
      x: -160,
      y: 0,
    });

    if (shell.mapId) {
      edges.push({
        id: `${shell.mapId}:${activeClaim.id}`,
        source: shell.mapId,
        target: activeClaim.id,
        type: "related",
        strength: 1.25,
      });
    }
  }

  if (view.activeChallengeRound) {
    nodes.push({
      id: view.activeChallengeRound.id,
      label: "Challenge round",
      kind: "round",
      cluster: "challenge",
      type: "session",
      status: view.activeChallengeRound.status,
      activityAt: view.activeChallengeRound.updatedAt ?? view.activeChallengeRound.createdAt,
      x: 80,
      y: -96,
    });

    if (activeClaim) {
      edges.push({
        id: `${activeClaim.id}:${view.activeChallengeRound.id}`,
        source: activeClaim.id,
        target: view.activeChallengeRound.id,
        label: "challenged by",
        type: "related",
        strength: 1.2,
      });
    }

    if (view.critiqueState.status !== "not_requested") {
      nodes.push({
        id: view.critiqueState.critiqueId,
        label: view.critiqueState.status === "ready" ? "Critique ready" : "Critique",
        kind: "critique",
        cluster: "critique",
        status: view.critiqueState.status,
        type: "thought",
        x: 260,
        y: -120,
      });
      edges.push({
        id: `${view.activeChallengeRound.id}:${view.critiqueState.critiqueId}`,
        source: view.activeChallengeRound.id,
        target: view.critiqueState.critiqueId,
        label: "requests",
        type: "contradicts",
        status: "contradiction",
      });
    }

    if (view.responseStatus !== "not_recorded") {
      const responseNodeId = `${view.activeChallengeRound.id}:response`;
      nodes.push({
        id: responseNodeId,
        label: "Response recorded",
        kind: "response",
        cluster: "event",
        type: "session",
        status: view.responseStatus,
        activityAt: view.activeChallengeRound.updatedAt,
        x: 245,
        y: 95,
      });
      edges.push({
        id: `${view.activeChallengeRound.id}:${responseNodeId}`,
        source: view.activeChallengeRound.id,
        target: responseNodeId,
        label: "answered by",
        type: "related",
      });
    }
  }

  return {
    id: `challenge:${shell.mapId ?? "empty"}:${shell.claimId ?? "none"}`,
    title: "Challenge graph",
    nodes,
    edges,
    selectedNodeId: activeClaim?.id ?? selectedFromShell(shell),
  };
}

export function createLearnGraph(view: LearnView): GraphModel {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  if (view.selectedMapId) {
    nodes.push(mapNode(view.selectedMapId, view.workspaceContext.breadcrumb.find((item) => item.kind === "map")?.label ?? "Selected map"));
  }

  if (view.selectedClaim) {
    nodes.push({
      id: view.selectedClaim.id,
      label: truncateLabel(view.selectedClaim.body),
      kind: "claim",
      cluster: "claim",
      type: "claim",
      confidence: typeof view.selectedClaim.confidenceBps === "number" ? Math.round(view.selectedClaim.confidenceBps / 100) : null,
      confidenceBps: view.selectedClaim.confidenceBps,
      activityAt: view.selectedClaim.updatedAt ?? view.selectedClaim.createdAt,
      status: "selected",
      x: -120,
      y: 0,
    });

    if (view.selectedMapId) {
      edges.push({
        id: `${view.selectedMapId}:${view.selectedClaim.id}`,
        source: view.selectedMapId,
        target: view.selectedClaim.id,
        type: "related",
      });
    }
  }

  nodes.push({
    id: "learn-placeholder",
    label: view.message ?? view.learnState.message,
    kind: "learn",
    cluster: "learn",
    type: "thought",
    status: view.status,
    x: 170,
    y: 10,
  });

  if (view.selectedClaim) {
    edges.push({
      id: `${view.selectedClaim.id}:learn-placeholder`,
      source: view.selectedClaim.id,
      target: "learn-placeholder",
      label: "feeds",
      type: "supports",
    });
  }

  return {
    id: `learn:${view.selectedMapId ?? "empty"}:${view.selectedClaimId ?? "none"}`,
    title: "Learn graph",
    nodes,
    edges,
    selectedNodeId: view.selectedClaim?.id ?? view.selectedMapId,
  };
}
