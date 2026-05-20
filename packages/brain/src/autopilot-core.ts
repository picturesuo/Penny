export type AutopilotAction =
  | "respond_to_challenge"
  | "review_assumption"
  | "challenge_claim"
  | "verify_confidence"
  | "revisit_absorbed_risk"
  | "create_challenge_brief"
  | "explore_claim";

export type AutopilotMode = "brain" | "challenge" | "verify" | "artifact";

export type AutopilotClaimKind = "belief" | "assumption" | "question" | "concept";
export type AutopilotClaimStatus = "exploratory" | "committed" | "resolved" | "rejected";
export type AutopilotEdgeKind =
  | "depends_on"
  | "supports"
  | "questions"
  | "challenges"
  | "contradicts"
  | "clarifies"
  | "teaches";
export type AutopilotEdgeStatus = "active" | "acknowledged_vulnerability";

export type AutopilotSession = {
  id: string;
  userId?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
  sphereId?: string | null;
  status: "open" | "completed";
  createdAt: Date | string;
};

export type AutopilotClaim = {
  id: string;
  sessionId: string;
  versionId: string;
  kind: AutopilotClaimKind;
  status: AutopilotClaimStatus;
  text: string;
  confidence: number;
  createdAt: Date | string;
  updatedAt?: Date | string;
};

export type AutopilotEdge = {
  id: string;
  sessionId: string;
  fromClaimId: string;
  toClaimId: string;
  kind: AutopilotEdgeKind;
  status: AutopilotEdgeStatus;
  label: string | null;
  createdAt: Date | string;
};

export type AutopilotMove = {
  id: string;
  sessionId: string;
  kind: string;
  summary?: string;
  payload: unknown;
  createdAt: Date | string;
};

export type AutopilotArtifact = {
  id: string;
  sessionId: string;
  kind: "idea_map" | "challenge_brief" | "idea_map_challenge_brief" | string;
  createdAt: Date | string;
};

export type AutopilotState = {
  session: AutopilotSession;
  sessionId?: string;
  claims: AutopilotClaim[];
  edges: AutopilotEdge[];
  moves: AutopilotMove[];
  artifacts: AutopilotArtifact[];
};

export type AutopilotSuggestion = {
  id: string;
  action: AutopilotAction;
  mode: AutopilotMode;
  title: string;
  label: string;
  rationale: string;
  why: string;
  whyChosen: string[];
  reasonCodes: string[];
  score: number;
  priority: number;
  autopilotPaused: boolean;
  targetClaimId: string | null;
  challengeEdgeId: string | null;
  targetEdgeId: string | null;
  artifactKind: AutopilotArtifact["kind"] | null;
  goThereLabel: string;
  goThere: {
    label: "Go there";
    targetClaimId: string | null;
    targetEdgeId: string | null;
    mode: AutopilotMode;
  };
};

export type AutopilotCandidate = AutopilotSuggestion;

export type AutopilotRanking = {
  status: "ready" | "empty";
  suggestion: AutopilotSuggestion | null;
  candidates: AutopilotCandidate[];
};

export type AutopilotPauseState = {
  paused: boolean;
  manualMoveId: string | null;
  focusedClaimId: string | null;
  pausedAt: string | null;
};

export type AutopilotRecommendationSuggestion = AutopilotSuggestion & {
  blockedByManualOverride: boolean;
};
export type AutopilotCompletionSuggestion = Omit<AutopilotRecommendationSuggestion, "action"> & {
  action: "session_complete";
};

export type AutopilotRecommendation = {
  mode: "running" | "paused" | "complete";
  selected: AutopilotRecommendationSuggestion | AutopilotCompletionSuggestion;
  candidates: Array<AutopilotRecommendationSuggestion | AutopilotCompletionSuggestion>;
  rationale: string;
  pausedByMoveId: string | null;
};

type CandidateDraft = {
  action: AutopilotAction;
  mode: AutopilotMode;
  title: string;
  rationale: string;
  whyChosen: string[];
  reasonCodes: string[];
  score: number;
  priority: number;
  targetClaimId: string | null;
  targetEdgeId: string | null;
  artifactKind: AutopilotArtifact["kind"] | null;
};

const challengeResponseKinds = new Set([
  "user_defended",
  "claim_revised",
  "critique_absorbed",
  "challenge.response.defended",
  "challenge.response.revised",
  "challenge.response.absorbed",
]);
const challengeBriefKinds = new Set(["challenge_brief", "idea_map_challenge_brief"]);

export function chooseAutopilotSuggestion(state: AutopilotState): AutopilotSuggestion {
  return rankAutopilotMoves(state).suggestion ?? fallbackSuggestion(state);
}

export function rankAutopilotMoves(state: AutopilotState): AutopilotRanking {
  const pause = getAutopilotPauseState(state.moves);
  const claims = state.claims.filter((claim) => claim.status !== "rejected").sort(rowDateSort);
  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));
  const responseEdgeIds = challengeResponseEdgeIds(state.moves);
  const candidates = [
    ...openChallengeCandidates(state, claimsById, responseEdgeIds),
    ...assumptionReviewCandidates(state, claims, claimsById),
    ...absorbedRiskCandidates(state, claimsById),
    ...challengeBriefCandidates(state, claimsById, responseEdgeIds),
    ...claimChallengeCandidates(state, claims),
    ...confidenceVerificationCandidates(state, claims),
    ...explorationFallbackCandidates(claims),
  ]
    .map((candidate) => materializeCandidate(candidate, pause.paused))
    .sort(compareSuggestions);

  return {
    status: candidates.length > 0 ? "ready" : "empty",
    suggestion: candidates[0] ?? null,
    candidates,
  };
}

export function recommendAutopilotMove(state: AutopilotState): AutopilotRecommendation {
  const pause = getAutopilotPauseState(state.moves);
  const ranking = rankAutopilotMoves(state);
  const candidates = ranking.candidates.map((candidate) => ({
    ...candidate,
    blockedByManualOverride: pause.paused,
  }));

  if (candidates.length === 0 && hasChallengeBrief(state.artifacts)) {
    const selected = {
      ...completeSuggestion(state),
      action: "session_complete" as const,
      blockedByManualOverride: pause.paused,
    };

    return {
      mode: "complete",
      selected,
      candidates: [selected],
      rationale: "The session already has a Challenge Brief and no unresolved Autopilot pressure point remains.",
      pausedByMoveId: pause.manualMoveId,
    };
  }

  const selected = candidates[0] ?? {
    ...fallbackSuggestion(state),
    blockedByManualOverride: pause.paused,
  };

  return {
    mode: pause.paused ? "paused" : "running",
    selected,
    candidates: candidates.length > 0 ? candidates : [selected],
    rationale: pause.paused
      ? `Autopilot is paused because the user manually selected a node in move ${pause.manualMoveId}.`
      : selected.rationale,
    pausedByMoveId: pause.manualMoveId,
  };
}

export function autopilotPaused(moves: AutopilotMove[]): boolean {
  return getAutopilotPauseState(moves).paused;
}

export function getAutopilotPauseState(moves: AutopilotMove[]): AutopilotPauseState {
  const latestManual = latestMove(moves.filter((move) => move.kind === "manual_node_selected"));
  const latestSuggestion = latestMove(moves.filter((move) => move.kind === "autopilot_suggested"));

  if (!latestManual) {
    return {
      paused: false,
      manualMoveId: null,
      focusedClaimId: null,
      pausedAt: null,
    };
  }

  const pause = {
    manualMoveId: latestManual.id,
    focusedClaimId: firstStringPayloadValue(latestManual.payload, "claimId"),
    pausedAt: new Date(timeValue(latestManual.createdAt)).toISOString(),
  };

  if (latestSuggestion && timeValue(latestSuggestion.createdAt) > timeValue(latestManual.createdAt)) {
    return {
      paused: false,
      ...pause,
    };
  }

  return {
    paused: true,
    ...pause,
  };
}

function openChallengeCandidates(
  state: AutopilotState,
  claimsById: Map<string, AutopilotClaim>,
  responseEdgeIds: Set<string>,
): CandidateDraft[] {
  return state.edges
    .filter((edge) => isChallengeEdge(edge) && edge.status === "active" && !responseEdgeIds.has(edge.id))
    .flatMap((edge) => {
      const target = claimsById.get(edge.toClaimId);

      if (!target) {
        return [];
      }

      return [
        {
          action: "respond_to_challenge",
          mode: "challenge",
          title: "Answer open challenge",
          rationale: `Defend, Revise, or Absorb "${clipText(target.text, 140)}".`,
          whyChosen: [
            "An active challenge blocks the seed -> challenge -> response loop.",
            "Defend, Revise, or Absorb creates the next meaningful Move without silently mutating truth.",
            "The target claim stays unchanged unless the user explicitly chooses Revise.",
          ],
          reasonCodes: ["open_challenge", "defend_revise_absorb_required", ...edgeReasonCodes(edge)],
          score: 1_000 + dependencyPressure(state.edges, target.id) * 24 + confidenceRisk(target.confidence),
          priority: 1,
          targetClaimId: target.id,
          targetEdgeId: edge.id,
          artifactKind: null,
        },
      ];
    });
}

function assumptionReviewCandidates(
  state: AutopilotState,
  claims: AutopilotClaim[],
  claimsById: Map<string, AutopilotClaim>,
): CandidateDraft[] {
  return claims
    .filter((claim) => claim.kind === "assumption" && claim.status === "exploratory")
    .map((claim) => {
      const dependencyCount = state.edges.filter((edge) => edge.kind === "depends_on" && edge.toClaimId === claim.id).length;

      return {
        action: "review_assumption",
        mode: "brain",
        title: "Review load-bearing assumption",
        rationale: `Confirm, reject, or refine "${clipText(claim.text, 140)}".`,
        whyChosen: [
          "Assumptions are claims connected by depends_on edges, so unresolved assumptions can weaken the map.",
          `${claim.confidence}% confidence leaves enough uncertainty to deserve user review.`,
          dependencyCount > 0
            ? `${dependencyCount} dependent claim${dependencyCount === 1 ? "" : "s"} rely on this assumption.`
            : "The assumption is still exploratory and has not been accepted or rejected.",
        ],
        reasonCodes: ["unreviewed_assumption", "load_bearing_check"],
        score: 820 + dependencyCount * 22 + confidenceRisk(claim.confidence),
        priority: 2,
        targetClaimId: claim.id,
        targetEdgeId: firstConnectedEdgeId(state.edges, claim.id),
        artifactKind: null,
      } satisfies CandidateDraft;
    })
    .filter((candidate) => claimsById.has(candidate.targetClaimId ?? ""));
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
        mode: "challenge",
        title: "Revisit absorbed risk",
        rationale: `Decide whether the absorbed critique still changes "${clipText(target?.text ?? edge.toClaimId, 140)}".`,
        whyChosen: [
          "Absorb keeps the critique as an acknowledged vulnerability rather than deleting it.",
          "Revisiting the risk before synthesis protects the Challenge Brief from stale confidence.",
          "The target claim should still change only through an explicit revision or confidence acceptance.",
        ],
        reasonCodes: ["acknowledged_vulnerability", "risk_revisit"],
        score: 760 + confidenceRisk(target?.confidence ?? 60),
        priority: 3,
        targetClaimId: edge.toClaimId,
        targetEdgeId: edge.id,
        artifactKind: null,
      };
    });
}

function challengeBriefCandidates(
  state: AutopilotState,
  claimsById: Map<string, AutopilotClaim>,
  responseEdgeIds: Set<string>,
): CandidateDraft[] {
  const latestResponse = latestMove(state.moves.filter((move) => challengeResponseKinds.has(move.kind)));

  if (!latestResponse) {
    return [];
  }

  const hasFreshBrief = state.artifacts.some(
    (artifact) => challengeBriefKinds.has(artifact.kind) && timeValue(artifact.createdAt) >= timeValue(latestResponse.createdAt),
  );

  if (hasFreshBrief) {
    return [];
  }

  const respondedEdge =
    [...state.edges]
      .filter((edge) => isChallengeEdge(edge) && responseEdgeIds.has(edge.id))
      .sort(rowDateSort)
      .at(-1) ?? null;
  const targetClaimId = respondedEdge?.toClaimId ?? firstStringPayloadValue(latestResponse.payload, "targetClaimId");
  const target = targetClaimId ? claimsById.get(targetClaimId) : null;

  return [
    {
      action: "create_challenge_brief",
      mode: "artifact",
      title: "Create Challenge Brief",
      rationale: target
        ? `Compile the Challenge Brief for "${clipText(target.text, 140)}".`
        : "The challenge has a user response, so the session can produce a usable Challenge Brief artifact.",
      whyChosen: [
        "The first loop should end with an artifact the user can use.",
        "The brief is compiled from claims, edges, and moves rather than becoming source of truth.",
        "No current Challenge Brief artifact exists after the latest challenge response.",
      ],
      reasonCodes: ["challenge_response_recorded", "brief_missing"],
      score: 780,
      priority: 4,
      targetClaimId,
      targetEdgeId: respondedEdge?.id ?? firstStringPayloadValue(latestResponse.payload, "challengeEdgeId"),
      artifactKind: "challenge_brief",
    },
  ];
}

function claimChallengeCandidates(state: AutopilotState, claims: AutopilotClaim[]): CandidateDraft[] {
  const responseEdgeIds = challengeResponseEdgeIds(state.moves);

  return claims
    .filter((claim) => claim.kind !== "concept" && claim.status === "exploratory")
    .filter(
      (claim) =>
        !state.edges.some(
          (edge) => isChallengeEdge(edge) && edge.toClaimId === claim.id && edge.status === "active" && !responseEdgeIds.has(edge.id),
        ),
    )
    .map((claim) => {
      const outgoingDependencies = state.edges.filter((edge) => edge.kind === "depends_on" && edge.fromClaimId === claim.id).length;

      return {
        action: "challenge_claim",
        mode: "challenge",
        title: "Challenge the weakest claim",
        rationale: `Pressure-test "${clipText(claim.text, 140)}".`,
        whyChosen: [
          "No open challenge currently blocks the loop.",
          "The claim is still eligible for Challenge / Verify pressure.",
          outgoingDependencies > 0
            ? `${outgoingDependencies} dependenc${outgoingDependencies === 1 ? "y" : "ies"} make this claim structurally load-bearing.`
            : "Its confidence and status make it the next best target.",
        ],
        reasonCodes: ["exploratory_claim", "no_active_challenge"],
        score: 700 + outgoingDependencies * 20 + confidenceRisk(claim.confidence),
        priority: 5,
        targetClaimId: claim.id,
        targetEdgeId: firstConnectedEdgeId(state.edges, claim.id),
        artifactKind: null,
      };
    });
}

function confidenceVerificationCandidates(state: AutopilotState, claims: AutopilotClaim[]): CandidateDraft[] {
  return claims
    .filter((claim) => claim.status !== "rejected")
    .filter((claim) => claim.confidence >= 85 || claim.confidence <= 45)
    .map((claim) => {
      const highConfidence = claim.confidence >= 85;

      return {
        action: "verify_confidence",
        mode: "verify",
        title: highConfidence ? "Verify high confidence" : "Test low confidence",
        rationale: `Test whether "${clipText(claim.text, 140)}" still deserves ${claim.confidence}% confidence.`,
        whyChosen: [
          "Autopilot may suggest confidence work, but it may not silently mutate confidence.",
          "Any confidence change still requires explicit user acceptance.",
        ],
        reasonCodes: [highConfidence ? "high_confidence_soft_challenge" : "low_confidence_attention"],
        score: 640 + (highConfidence ? claim.confidence - 84 : 46 - claim.confidence) * 5,
        priority: 6,
        targetClaimId: claim.id,
        targetEdgeId: firstConnectedEdgeId(state.edges, claim.id),
        artifactKind: null,
      };
    });
}

function explorationFallbackCandidates(claims: AutopilotClaim[]): CandidateDraft[] {
  return claims
    .filter((claim) => claim.status === "exploratory")
    .map((claim) => ({
      action: "explore_claim",
      mode: "brain",
      title: "Explore claim",
      rationale: `Inspect "${clipText(claim.text, 140)}" and decide whether it needs challenge, verification, or Learn.`,
      whyChosen: [
        "No higher-leverage challenge, assumption review, or artifact step is available for this claim.",
        "Focus selection is safe because it does not mutate truth.",
      ],
      reasonCodes: ["fallback_exploration"],
      score: 500 + confidenceRisk(claim.confidence),
      priority: 7,
      targetClaimId: claim.id,
      targetEdgeId: null,
      artifactKind: null,
    }));
}

function materializeCandidate(candidate: CandidateDraft, paused: boolean): AutopilotSuggestion {
  return {
    ...candidate,
    id: stableSuggestionId(candidate),
    label: candidate.title,
    why: candidate.rationale,
    autopilotPaused: paused,
    challengeEdgeId: candidate.targetEdgeId,
    goThereLabel: goThereLabel(candidate.action),
    goThere: {
      label: "Go there",
      targetClaimId: candidate.targetClaimId,
      targetEdgeId: candidate.targetEdgeId,
      mode: candidate.mode,
    },
  };
}

function fallbackSuggestion(state: AutopilotState): AutopilotSuggestion {
  return materializeCandidate(
    {
      action: "explore_claim",
      mode: "brain",
      title: "Inspect the thought map",
      rationale: "No higher-leverage challenge, assumption review, or artifact step is available yet.",
      whyChosen: [
        "Autopilot found no open challenge, unresolved assumption, absorbed risk, or stale missing brief.",
        "The next safe move is focus selection, not silent truth mutation.",
      ],
      reasonCodes: ["fallback_exploration"],
      score: 0,
      priority: 99,
      targetClaimId: state.claims[0]?.id ?? null,
      targetEdgeId: null,
      artifactKind: null,
    },
    autopilotPaused(state.moves),
  );
}

function completeSuggestion(state: AutopilotState): AutopilotSuggestion {
  return materializeCandidate(
    {
      action: "explore_claim",
      mode: "artifact",
      title: "Session complete",
      rationale: "The session has a Challenge Brief and no unresolved Autopilot candidate.",
      whyChosen: [
        "A Challenge Brief artifact exists.",
        "No open challenge, exploratory assumption, absorbed risk, or exploratory claim remains.",
      ],
      reasonCodes: ["session_complete"],
      score: 0,
      priority: 100,
      targetClaimId: state.claims[0]?.id ?? null,
      targetEdgeId: null,
      artifactKind: "challenge_brief",
    },
    autopilotPaused(state.moves),
  );
}

function compareSuggestions(left: AutopilotSuggestion, right: AutopilotSuggestion): number {
  return right.score - left.score || left.priority - right.priority || left.id.localeCompare(right.id);
}

function stableSuggestionId(candidate: CandidateDraft): string {
  return [candidate.action, candidate.targetClaimId, candidate.targetEdgeId, candidate.artifactKind]
    .filter((part): part is string => Boolean(part))
    .join(":");
}

function goThereLabel(action: AutopilotAction): string {
  switch (action) {
    case "respond_to_challenge":
      return "Go to challenge";
    case "create_challenge_brief":
      return "Go to brief";
    case "review_assumption":
      return "Go to assumption";
    case "revisit_absorbed_risk":
      return "Go to risk";
    case "challenge_claim":
      return "Go to claim";
    case "verify_confidence":
      return "Go verify";
    case "explore_claim":
      return "Go there";
  }
}

function challengeResponseEdgeIds(moves: AutopilotMove[]): Set<string> {
  const edgeIds = new Set<string>();

  for (const move of moves) {
    if (!challengeResponseKinds.has(move.kind)) {
      continue;
    }

    for (const edgeId of stringArrayPayloadValue(move.payload, "edgeIds")) {
      edgeIds.add(edgeId);
    }

    const challengeEdgeId = firstStringPayloadValue(move.payload, "challengeEdgeId");

    if (challengeEdgeId) {
      edgeIds.add(challengeEdgeId);
    }
  }

  return edgeIds;
}

function hasChallengeBrief(artifacts: AutopilotArtifact[]): boolean {
  return artifacts.some((artifact) => challengeBriefKinds.has(artifact.kind));
}

function latestMove(moves: AutopilotMove[]): AutopilotMove | null {
  return [...moves].sort((left, right) => timeValue(right.createdAt) - timeValue(left.createdAt) || right.id.localeCompare(left.id))[0] ?? null;
}

function dependencyPressure(edges: AutopilotEdge[], claimId: string): number {
  return edges.filter(
    (edge) =>
      edge.status === "active" &&
      (edge.toClaimId === claimId || edge.fromClaimId === claimId) &&
      ["depends_on", "supports", "challenges", "contradicts"].includes(edge.kind),
  ).length;
}

function confidenceRisk(confidence: number): number {
  if (confidence >= 85) {
    return (confidence - 84) * 5;
  }

  if (confidence <= 55) {
    return (56 - confidence) * 4;
  }

  return Math.round(Math.abs(65 - confidence) / 4);
}

function edgeReasonCodes(edge: AutopilotEdge): string[] {
  return edge.label ? [`failure_type:${edge.label}`] : [];
}

function firstConnectedEdgeId(edges: AutopilotEdge[], claimId: string): string | null {
  return [...edges].sort(rowDateSort).find((edge) => edge.fromClaimId === claimId || edge.toClaimId === claimId)?.id ?? null;
}

function isChallengeEdge(edge: AutopilotEdge): boolean {
  return edge.kind === "challenges" || edge.kind === "contradicts";
}

function rowDateSort<Row extends { createdAt: Date | string; id?: string }>(left: Row, right: Row): number {
  return timeValue(left.createdAt) - timeValue(right.createdAt) || stableRowId(left).localeCompare(stableRowId(right));
}

function stableRowId(row: { id?: string }): string {
  return row.id ?? "";
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

function timeValue(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function clipText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 3).trimEnd()}...`;
}
