import { createHash } from "node:crypto";
import type { CandidateEvidence, EntityId, ThinkingEdge, ThinkingGraphSnapshot, ThinkingMove, ThinkingMode } from "./domain/types.ts";

export type PureNextMoveAction =
  | "resume_open_challenge"
  | "challenge_claim"
  | "review_assumption"
  | "verify"
  | "learn"
  | "create_challenge_brief"
  | "explore_claim";

export type ScoreBreakdown = {
  base: number;
  confidence: number;
  dependency: number;
  unsupported: number;
  kind: number;
  market: number;
  challenge: number;
};

export type ExitCriteria = {
  label: string;
  requiredMoveKind: string;
};

export type PureNextMoveCandidate = {
  candidateId: string;
  fingerprint: string;
  graphHash: string;
  sessionId: EntityId;
  action: PureNextMoveAction;
  mode: ThinkingMode;
  targetClaimId: EntityId | null;
  targetEdgeId: EntityId | null;
  score: number;
  rank: number;
  reason: string;
  reasonCodes: ReadonlyArray<string>;
  exitCriteria: ExitCriteria;
  scoreBreakdown: ScoreBreakdown;
  evidence: CandidateEvidence;
};

export type PureNextMoveRanking = {
  graphHash: string;
  selected: PureNextMoveCandidate | null;
  candidates: ReadonlyArray<PureNextMoveCandidate>;
};

type CandidateDraft = Omit<PureNextMoveCandidate, "candidateId" | "fingerprint" | "graphHash" | "rank">;

const responseMoveKinds = new Set([
  "user_defended",
  "claim_revised",
  "critique_absorbed",
  "challenge.response.defended",
  "challenge.response.revised",
  "challenge.response.absorbed",
]);

export function rankNextMoves(graph: ThinkingGraphSnapshot): PureNextMoveRanking {
  const graphHash = hashGraph(graph);
  const candidates = [
    ...openChallengeCandidates(graph),
    ...assumptionCandidates(graph),
    ...highConfidenceVerifyCandidates(graph),
    ...conceptLearnCandidates(graph),
    ...fallbackExploreCandidates(graph),
  ]
    .sort(compareDrafts)
    .map((candidate, index) => materializeCandidate(candidate, graphHash, index + 1));

  return {
    graphHash,
    selected: candidates[0] ?? null,
    candidates,
  };
}

export function hashGraph(graph: ThinkingGraphSnapshot): string {
  return stableHash({
    session: {
      id: graph.session.id,
      status: graph.session.status,
    },
    claims: graph.claims
      .map((claim) => {
        const currentVersion = claim.versions?.find((version) => version.isCurrent || version.id === claim.currentVersionId);

        return {
          id: claim.id,
          kind: claim.kind,
          status: claim.status,
          currentVersionId: claim.currentVersionId,
          text: currentVersion?.text ?? claim.text,
          confidence: currentVersion?.confidence ?? claim.confidence,
          tags: [...(claim.tags ?? [])].sort(),
        };
      })
      .sort(byId),
    edges: graph.edges
      .map((edge) => ({
        id: edge.id,
        fromClaimId: edge.fromClaimId,
        toClaimId: edge.toClaimId,
        kind: edge.kind,
        status: edge.status,
        label: edge.label,
      }))
      .sort(byId),
    artifacts: graph.artifacts.map((artifact) => ({ id: artifact.id, kind: artifact.kind })).sort(byId),
    responseMoves: graph.moves
      .filter((move) => responseMoveKinds.has(move.kind))
      .map((move) => ({
        id: move.id,
        kind: move.kind,
        payload: move.payload,
      }))
      .sort(byId),
  });
}

function openChallengeCandidates(graph: ThinkingGraphSnapshot): CandidateDraft[] {
  const respondedEdges = respondedChallengeEdgeIds(graph.moves);

  return graph.edges
    .filter((edge) => isChallengeEdge(edge) && edge.status === "active" && !respondedEdges.has(edge.id))
    .map((edge) => {
      const target = claimById(graph, edge.toClaimId);
      const dependencyCount = dependencyPressure(graph.edges, edge.toClaimId);
      const confidence = target?.confidence ?? 60;
      const scoreBreakdown: ScoreBreakdown = {
        base: 1_000,
        confidence: confidenceRisk(confidence),
        dependency: dependencyCount * 40,
        unsupported: 0,
        kind: 0,
        market: 0,
        challenge: 250,
      };

      return {
        sessionId: graph.session.id,
        action: "resume_open_challenge",
        mode: "challenge",
        targetClaimId: edge.toClaimId,
        targetEdgeId: edge.id,
        score: sumScore(scoreBreakdown),
        reason: `Resume the open challenge on "${clipText(target?.text ?? edge.toClaimId)}" before starting new exploration.`,
        reasonCodes: ["open_challenge", "challenge_response_required"],
        exitCriteria: {
          label: "Resolve the challenge through Defend, Revise, or Absorb.",
          requiredMoveKind: "user_defended|claim_revised|critique_absorbed",
        },
        scoreBreakdown,
        evidence: {
          claimIds: [edge.toClaimId, edge.fromClaimId],
          edgeIds: [edge.id],
          moveIds: [],
          artifactIds: [],
        },
      };
    });
}

function assumptionCandidates(graph: ThinkingGraphSnapshot): CandidateDraft[] {
  return graph.claims
    .filter((claim) => claim.kind === "assumption" && claim.status === "exploratory")
    .map((claim) => {
      const dependencyCount = dependencyPressure(graph.edges, claim.id);
      const market = marketRiskBonus(claim.text, claim.tags);
      const scoreBreakdown: ScoreBreakdown = {
        base: 680,
        confidence: confidenceRisk(claim.confidence),
        dependency: dependencyCount * 80,
        unsupported: supportCount(graph.edges, claim.id) === 0 ? 40 : 0,
        kind: 90,
        market,
        challenge: 0,
      };

      return {
        sessionId: graph.session.id,
        action: "challenge_claim",
        mode: "challenge",
        targetClaimId: claim.id,
        targetEdgeId: firstConnectedEdgeId(graph.edges, claim.id),
        score: sumScore(scoreBreakdown),
        reason: `Challenge "${clipText(claim.text)}" because it is a load-bearing assumption with ${claim.confidence}% confidence.`,
        reasonCodes: ["assumption", "load_bearing", ...(market > 0 ? ["market_risk"] : [])],
        exitCriteria: {
          label: "Issue a challenge and capture a Defend, Revise, or Absorb response.",
          requiredMoveKind: "challenge_issued",
        },
        scoreBreakdown,
        evidence: evidenceForClaim(graph, claim.id),
      };
    });
}

function highConfidenceVerifyCandidates(graph: ThinkingGraphSnapshot): CandidateDraft[] {
  return graph.claims
    .filter((claim) => claim.status !== "rejected" && claim.confidence >= 85 && supportCount(graph.edges, claim.id) === 0)
    .map((claim) => {
      const scoreBreakdown: ScoreBreakdown = {
        base: 640,
        confidence: (claim.confidence - 84) * 10,
        dependency: dependencyPressure(graph.edges, claim.id) * 30,
        unsupported: 120,
        kind: 0,
        market: 0,
        challenge: 0,
      };

      return {
        sessionId: graph.session.id,
        action: "verify",
        mode: "verify",
        targetClaimId: claim.id,
        targetEdgeId: null,
        score: sumScore(scoreBreakdown),
        reason: `Verify "${clipText(claim.text)}" because it is high-confidence without supporting evidence.`,
        reasonCodes: ["high_confidence", "unsupported_claim"],
        exitCriteria: {
          label: "Run Verify and decide whether to accept or reject any confidence update.",
          requiredMoveKind: "verify_run",
        },
        scoreBreakdown,
        evidence: evidenceForClaim(graph, claim.id),
      };
    });
}

function conceptLearnCandidates(graph: ThinkingGraphSnapshot): CandidateDraft[] {
  return graph.claims
    .filter((claim) => claim.kind === "concept" && claim.status !== "rejected")
    .map((claim) => {
      const scoreBreakdown: ScoreBreakdown = {
        base: 560,
        confidence: 0,
        dependency: dependencyPressure(graph.edges, claim.id) * 20,
        unsupported: 0,
        kind: 100,
        market: 0,
        challenge: 0,
      };

      return {
        sessionId: graph.session.id,
        action: "learn",
        mode: "learn",
        targetClaimId: claim.id,
        targetEdgeId: firstConnectedEdgeId(graph.edges, claim.id),
        score: sumScore(scoreBreakdown),
        reason: `Learn the concept behind "${clipText(claim.text)}" so the user can keep thinking in context.`,
        reasonCodes: ["concept_node", "learn_in_context"],
        exitCriteria: {
          label: "Save or dismiss the contextual Learn explanation.",
          requiredMoveKind: "learning_triggered",
        },
        scoreBreakdown,
        evidence: evidenceForClaim(graph, claim.id),
      };
    });
}

function fallbackExploreCandidates(graph: ThinkingGraphSnapshot): CandidateDraft[] {
  return graph.claims
    .filter((claim) => claim.status === "exploratory")
    .map((claim) => {
      const scoreBreakdown: ScoreBreakdown = {
        base: 420,
        confidence: confidenceRisk(claim.confidence),
        dependency: dependencyPressure(graph.edges, claim.id) * 10,
        unsupported: 0,
        kind: 0,
        market: 0,
        challenge: 0,
      };

      return {
        sessionId: graph.session.id,
        action: "explore_claim",
        mode: "brain",
        targetClaimId: claim.id,
        targetEdgeId: null,
        score: sumScore(scoreBreakdown),
        reason: `Explore "${clipText(claim.text)}" if no higher-leverage move is available.`,
        reasonCodes: ["fallback_exploration"],
        exitCriteria: {
          label: "Choose challenge, verify, learn, revise, or leave the claim unchanged.",
          requiredMoveKind: "focus_completed",
        },
        scoreBreakdown,
        evidence: evidenceForClaim(graph, claim.id),
      };
    });
}

function materializeCandidate(candidate: CandidateDraft, graphHash: string, rank: number): PureNextMoveCandidate {
  const fingerprint = stableHash({
    graphHash,
    action: candidate.action,
    targetClaimId: candidate.targetClaimId,
    targetEdgeId: candidate.targetEdgeId,
  });

  return {
    ...candidate,
    candidateId: `next_${fingerprint.slice(0, 16)}`,
    fingerprint,
    graphHash,
    rank,
  };
}

function compareDrafts(left: CandidateDraft, right: CandidateDraft): number {
  return (
    right.score - left.score ||
    actionPriority(left.action) - actionPriority(right.action) ||
    (left.targetClaimId ?? "").localeCompare(right.targetClaimId ?? "") ||
    (left.targetEdgeId ?? "").localeCompare(right.targetEdgeId ?? "")
  );
}

function actionPriority(action: PureNextMoveAction): number {
  switch (action) {
    case "resume_open_challenge":
      return 1;
    case "challenge_claim":
      return 2;
    case "verify":
      return 3;
    case "learn":
      return 4;
    case "review_assumption":
      return 5;
    case "create_challenge_brief":
      return 6;
    case "explore_claim":
      return 7;
  }
}

function hashPayload(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableHash(value: unknown): string {
  return hashPayload(value).slice(0, 32);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;

  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function byId(left: { id: string }, right: { id: string }): number {
  return left.id.localeCompare(right.id);
}

function respondedChallengeEdgeIds(moves: ReadonlyArray<ThinkingMove>): Set<string> {
  const ids = new Set<string>();

  for (const move of moves) {
    if (!responseMoveKinds.has(move.kind)) {
      continue;
    }

    const challengeEdgeId = move.payload.challengeEdgeId;

    if (typeof challengeEdgeId === "string") {
      ids.add(challengeEdgeId);
    }

    const edgeIds = move.payload.edgeIds;

    if (Array.isArray(edgeIds)) {
      for (const edgeId of edgeIds) {
        if (typeof edgeId === "string") {
          ids.add(edgeId);
        }
      }
    }
  }

  return ids;
}

function isChallengeEdge(edge: ThinkingEdge): boolean {
  return edge.kind === "challenges" || edge.kind === "contradicts";
}

function claimById(graph: ThinkingGraphSnapshot, claimId: string) {
  return graph.claims.find((claim) => claim.id === claimId) ?? null;
}

function dependencyPressure(edges: ReadonlyArray<ThinkingEdge>, claimId: string): number {
  return edges.filter(
    (edge) =>
      edge.status === "active" &&
      (edge.toClaimId === claimId || edge.fromClaimId === claimId) &&
      ["depends_on", "supports", "challenges", "contradicts", "questions", "clarifies"].includes(edge.kind),
  ).length;
}

function supportCount(edges: ReadonlyArray<ThinkingEdge>, claimId: string): number {
  return edges.filter((edge) => edge.status === "active" && edge.kind === "supports" && edge.toClaimId === claimId).length;
}

function confidenceRisk(confidence: number): number {
  if (confidence <= 55) {
    return (56 - confidence) * 8;
  }

  if (confidence >= 85) {
    return (confidence - 84) * 8;
  }

  return Math.round(Math.abs(65 - confidence) / 2);
}

function marketRiskBonus(text: string, tags: ReadonlyArray<string> | undefined): number {
  const haystack = `${text} ${(tags ?? []).join(" ")}`.toLowerCase();
  let bonus = 0;

  if (/\bfounder|customer|market|adoption|willingness|pay\b/.test(haystack)) {
    bonus += 100;
  }

  if (/low_confidence_market_assumption|load_bearing/.test(haystack)) {
    bonus += 100;
  }

  return bonus;
}

function firstConnectedEdgeId(edges: ReadonlyArray<ThinkingEdge>, claimId: string): string | null {
  return [...edges]
    .sort((left, right) => left.id.localeCompare(right.id))
    .find((edge) => edge.fromClaimId === claimId || edge.toClaimId === claimId)?.id ?? null;
}

function evidenceForClaim(graph: ThinkingGraphSnapshot, claimId: string): CandidateEvidence {
  const edgeIds = graph.edges
    .filter((edge) => edge.fromClaimId === claimId || edge.toClaimId === claimId)
    .map((edge) => edge.id)
    .sort();
  const seedMoveIds = graph.moves
    .filter((move) => move.kind === "assumptions_extracted" || move.kind === "seed_claim_created")
    .map((move) => move.id)
    .sort();

  return {
    claimIds: [claimId],
    edgeIds,
    moveIds: seedMoveIds,
    artifactIds: [],
  };
}

function sumScore(scoreBreakdown: ScoreBreakdown): number {
  return Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0);
}

function clipText(value: string, maxLength = 100): string {
  const compact = value.replace(/\s+/g, " ").trim();

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 3).trimEnd()}...`;
}
