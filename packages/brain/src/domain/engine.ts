import { createHash } from "node:crypto";
import type {
  ChallengeBriefArtifact,
  EntityId,
  ThinkingClaim,
  ThinkingEdge,
  ThinkingGraphSnapshot,
  ThinkingMode,
  ThinkingMove,
} from "./types.ts";

export const nextMoveEngineVersion = "thinking-mode-next-move-v1" as const;

export type NextMoveEngineAction = "resume_open_challenge" | "learn" | "clarify" | "verify" | "challenge";

export type NextMoveScoreBreakdown = {
  leverage: number;
  fragility: number;
  stakes: number;
  readiness: number;
  momentum: number;
  novelty: number;
  shape: number;
  penalties: number;
};

export type NextMoveExitCriteria = {
  label: string;
  acceptedMoveKinds: ReadonlyArray<string>;
};

export type NextMoveProvenance = {
  engine: typeof nextMoveEngineVersion;
  graphHash: string;
  source: "thinking_graph_snapshot";
  ruleIds: ReadonlyArray<string>;
  claimIds: ReadonlyArray<EntityId>;
  edgeIds: ReadonlyArray<EntityId>;
  moveIds: ReadonlyArray<EntityId>;
  artifactIds: ReadonlyArray<EntityId>;
};

export type NextMoveCandidate = {
  candidateId: string;
  rank: number;
  targetClaimId: EntityId;
  targetEdgeId: EntityId | null;
  action: NextMoveEngineAction;
  mode: ThinkingMode;
  score: number;
  reason: string;
  reasonCodes: ReadonlyArray<string>;
  exitCriteria: NextMoveExitCriteria;
  scoreBreakdown: NextMoveScoreBreakdown;
  graphHash: string;
  fingerprint: string;
  provenance: NextMoveProvenance;
};

type ClaimView = {
  id: EntityId;
  sessionId: EntityId;
  kind: ThinkingClaim["kind"];
  currentVersionId: EntityId;
  text: string;
  confidence: number;
  status: ThinkingClaim["status"];
  tags: ReadonlyArray<string>;
};

type CandidateDraft = Omit<NextMoveCandidate, "candidateId" | "rank" | "graphHash" | "fingerprint" | "provenance"> & {
  provenance: Omit<NextMoveProvenance, "engine" | "graphHash" | "source">;
};

const challengeResponseMoveKinds = new Set<string>([
  "user_defended",
  "claim_revised",
  "critique_absorbed",
  "challenge.response.defended",
  "challenge.response.revised",
  "challenge.response.absorbed",
]);

const challengeIssueMoveKinds = new Set<string>(["challenge_issued"]);
const learnMoveKinds = new Set<string>(["learning_triggered", "learn_explanation_saved", "learn_explanation_dismissed"]);
const verifyMoveKinds = new Set<string>(["verify_run", "confidence_update_accepted", "confidence_update_rejected"]);
const clarifyMoveKinds = new Set<string>(["claim_revised", "focus_completed"]);

export function buildGraphHash(graph: ThinkingGraphSnapshot): string {
  return stableHash({
    session: {
      id: graph.session.id,
      status: graph.session.status,
      endedAt: graph.session.endedAt,
    },
    focusState: {
      mode: graph.focusState.mode,
      focusedClaimId: graph.focusState.focusedClaimId,
      focusedEdgeId: graph.focusState.focusedEdgeId,
      source: graph.focusState.source,
      paused: graph.focusState.paused,
      suggestionMoveId: graph.focusState.suggestionMoveId,
      manualMoveId: graph.focusState.manualMoveId,
    },
    claims: graph.claims.map(normalizeClaimForHash).sort(byId),
    edges: graph.edges.map(normalizeEdgeForHash).sort(byId),
    moves: graph.moves.map(normalizeMoveForHash).sort(byId),
    artifacts: graph.artifacts.map(normalizeArtifactForHash).sort(byId),
  });
}

export function rankNextMoveCandidates(graph: ThinkingGraphSnapshot, limit = Number.POSITIVE_INFINITY): NextMoveCandidate[] {
  if (limit <= 0) {
    return [];
  }

  const graphHash = buildGraphHash(graph);
  const candidates = [
    ...resumeOpenChallengeCandidates(graph),
    ...challengeCandidates(graph),
    ...verifyCandidates(graph),
    ...clarifyCandidates(graph),
    ...learnCandidates(graph),
  ]
    .sort(compareCandidateDrafts)
    .slice(0, Math.floor(limit))
    .map((candidate, index) => materializeCandidate(candidate, graphHash, index + 1));

  return candidates;
}

export function selectNextMove(graph: ThinkingGraphSnapshot): NextMoveCandidate | null {
  const candidates = rankNextMoveCandidates(graph, 1);

  return candidates[0] ?? null;
}

function resumeOpenChallengeCandidates(graph: ThinkingGraphSnapshot): CandidateDraft[] {
  const respondedEdgeIds = challengeResponseEdgeIds(graph.moves);
  const claimMap = claimsById(graph.claims);

  return sortedEdges(graph.edges)
    .filter((edge) => isChallengeEdge(edge) && edge.status === "active" && !respondedEdgeIds.has(edge.id))
    .flatMap((edge) => {
      const target = claimMap.get(edge.toClaimId);

      if (!target || target.status === "rejected") {
        return [];
      }

      const relatedMoves = relatedMoveIds(graph.moves, target.id, edge.id);
      const scoreBreakdown: NextMoveScoreBreakdown = {
        leverage: leverageScore(graph.edges, target.id) + 80,
        fragility: fragilityScore(target, graph.edges),
        stakes: stakesScore(target),
        readiness: 320,
        momentum: challengeIssueMoveIds(graph.moves, edge.id).length > 0 ? 150 : 90,
        novelty: noveltyScore(graph.moves, target.id, "resume_open_challenge"),
        shape: 0,
        penalties: penaltyScore(target, graph.edges, graph.moves, edge.id),
      };

      return [
        {
          targetClaimId: target.id,
          targetEdgeId: edge.id,
          action: "resume_open_challenge",
          mode: "challenge",
          score: sumScore(scoreBreakdown),
          reason: `Resume the open challenge on "${clipText(target.text)}" before starting new work.`,
          reasonCodes: ["open_challenge", "defend_revise_absorb_required", ...tagReasonCodes(target)],
          exitCriteria: {
            label: "The user responds to the challenge with Defend, Revise, or Absorb.",
            acceptedMoveKinds: ["user_defended", "claim_revised", "critique_absorbed"],
          },
          scoreBreakdown,
          provenance: {
            ruleIds: ["resume_open_challenge", "active_unanswered_challenge"],
            claimIds: uniqueIds([target.id, edge.fromClaimId]),
            edgeIds: [edge.id],
            moveIds: relatedMoves,
            artifactIds: [],
          },
        },
      ];
    });
}

function challengeCandidates(graph: ThinkingGraphSnapshot): CandidateDraft[] {
  const openChallengeTargets = new Set(
    graph.edges
      .filter((edge) => isChallengeEdge(edge) && edge.status === "active" && !challengeResponseEdgeIds(graph.moves).has(edge.id))
      .map((edge) => edge.toClaimId),
  );

  return sortedClaims(graph.claims)
    .filter((claim) => claim.status === "exploratory")
    .filter((claim) => claim.kind === "assumption" || claim.confidence <= 55 || hasAnyTag(claim, ["load_bearing"]))
    .filter((claim) => !openChallengeTargets.has(claim.id))
    .map((claim) => {
      const targetEdgeId = strongestConnectedEdgeId(graph.edges, claim.id);
      const scoreBreakdown: NextMoveScoreBreakdown = {
        leverage: leverageScore(graph.edges, claim.id) + (hasAnyTag(claim, ["load_bearing"]) ? 90 : 0),
        fragility: fragilityScore(claim, graph.edges),
        stakes: stakesScore(claim),
        readiness: claim.kind === "assumption" ? 160 : 110,
        momentum: seedMomentumScore(graph.moves, claim.id),
        novelty: noveltyScore(graph.moves, claim.id, "challenge"),
        shape: 0,
        penalties: penaltyScore(claim, graph.edges, graph.moves, targetEdgeId),
      };

      return {
        targetClaimId: claim.id,
        targetEdgeId,
        action: "challenge",
        mode: "challenge",
        score: sumScore(scoreBreakdown),
        reason: `Challenge "${clipText(claim.text)}" because it is an unresolved, load-bearing risk in the map.`,
        reasonCodes: ["unresolved_claim", ...challengeReasonCodes(claim, graph.edges)],
        exitCriteria: {
          label: "A challenge is issued and the user can answer with Defend, Revise, or Absorb.",
          acceptedMoveKinds: ["challenge_issued"],
        },
        scoreBreakdown,
        provenance: {
          ruleIds: ["challenge", "load_bearing_fragility"],
          claimIds: evidenceClaimIds(graph.edges, claim.id),
          edgeIds: evidenceEdgeIds(graph.edges, claim.id),
          moveIds: seedMoveIds(graph.moves),
          artifactIds: [],
        },
      };
    });
}

function verifyCandidates(graph: ThinkingGraphSnapshot): CandidateDraft[] {
  return sortedClaims(graph.claims)
    .filter((claim) => claim.status !== "rejected" && claim.kind !== "concept")
    .filter((claim) => claim.confidence >= 85 || (claim.confidence <= 35 && supportCount(graph.edges, claim.id) === 0))
    .map((claim) => {
      const scoreBreakdown: NextMoveScoreBreakdown = {
        leverage: leverageScore(graph.edges, claim.id),
        fragility: fragilityScore(claim, graph.edges) + (supportCount(graph.edges, claim.id) === 0 ? 130 : 0),
        stakes: stakesScore(claim),
        readiness: 130,
        momentum: seedMomentumScore(graph.moves, claim.id),
        novelty: noveltyScore(graph.moves, claim.id, "verify"),
        shape: 0,
        penalties: penaltyScore(claim, graph.edges, graph.moves, null),
      };

      return {
        targetClaimId: claim.id,
        targetEdgeId: strongestConnectedEdgeId(graph.edges, claim.id),
        action: "verify",
        mode: "verify",
        score: sumScore(scoreBreakdown),
        reason: `Verify "${clipText(claim.text)}" because its confidence is not backed by enough explicit support.`,
        reasonCodes: [claim.confidence >= 85 ? "high_confidence" : "very_low_confidence", "unsupported_or_extreme_confidence"],
        exitCriteria: {
          label: "Verify produces evidence and any confidence change is explicitly accepted or rejected.",
          acceptedMoveKinds: ["verify_run", "confidence_update_accepted", "confidence_update_rejected"],
        },
        scoreBreakdown,
        provenance: {
          ruleIds: ["verify", "confidence_integrity"],
          claimIds: evidenceClaimIds(graph.edges, claim.id),
          edgeIds: evidenceEdgeIds(graph.edges, claim.id),
          moveIds: seedMoveIds(graph.moves),
          artifactIds: [],
        },
      };
    });
}

function clarifyCandidates(graph: ThinkingGraphSnapshot): CandidateDraft[] {
  return sortedClaims(graph.claims)
    .filter((claim) => claim.status === "exploratory")
    .filter((claim) => claim.kind === "question" || needsClarification(claim))
    .map((claim) => {
      const scoreBreakdown: NextMoveScoreBreakdown = {
        leverage: leverageScore(graph.edges, claim.id),
        fragility: claim.kind === "question" ? 100 : 70,
        stakes: stakesScore(claim),
        readiness: 115,
        momentum: seedMomentumScore(graph.moves, claim.id),
        novelty: noveltyScore(graph.moves, claim.id, "clarify"),
        shape: 0,
        penalties: penaltyScore(claim, graph.edges, graph.moves, null),
      };

      return {
        targetClaimId: claim.id,
        targetEdgeId: strongestConnectedEdgeId(graph.edges, claim.id),
        action: "clarify",
        mode: "brain",
        score: sumScore(scoreBreakdown),
        reason: `Clarify "${clipText(claim.text)}" so the map has a sharper question or claim before deeper work.`,
        reasonCodes: claim.kind === "question" ? ["open_question", "needs_clarification"] : ["ambiguous_claim", "needs_clarification"],
        exitCriteria: {
          label: "The ambiguity is turned into a clearer claim, question, or explicit decision to leave it unchanged.",
          acceptedMoveKinds: ["claim_revised", "focus_completed"],
        },
        scoreBreakdown,
        provenance: {
          ruleIds: ["clarify", "question_or_ambiguity"],
          claimIds: evidenceClaimIds(graph.edges, claim.id),
          edgeIds: evidenceEdgeIds(graph.edges, claim.id),
          moveIds: seedMoveIds(graph.moves),
          artifactIds: [],
        },
      };
    });
}

function learnCandidates(graph: ThinkingGraphSnapshot): CandidateDraft[] {
  return sortedClaims(graph.claims)
    .filter((claim) => claim.status !== "rejected" && claim.kind === "concept")
    .map((claim) => {
      const scoreBreakdown: NextMoveScoreBreakdown = {
        leverage: leverageScore(graph.edges, claim.id),
        fragility: 40,
        stakes: stakesScore(claim),
        readiness: 105,
        momentum: seedMomentumScore(graph.moves, claim.id),
        novelty: noveltyScore(graph.moves, claim.id, "learn"),
        shape: 0,
        penalties: penaltyScore(claim, graph.edges, graph.moves, null),
      };

      return {
        targetClaimId: claim.id,
        targetEdgeId: strongestConnectedEdgeId(graph.edges, claim.id),
        action: "learn",
        mode: "learn",
        score: sumScore(scoreBreakdown),
        reason: `Learn the concept behind "${clipText(claim.text)}" to improve the user's next reasoning step.`,
        reasonCodes: ["concept_node", "learn_in_context"],
        exitCriteria: {
          label: "The user saves, dismisses, or completes the contextual Learn explanation.",
          acceptedMoveKinds: ["learning_triggered", "learn_explanation_saved", "learn_explanation_dismissed"],
        },
        scoreBreakdown,
        provenance: {
          ruleIds: ["learn", "concept_in_context"],
          claimIds: evidenceClaimIds(graph.edges, claim.id),
          edgeIds: evidenceEdgeIds(graph.edges, claim.id),
          moveIds: seedMoveIds(graph.moves),
          artifactIds: [],
        },
      };
    });
}

function materializeCandidate(candidate: CandidateDraft, graphHash: string, rank: number): NextMoveCandidate {
  const fingerprint = stableHash({
    action: candidate.action,
    targetClaimId: candidate.targetClaimId,
    targetEdgeId: candidate.targetEdgeId,
    reasonCodes: candidate.reasonCodes,
  });

  return {
    ...candidate,
    candidateId: `next_${fingerprint.slice(0, 16)}`,
    rank,
    graphHash,
    fingerprint,
    provenance: {
      ...candidate.provenance,
      engine: nextMoveEngineVersion,
      graphHash,
      source: "thinking_graph_snapshot",
    },
  };
}

function compareCandidateDrafts(left: CandidateDraft, right: CandidateDraft): number {
  return (
    right.score - left.score ||
    actionPriority(left.action) - actionPriority(right.action) ||
    left.targetClaimId.localeCompare(right.targetClaimId) ||
    (left.targetEdgeId ?? "").localeCompare(right.targetEdgeId ?? "")
  );
}

function actionPriority(action: NextMoveEngineAction): number {
  switch (action) {
    case "resume_open_challenge":
      return 1;
    case "challenge":
      return 2;
    case "verify":
      return 3;
    case "clarify":
      return 4;
    case "learn":
      return 5;
  }
}

function normalizeClaimForHash(claim: ThinkingClaim) {
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
}

function normalizeEdgeForHash(edge: ThinkingEdge) {
  return {
    id: edge.id,
    fromClaimId: edge.fromClaimId,
    toClaimId: edge.toClaimId,
    kind: edge.kind,
    status: edge.status,
    label: edge.label,
  };
}

function normalizeMoveForHash(move: ThinkingMove) {
  return {
    id: move.id,
    kind: move.kind,
    payload: move.payload,
  };
}

function normalizeArtifactForHash(artifact: ChallengeBriefArtifact) {
  return {
    id: artifact.id,
    kind: artifact.kind,
    claimIds: [...artifact.claimIds].sort(),
    edgeIds: [...artifact.edgeIds].sort(),
    moveIds: [...artifact.moveIds].sort(),
  };
}

function claimsById(claims: ReadonlyArray<ThinkingClaim>): Map<EntityId, ClaimView> {
  return new Map(sortedClaims(claims).map((claim) => [claim.id, claim]));
}

function sortedClaims(claims: ReadonlyArray<ThinkingClaim>): ClaimView[] {
  return claims.map(toClaimView).sort(byId);
}

function toClaimView(claim: ThinkingClaim): ClaimView {
  const currentVersion = claim.versions?.find((version) => version.isCurrent || version.id === claim.currentVersionId);

  return {
    id: claim.id,
    sessionId: claim.sessionId,
    kind: claim.kind,
    currentVersionId: claim.currentVersionId,
    text: currentVersion?.text ?? claim.text,
    confidence: currentVersion?.confidence ?? claim.confidence,
    status: currentVersion?.status ?? claim.status,
    tags: [...(claim.tags ?? [])].sort(),
  };
}

function sortedEdges(edges: ReadonlyArray<ThinkingEdge>): ThinkingEdge[] {
  return [...edges].sort(byId);
}

function byId(left: { id: string }, right: { id: string }): number {
  return left.id.localeCompare(right.id);
}

function isChallengeEdge(edge: ThinkingEdge): boolean {
  return edge.kind === "challenges" || edge.kind === "contradicts";
}

function challengeResponseEdgeIds(moves: ReadonlyArray<ThinkingMove>): Set<EntityId> {
  const edgeIds = new Set<EntityId>();

  for (const move of moves) {
    if (!challengeResponseMoveKinds.has(move.kind)) {
      continue;
    }

    const payload = move.payload;
    const challengeEdgeId = payload.challengeEdgeId;

    if (typeof challengeEdgeId === "string") {
      edgeIds.add(challengeEdgeId);
    }

    const payloadEdgeIds = payload.edgeIds;

    if (Array.isArray(payloadEdgeIds)) {
      for (const edgeId of payloadEdgeIds) {
        if (typeof edgeId === "string") {
          edgeIds.add(edgeId);
        }
      }
    }
  }

  return edgeIds;
}

function challengeIssueMoveIds(moves: ReadonlyArray<ThinkingMove>, edgeId: EntityId): EntityId[] {
  return moves
    .filter((move) => challengeIssueMoveKinds.has(move.kind) && moveMentionsEdge(move, edgeId))
    .map((move) => move.id)
    .sort();
}

function leverageScore(edges: ReadonlyArray<ThinkingEdge>, claimId: EntityId): number {
  const activeConnectedEdges = edges.filter((edge) => edge.status === "active" && connectsClaim(edge, claimId));
  const dependencyEdges = activeConnectedEdges.filter((edge) => edge.kind === "depends_on");
  const questionEdges = activeConnectedEdges.filter((edge) => edge.kind === "questions");
  const challengeEdges = activeConnectedEdges.filter((edge) => isChallengeEdge(edge));
  const clarifyingEdges = activeConnectedEdges.filter((edge) => edge.kind === "clarifies" || edge.kind === "teaches");

  return 180 + dependencyEdges.length * 85 + questionEdges.length * 45 + challengeEdges.length * 70 + clarifyingEdges.length * 30;
}

function fragilityScore(claim: ClaimView, edges: ReadonlyArray<ThinkingEdge>): number {
  const confidence = clampConfidence(claim.confidence);
  const confidenceFragility =
    confidence <= 55 ? (56 - confidence) * 7 : confidence >= 85 ? (confidence - 84) * 8 : Math.round(Math.abs(65 - confidence) * 1.5);
  const unsupportedFragility = supportCount(edges, claim.id) === 0 && claim.kind !== "question" ? 55 : 0;
  const exploratoryFragility = claim.status === "exploratory" ? 35 : 0;

  return confidenceFragility + unsupportedFragility + exploratoryFragility;
}

function stakesScore(claim: ClaimView): number {
  const haystack = `${claim.text} ${claim.tags.join(" ")}`.toLowerCase();
  let score = 40;

  if (/\b(founder|customer|market|adoption|workflow|pay|pricing|revenue|sales)\b/.test(haystack)) {
    score += 130;
  }

  if (/\b(high[- ]stakes|decision|pivot|fundraising|board|hiring|cofounder)\b/.test(haystack)) {
    score += 80;
  }

  if (hasAnyTag(claim, ["load_bearing", "low_confidence_market_assumption", "high_confidence_unsupported_claim"])) {
    score += 100;
  }

  return score;
}

function seedMomentumScore(moves: ReadonlyArray<ThinkingMove>, claimId: EntityId): number {
  const extracted = moves.some((move) => move.kind === "assumptions_extracted" && moveMentionsClaim(move, claimId));
  const seeded = moves.some((move) => move.kind === "seed_claim_created" && moveMentionsClaim(move, claimId));

  if (extracted) {
    return 80;
  }

  if (seeded) {
    return 60;
  }

  return 35;
}

function noveltyScore(moves: ReadonlyArray<ThinkingMove>, claimId: EntityId, action: NextMoveEngineAction): number {
  const alreadyWorked = moves.some((move) => moveMentionsClaim(move, claimId) && moveKindMatchesAction(move.kind, action));

  return alreadyWorked ? -90 : 90;
}

function penaltyScore(
  claim: ClaimView,
  edges: ReadonlyArray<ThinkingEdge>,
  moves: ReadonlyArray<ThinkingMove>,
  edgeId: EntityId | null,
): number {
  let penalties = 0;

  if (claim.status === "resolved" || claim.status === "committed") {
    penalties -= 80;
  }

  if (edgeId && challengeResponseEdgeIds(moves).has(edgeId)) {
    penalties -= 180;
  }

  if (supportCount(edges, claim.id) > 1 && claim.confidence >= 70) {
    penalties -= 40;
  }

  return penalties;
}

function supportCount(edges: ReadonlyArray<ThinkingEdge>, claimId: EntityId): number {
  return edges.filter((edge) => edge.status === "active" && edge.kind === "supports" && edge.toClaimId === claimId).length;
}

function strongestConnectedEdgeId(edges: ReadonlyArray<ThinkingEdge>, claimId: EntityId): EntityId | null {
  const sortedByStrength = [...edges]
    .filter((edge) => edge.status === "active" && connectsClaim(edge, claimId))
    .sort((left, right) => edgeStrength(right) - edgeStrength(left) || left.id.localeCompare(right.id));

  return sortedByStrength[0]?.id ?? null;
}

function edgeStrength(edge: ThinkingEdge): number {
  switch (edge.kind) {
    case "depends_on":
      return 6;
    case "challenges":
    case "contradicts":
      return 5;
    case "questions":
      return 4;
    case "supports":
      return 3;
    case "clarifies":
      return 2;
    case "teaches":
      return 1;
  }
}

function evidenceClaimIds(graphEdges: ReadonlyArray<ThinkingEdge>, claimId: EntityId): EntityId[] {
  return uniqueIds([
    claimId,
    ...graphEdges.filter((edge) => connectsClaim(edge, claimId)).flatMap((edge) => [edge.fromClaimId, edge.toClaimId]),
  ]);
}

function evidenceEdgeIds(graphEdges: ReadonlyArray<ThinkingEdge>, claimId: EntityId): EntityId[] {
  return graphEdges
    .filter((edge) => connectsClaim(edge, claimId))
    .map((edge) => edge.id)
    .sort();
}

function seedMoveIds(moves: ReadonlyArray<ThinkingMove>): EntityId[] {
  return moves
    .filter((move) => move.kind === "seed_claim_created" || move.kind === "assumptions_extracted")
    .map((move) => move.id)
    .sort();
}

function relatedMoveIds(moves: ReadonlyArray<ThinkingMove>, claimId: EntityId, edgeId: EntityId): EntityId[] {
  return moves
    .filter((move) => moveMentionsClaim(move, claimId) || moveMentionsEdge(move, edgeId))
    .map((move) => move.id)
    .sort();
}

function challengeReasonCodes(claim: ClaimView, edges: ReadonlyArray<ThinkingEdge>): string[] {
  const codes = ["challengeable"];

  if (claim.kind === "assumption") {
    codes.push("assumption");
  }

  if (claim.confidence <= 55) {
    codes.push("low_confidence");
  }

  if (leverageScore(edges, claim.id) >= 350 || hasAnyTag(claim, ["load_bearing"])) {
    codes.push("load_bearing");
  }

  codes.push(...tagReasonCodes(claim));

  return uniqueIds(codes);
}

function tagReasonCodes(claim: ClaimView): string[] {
  const codes: string[] = [];
  const haystack = `${claim.text} ${claim.tags.join(" ")}`.toLowerCase();

  if (/\b(founder|customer|market|adoption|pay|pricing|revenue|sales)\b/.test(haystack)) {
    codes.push("market_risk");
  }

  if (hasAnyTag(claim, ["load_bearing"])) {
    codes.push("load_bearing");
  }

  if (hasAnyTag(claim, ["low_confidence_market_assumption"])) {
    codes.push("low_confidence_market_assumption");
  }

  if (hasAnyTag(claim, ["high_confidence_unsupported_claim"])) {
    codes.push("high_confidence_unsupported_claim");
  }

  return uniqueIds(codes);
}

function needsClarification(claim: ClaimView): boolean {
  const haystack = `${claim.text} ${claim.tags.join(" ")}`.toLowerCase();

  return claim.text.trim().endsWith("?") || /\b(ambiguous|unclear|clarify|which|what|how)\b/.test(haystack);
}

function hasAnyTag(claim: ClaimView, tags: ReadonlyArray<string>): boolean {
  return claim.tags.some((tag) => tags.includes(tag));
}

function connectsClaim(edge: ThinkingEdge, claimId: EntityId): boolean {
  return edge.fromClaimId === claimId || edge.toClaimId === claimId;
}

function moveKindMatchesAction(kind: string, action: NextMoveEngineAction): boolean {
  switch (action) {
    case "resume_open_challenge":
      return challengeResponseMoveKinds.has(kind);
    case "challenge":
      return challengeIssueMoveKinds.has(kind);
    case "verify":
      return verifyMoveKinds.has(kind);
    case "clarify":
      return clarifyMoveKinds.has(kind);
    case "learn":
      return learnMoveKinds.has(kind);
  }
}

function moveMentionsClaim(move: ThinkingMove, claimId: EntityId): boolean {
  const { payload } = move;

  return (
    payload.claimId === claimId ||
    payload.targetClaimId === claimId ||
    (Array.isArray(payload.claimIds) && payload.claimIds.includes(claimId))
  );
}

function moveMentionsEdge(move: ThinkingMove, edgeId: EntityId): boolean {
  const { payload } = move;

  return (
    payload.edgeId === edgeId ||
    payload.targetEdgeId === edgeId ||
    payload.challengeEdgeId === edgeId ||
    (Array.isArray(payload.edgeIds) && payload.edgeIds.includes(edgeId))
  );
}

function clampConfidence(confidence: number): number {
  return Math.max(0, Math.min(100, Math.round(confidence)));
}

function sumScore(scoreBreakdown: NextMoveScoreBreakdown): number {
  return Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0);
}

function uniqueIds<T extends string>(ids: ReadonlyArray<T>): T[] {
  return [...new Set(ids)].sort();
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
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

function clipText(value: string, maxLength = 110): string {
  const compact = value.replace(/\s+/g, " ").trim();

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 3).trimEnd()}...`;
}
