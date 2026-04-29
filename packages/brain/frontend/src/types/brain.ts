export type ClaimStatus = "exploratory" | "committed" | "rejected" | "resolved" | string;

export interface BrainClaim {
  id: string;
  text: string;
  kind: string;
  status: ClaimStatus;
  confidence?: number;
  seedId?: string;
}

export interface BrainEdge {
  id: string;
  kind: string;
  fromClaimId: string;
  toClaimId: string;
  label?: string;
  status?: string;
}

export interface ExplorationPath {
  title: string;
  prompt?: string;
  expectedValue?: string;
}

export interface LearnCandidate {
  term: string;
  unblockExplanation: string;
  whyItMatters: string;
}

export interface ChallengeSuggestion {
  targetClaimId?: string;
  weakestPart?: string;
  failureType?: string;
  strength?: string;
  challenge?: string;
  responseOptions?: string[];
}

export interface BrainSession {
  id: string;
  status: string;
}

export interface BrainRun {
  status?: string;
  operation?: string;
}

export interface BrainData {
  ideaMap?: {
    claims?: BrainClaim[];
    edges?: BrainEdge[];
    keyInsight?: string;
  };
  source?: {
    kind?: string;
    rawText?: string;
  };
  explorationPaths?: ExplorationPath[];
  learnCandidates?: LearnCandidate[];
  firstChallenge?: ChallengeSuggestion;
  session?: BrainSession;
  brainRun?: BrainRun;
}

export interface BrainMove {
  id: string;
  type?: string;
  kind?: string;
  actor?: string;
  summary: string;
  createdAt?: string;
}

export interface AutopilotSuggestion {
  id?: string;
  candidateId: string;
  action: string;
  mode: string;
  label: string;
  primaryActionLabel: string;
  targetClaimId: string | null;
  targetEdgeId: string | null;
  score: number;
  why: string;
  reasonCodes?: string[];
  exitCriteria: NextMoveExitCriteria;
}

export interface AutopilotTickData {
  status: "ready" | "paused" | "empty" | string;
  sessionId: string;
  suggestion: AutopilotSuggestion | null;
  candidates?: AutopilotSuggestion[];
  selectedCandidate?: AutopilotSuggestion | null;
  focusState?: FocusState;
  move?: {
    id: string;
    kind: string;
    summary: string;
    claimIds?: string[];
    edgeIds?: string[];
    artifactIds?: string[];
  } | null;
  pause?: {
    paused: boolean;
    manualMoveId: string | null;
    focusedClaimId: string | null;
    pausedAt: string | null;
  };
}

export interface AutopilotTickResponse {
  data: AutopilotTickData;
}

export interface ManualNodeSelectionResponse {
  data: {
    status: "paused";
    brainId?: string;
    sessionId: string;
    focusState?: FocusState;
    focusClaim: BrainClaim;
    move: {
      id: string;
      kind: "manual_node_selected";
      summary: string;
      claimIds?: string[];
      edgeIds?: string[];
      artifactIds?: string[];
    };
    pause?: {
      paused: true;
      manualMoveId: string;
      focusedClaimId: string;
      pausedAt: string;
    };
  };
}

export interface SeedBrainResponse {
  data: BrainData;
}

export interface SessionMovesResponse {
  data: {
    moves: BrainMove[];
  };
}

export interface FocusState {
  sessionId: string;
  mode: string;
  focusedClaimId: string | null;
  focusedEdgeId: string | null;
  source: string;
  suggestionMoveId: string | null;
  manualMoveId: string | null;
  paused: boolean;
  reason: string | null;
  updatedAt: string | null;
}

export interface NextMoveExitCriteria {
  label: string;
  acceptedMoveKinds: string[];
}

export interface ThinkingModeCandidate {
  id: string;
  candidateId: string;
  action: string;
  mode: string;
  targetClaimId: string | null;
  targetEdgeId: string | null;
  score: number;
  reason: string;
  reasonCodes?: string[];
  exitCriteria?: NextMoveExitCriteria;
  selected?: boolean;
}

export interface ThinkingModeStateData {
  status: "ready" | "paused" | "empty" | string;
  brainId?: string;
  sessionId: string;
  focusState: FocusState;
  candidates: ThinkingModeCandidate[];
  selectedCandidate: ThinkingModeCandidate | null;
  move?: {
    id: string;
    kind: string;
    summary: string;
    payload?: Record<string, unknown>;
    createdAt?: string;
  } | null;
  persistedMoveIds?: string[];
}

export interface StartNextMoveResponse {
  data: {
    status: "started";
    brainId?: string;
    sessionId: string;
    focusState: FocusState;
    selectedCandidate: ThinkingModeCandidate;
    move: {
      id: string;
      kind: "autopilot_focus_started";
      summary: string;
      payload?: Record<string, unknown>;
      createdAt?: string;
    };
  };
}

export interface SessionCockpitData {
  session: BrainSession;
  ideaMap: {
    claims: BrainClaim[];
    edges: BrainEdge[];
    keyInsight?: string | null;
  };
  moves: BrainMove[];
  autopilot: AutopilotTickData;
  activeChallenge: (ChallengeSuggestion & {
    id: string;
    critique?: string;
    targetClaim?: BrainClaim | null;
    critiqueClaim?: BrainClaim | null;
  }) | null;
  latestArtifact?: {
    id: string;
    kind: string;
    title: string;
    summary: string;
    payload?: Record<string, unknown>;
    createdAt?: string;
  } | null;
}

export interface SessionCockpitResponse {
  data: SessionCockpitData;
}
