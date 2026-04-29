export type AutopilotAction =
  | "respond_to_challenge"
  | "compile_challenge_brief"
  | "review_assumption"
  | "revisit_absorbed_risk"
  | "challenge_claim"
  | "inspect_map";

export type AutopilotClaim = {
  id: string;
  sessionId: string;
  versionId: string;
  kind: "belief" | "assumption" | "question" | "concept";
  status: "exploratory" | "committed" | "resolved" | "rejected";
  text: string;
  confidence: number;
};

export type AutopilotEdge = {
  id: string;
  sessionId: string;
  fromClaimId: string;
  toClaimId: string;
  kind: "depends_on" | "supports" | "questions" | "challenges" | "contradicts" | "clarifies" | "teaches";
  status: "active" | "acknowledged_vulnerability";
  label: string | null;
};

export type AutopilotMove = {
  id: string;
  sessionId: string;
  kind: string;
  summary: string;
  payload: unknown;
  createdAt: Date;
};

export type AutopilotArtifact = {
  id: string;
  sessionId: string;
  kind: "idea_map" | "challenge_brief" | "idea_map_challenge_brief";
  createdAt: Date;
};

export type AutopilotState = {
  sessionId: string;
  claims: AutopilotClaim[];
  edges: AutopilotEdge[];
  moves: AutopilotMove[];
  artifacts: AutopilotArtifact[];
};

export type AutopilotSuggestion = {
  id: string;
  action: AutopilotAction;
  title: string;
  rationale: string;
  whyChosen: string[];
  score: number;
  autopilotPaused: boolean;
  targetClaimId: string | null;
  challengeEdgeId: string | null;
  artifactKind: AutopilotArtifact["kind"] | null;
  goThereLabel: string;
};

type CandidateDraft = Omit<AutopilotSuggestion, "id" | "autopilotPaused" | "goThereLabel">;

const challengeResponseKinds = new Set([
  "user_defended",
  "claim_revised",
  "critique_absorbed",
  "challenge.response.defended",
  "challenge.response.revised",
  "challenge.response.absorbed",
]);
const challengeBriefKinds = new Set<AutopilotArtifact["kind"]>(["challenge_brief", "idea_map_challenge_brief"]);
const actionOrder = new Map<AutopilotAction, number>([
  ["respond_to_challenge", 0],
  ["compile_challenge_brief", 1],
  ["review_assumption", 2],
  ["revisit_absorbed_risk", 3],
  ["challenge_claim", 4],
  ["inspect_map", 5],
]);

export function chooseAutopilotSuggestion(state: AutopilotState): AutopilotSuggestion {
  return rankAutopilotMoves(state)[0] ?? fallbackSuggestion(state);
}

export function rankAutopilotMoves(state: AutopilotState): AutopilotSuggestion[] {
  const claimsById = new Map(state.claims.map((claim) => [claim.id, claim]));
  const paused = autopilotPaused(state.moves);
  const candidates = [
    ...openChallengeCandidates(state, claimsById),
    ...challengeBriefCandidates(state),
    ...assumptionCandidates(state),
    ...absorbedRiskCandidates(state, claimsById),
    ...claimChallengeCandidates(state),
  ]
    .map((candidate) => materializeCandidate(candidate, paused))
    .sort(compareSuggestions);

  return candidates.length > 0 ? candidates : [fallbackSuggestion(state)];
}

export function autopilotPaused(moves: AutopilotMove[]): boolean {
  return moves.some((move) => move.kind === "manual_node_selected");
}

function openChallengeCandidates(
  state: AutopilotState,
  claimsById: Map<string, AutopilotClaim>,
): CandidateDraft[] {
  return state.edges
    .filter((edge) => isChallengeEdge(edge) && edge.status === "active" && !hasChallengeResponse(state.moves, edge.id))
    .map((edge) => {
      const target = claimsById.get(edge.toClaimId);
      const confidence = target?.confidence ?? 60;

      return {
        action: "respond_to_challenge",
        title: "Answer the open challenge",
        rationale: `Defend, Revise, or Absorb "${clipText(target?.text ?? edge.toClaimId, 140)}".`,
        whyChosen: [
          "An active challenge blocks the seed -> challenge -> response loop.",
          "Defend, Revise, or Absorb creates the next meaningful Move without silently mutating truth.",
          "The target claim stays unchanged unless the user explicitly chooses Revise.",
        ],
        score: 120 + confidencePressure(confidence),
        targetClaimId: edge.toClaimId,
        challengeEdgeId: edge.id,
        artifactKind: null,
      };
    });
}

function challengeBriefCandidates(state: AutopilotState): CandidateDraft[] {
  const latestResponse = latestMove(state.moves.filter((move) => challengeResponseKinds.has(move.kind)));

  if (!latestResponse) {
    return [];
  }

  const hasFreshBrief = state.artifacts.some(
    (artifact) => challengeBriefKinds.has(artifact.kind) && artifact.createdAt >= latestResponse.createdAt,
  );

  if (hasFreshBrief) {
    return [];
  }

  return [
    {
      action: "compile_challenge_brief",
      title: "Compile the Challenge Brief",
      rationale: "The challenge has a user response, so the session can produce a usable Challenge Brief artifact.",
      whyChosen: [
        "The first loop should end with an artifact the user can use.",
        "The brief is compiled from claims, edges, and moves rather than becoming source of truth.",
        "No current Challenge Brief artifact exists after the latest challenge response.",
      ],
      score: 110,
      targetClaimId: firstStringPayloadValue(latestResponse.payload, "targetClaimId"),
      challengeEdgeId: firstStringPayloadValue(latestResponse.payload, "challengeEdgeId"),
      artifactKind: "challenge_brief",
    },
  ];
}

function assumptionCandidates(state: AutopilotState): CandidateDraft[] {
  return state.claims
    .filter((claim) => claim.kind === "assumption" && claim.status === "exploratory")
    .map((claim) => {
      const dependencyCount = state.edges.filter((edge) => edge.kind === "depends_on" && edge.toClaimId === claim.id).length;

      return {
        action: "review_assumption",
        title: "Review the weakest assumption",
        rationale: `Confirm, reject, or refine "${clipText(claim.text, 140)}".`,
        whyChosen: [
          "Assumptions are claims connected by depends_on edges, so unresolved assumptions can weaken the map.",
          `${claim.confidence}% confidence leaves enough uncertainty to deserve user review.`,
          dependencyCount > 0
            ? `${dependencyCount} dependent claim${dependencyCount === 1 ? "" : "s"} rely on this assumption.`
            : "The assumption is still exploratory and has not been accepted or rejected.",
        ],
        score: 82 + confidencePressure(claim.confidence) + dependencyCount * 8,
        targetClaimId: claim.id,
        challengeEdgeId: firstEdgeForClaim(state.edges, claim.id)?.id ?? null,
        artifactKind: null,
      };
    });
}

function absorbedRiskCandidates(
  state: AutopilotState,
  claimsById: Map<string, AutopilotClaim>,
): CandidateDraft[] {
  return state.edges
    .filter((edge) => isChallengeEdge(edge) && edge.status === "acknowledged_vulnerability")
    .map((edge) => {
      const target = claimsById.get(edge.toClaimId);

      return {
        action: "revisit_absorbed_risk",
        title: "Revisit absorbed risk",
        rationale: `Decide whether the absorbed critique still changes "${clipText(target?.text ?? edge.toClaimId, 140)}".`,
        whyChosen: [
          "Absorb keeps the critique as an acknowledged vulnerability rather than deleting it.",
          "Revisiting the risk before synthesis protects the Challenge Brief from stale confidence.",
          "The target claim should still change only through an explicit revision or confidence acceptance.",
        ],
        score: 78 + confidencePressure(target?.confidence ?? 60),
        targetClaimId: edge.toClaimId,
        challengeEdgeId: edge.id,
        artifactKind: null,
      };
    });
}

function claimChallengeCandidates(state: AutopilotState): CandidateDraft[] {
  return state.claims
    .filter((claim) => claim.kind !== "concept" && claim.status !== "resolved" && claim.status !== "rejected")
    .filter((claim) => !state.edges.some((edge) => isChallengeEdge(edge) && edge.toClaimId === claim.id && edge.status === "active"))
    .map((claim) => {
      const outgoingDependencies = state.edges.filter((edge) => edge.kind === "depends_on" && edge.fromClaimId === claim.id).length;

      return {
        action: "challenge_claim",
        title: "Challenge the weakest claim",
        rationale: `Pressure-test "${clipText(claim.text, 140)}".`,
        whyChosen: [
          "No open challenge currently blocks the loop.",
          "The claim is still eligible for Challenge / Verify pressure.",
          outgoingDependencies > 0
            ? `${outgoingDependencies} dependenc${outgoingDependencies === 1 ? "y" : "ies"} make this claim structurally load-bearing.`
            : "Its confidence and status make it the next best target.",
        ],
        score: 60 + confidencePressure(claim.confidence) + outgoingDependencies * 6,
        targetClaimId: claim.id,
        challengeEdgeId: null,
        artifactKind: null,
      };
    });
}

function materializeCandidate(candidate: CandidateDraft, paused: boolean): AutopilotSuggestion {
  return {
    ...candidate,
    id: stableSuggestionId(candidate),
    autopilotPaused: paused,
    goThereLabel: goThereLabel(candidate.action),
  };
}

function fallbackSuggestion(state: AutopilotState): AutopilotSuggestion {
  return {
    id: `inspect_map:${state.sessionId}`,
    action: "inspect_map",
    title: "Inspect the thought map",
    rationale: "No higher-leverage challenge, assumption review, or artifact step is available yet.",
    whyChosen: [
      "Autopilot found no open challenge, unresolved assumption, absorbed risk, or stale missing brief.",
      "The next safe move is focus selection, not silent truth mutation.",
    ],
    score: 0,
    autopilotPaused: autopilotPaused(state.moves),
    targetClaimId: state.claims[0]?.id ?? null,
    challengeEdgeId: null,
    artifactKind: null,
    goThereLabel: "Inspect map",
  };
}

function compareSuggestions(left: AutopilotSuggestion, right: AutopilotSuggestion): number {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  const leftOrder = actionOrder.get(left.action) ?? 99;
  const rightOrder = actionOrder.get(right.action) ?? 99;

  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return left.id.localeCompare(right.id);
}

function stableSuggestionId(candidate: CandidateDraft): string {
  return [candidate.action, candidate.targetClaimId, candidate.challengeEdgeId, candidate.artifactKind]
    .filter((part): part is string => Boolean(part))
    .join(":");
}

function goThereLabel(action: AutopilotAction): string {
  switch (action) {
    case "respond_to_challenge":
      return "Go to challenge";
    case "compile_challenge_brief":
      return "Go to brief";
    case "review_assumption":
      return "Go to assumption";
    case "revisit_absorbed_risk":
      return "Go to risk";
    case "challenge_claim":
      return "Go to claim";
    case "inspect_map":
      return "Go there";
  }
}

function hasChallengeResponse(moves: AutopilotMove[], edgeId: string): boolean {
  return moves.some((move) => {
    if (!challengeResponseKinds.has(move.kind)) {
      return false;
    }

    return stringArrayPayloadValue(move.payload, "edgeIds").includes(edgeId) || firstStringPayloadValue(move.payload, "challengeEdgeId") === edgeId;
  });
}

function latestMove(moves: AutopilotMove[]): AutopilotMove | null {
  return [...moves].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null;
}

function firstEdgeForClaim(edges: AutopilotEdge[], claimId: string): AutopilotEdge | undefined {
  return edges.find((edge) => edge.fromClaimId === claimId || edge.toClaimId === claimId);
}

function isChallengeEdge(edge: AutopilotEdge): boolean {
  return edge.kind === "challenges" || edge.kind === "contradicts";
}

function confidencePressure(confidence: number): number {
  return Math.max(0, Math.min(100, 100 - confidence)) / 2;
}

function firstStringPayloadValue(payload: unknown, key: string): string | null {
  const value = objectRecord(payload)[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArrayPayloadValue(payload: unknown, key: string): string[] {
  const value = objectRecord(payload)[key];

  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function clipText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 3).trimEnd()}...`;
}
