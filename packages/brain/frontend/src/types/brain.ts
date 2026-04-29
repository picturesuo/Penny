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
  type: string;
  kind?: string;
  actor?: string;
  summary: string;
  createdAt?: string;
}

export interface AutopilotSuggestion {
  action: string;
  mode: string;
  label: string;
  targetClaimId: string | null;
  targetEdgeId: string | null;
  score: number;
  why: string;
  reasonCodes?: string[];
  goThere?: {
    label: "Go there";
    targetClaimId: string | null;
    targetEdgeId: string | null;
    mode: string;
  };
}

export interface AutopilotTickData {
  status: "ready" | "paused" | "empty" | string;
  sessionId: string;
  suggestion: AutopilotSuggestion | null;
  candidates?: AutopilotSuggestion[];
  move?: {
    id: string;
    kind: string;
    summary: string;
    claimIds: string[];
    edgeIds: string[];
    artifactIds: string[];
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
    sessionId: string;
    focusClaim: BrainClaim;
    move: {
      id: string;
      kind: "manual_node_selected";
      summary: string;
      claimIds: string[];
      edgeIds: string[];
      artifactIds: string[];
    };
    pause: {
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
