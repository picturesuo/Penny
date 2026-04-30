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
  id?: string;
  status?: "open" | "responded" | string;
  response?: ChallengeResponseKind | null;
  targetClaimId?: string;
  weakestPart?: string;
  failureType?: string;
  strength?: string;
  challenge?: string;
  critique?: string;
  whatWouldResolveIt?: string;
  responseOptions?: string[];
  targetClaim?: BrainClaim | null;
  critiqueClaim?: BrainClaim | null;
}

export interface BrainSession {
  id: string;
  status: string;
}

export interface BrainRun {
  status?: string;
  operation?: string;
}

export interface BrainDocumentClaim {
  id: string;
  kind: string;
  status: ClaimStatus;
  text: string;
  confidence: number;
  versionId: string;
  createdAt: string;
}

export interface BrainDocumentSummary {
  id: string;
  sessionId: string;
  title: string;
  status: string;
  originalIdea: string | null;
  mainClaim: BrainDocumentClaim | null;
  confidence: number | null;
  strongestOptions: BrainDocumentClaim[];
  rejectedOptions: BrainDocumentClaim[];
  todoLaterIdeas: string[];
  finalRecommendations: string[];
  nextActions: string[];
  counts: {
    claims: number;
    edges: number;
    moves: number;
    artifacts: number;
    versions: number;
  };
  latestArtifact: {
    id: string;
    kind: string;
    title: string;
    summary: string;
    createdAt: string;
  } | null;
  lastMove: {
    id: string;
    kind: string;
    summary: string;
    createdAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrainDocumentGraphNode {
  id: string;
  type: "document" | "claim" | "risk" | "concept" | string;
  label: string;
  sessionId: string;
  confidence: number | null;
  status: string;
}

export interface BrainDocumentGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  label: string | null;
  sessionId: string;
}

export interface BrainDocumentsData {
  sourceOfTruth: "sessions_sources_claims_claim_versions_edges_moves_artifacts" | string;
  documents: BrainDocumentSummary[];
  graph: {
    nodes: BrainDocumentGraphNode[];
    edges: BrainDocumentGraphEdge[];
  };
  meta: {
    documentCount: number;
    claimCount: number;
    edgeCount: number;
  };
}

export interface BrainDocumentsResponse {
  data: BrainDocumentsData;
}

export interface BrainData {
  ideaMap?: {
    claims?: BrainClaim[];
    edges?: BrainEdge[];
    keyInsight?: string;
  };
  workStructure?: WorkStructure;
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

export type ChallengeResponseKind = "defend" | "revise" | "absorb";
export type ChallengeResponseMoveKind = "user_defended" | "claim_revised" | "critique_absorbed";

export interface ChallengeRound {
  id: string;
  sessionId: string;
  status: "open" | "responded" | string;
  response: ChallengeResponseKind | null;
  targetClaimId: string;
  targetClaimVersionId: string;
  critiqueClaimId: string;
  critiqueClaimVersionId: string;
  challengeEdgeId: string;
  challengeMoveId: string;
  responseMoveId: string | null;
  focusCompletedMoveId: string | null;
  failureType: string;
  strength: string;
  critique: string;
  whyThis: string;
  whatWouldResolveIt: string;
  createdAt: string;
  respondedAt: string | null;
  updatedAt: string;
}

export interface ChallengeMove {
  id: string;
  kind: ChallengeResponseMoveKind | "challenge_issued" | "focus_completed";
  summary: string;
  payload?: Record<string, unknown>;
  createdAt?: string;
}

export interface ChallengeDerivedEffect {
  id: string;
  kind: string;
  status: string;
  version: number;
  title: string;
  summary: string;
  payload?: unknown;
  createdAt: string;
}

export interface ChallengeResponseReceipt {
  response: ChallengeResponseKind;
  moveKind: ChallengeResponseMoveKind;
  targetClaimId: string;
  challengeEdgeId: string;
  previousClaimVersionId: string | null;
  currentClaimVersionId: string;
  claimTextChanged: boolean;
  unresolvedRisk: boolean;
}

export interface ChallengeNextMoveDirective {
  status: "client_tick_required";
  requiredCommand: "tick_autopilot";
  sessionId: string;
  method: "POST";
  endpoint: string;
  body: {
    resume: true;
  };
  reason: string;
  expectedMoveKind: "next_move_recomputed";
}

export interface IssueChallengeResponse {
  data: {
    status: "issued";
    brainId: string;
    sessionId: string;
    challengeRound: ChallengeRound;
    targetClaim: BrainClaim;
    critiqueClaim: BrainClaim;
    critique: string;
    failureType: string;
    strength: string;
    whyThis: string;
    whatWouldResolveIt: string;
    suggestedNextMove: string;
    move: ChallengeMove;
  };
}

export interface RespondToChallengeResponse {
  data: {
    status: "responded";
    challengeRound: ChallengeRound;
    response: ChallengeResponseKind;
    targetClaim: BrainClaim;
    critiqueClaimId: string;
    move: ChallengeMove;
    focusCompletedMove: ChallengeMove;
    derivedEffects: ChallengeDerivedEffect[];
    receipt: ChallengeResponseReceipt;
    nextMove: ChallengeNextMoveDirective;
  };
}

export interface ChallengeBriefSections {
  originalSeedIdea: {
    text: string;
    sourceId: string | null;
  };
  currentPrimaryClaim: {
    claimId: string;
    claimVersionId: string;
    text: string;
    confidence: number;
  };
  keyAssumptions: Array<{
    claimId: string;
    claimVersionId: string;
    text: string;
    confidence: number;
    markers: string[];
  }>;
  selectedPressurePoint: {
    targetClaimId: string;
    targetClaimVersionId: string;
    targetEdgeId: string | null;
    failureType: string | null;
    text: string;
  };
  whyPennyChoseIt: string[];
  challengeIssued: {
    text: string;
    strength: string | null;
    whatWouldResolveIt: string | null;
    challengeMoveId: string | null;
    challengeRoundId: string | null;
  };
  userResponse: {
    text: string;
    response: "Defend" | "Revise" | "Absorb" | null;
    reasoning: string | null;
    moveId: string | null;
  };
  whatChanged: Array<{
    text: string;
    previousClaimVersionId: string | null;
    currentClaimVersionId: string | null;
    moveId: string | null;
  }>;
  openRisks: Array<{
    kind: "challenge" | "assumption" | "unsupported_claim" | "none";
    text: string;
    claimId: string | null;
    edgeId: string | null;
    reason: string;
  }>;
  recommendedNextMove: {
    action: string;
    targetClaimId: string | null;
    targetEdgeId: string | null;
    why: string;
    expectedCompletionMove: string | null;
  };
  moveTimelineSummary: Array<{
    moveId: string;
    kind: string;
    summary: string;
    createdAt: string;
  }>;
}

export interface ChallengeBriefPayload {
  kind: "challenge_brief";
  title: "Challenge Brief";
  sessionId: string;
  sections: ChallengeBriefSections;
  refs?: {
    sourceIds?: string[];
    sourceSpanIds?: string[];
    claimIds?: string[];
    claimVersionIds?: string[];
    edgeIds?: string[];
    moveIds?: string[];
    artifactIds?: string[];
  };
}

export interface ChallengeBriefArtifact {
  id: string;
  sessionId?: string;
  kind: string;
  title: string;
  summary: string;
  payload?: ChallengeBriefPayload | Record<string, unknown>;
  createdAt?: string;
}

export interface ChallengeBriefResponse {
  data: {
    status: "created";
    artifact: ChallengeBriefArtifact & { sessionId: string };
    move: {
      id: string;
      kind: "artifact_created";
      summary: string;
      payload?: Record<string, unknown>;
      createdAt?: string;
    };
    brief?: unknown;
  };
}

export type WorkStructureType = "essay" | "startup" | "research" | "decision" | "general";
export type WorkStructureStepStatus = "not_started" | "active" | "resolved" | "stale";

export interface WorkStructureChoice {
  id: string;
  label: string;
  description: string;
  claimIds: string[];
  edgeIds: string[];
}

export interface WorkStructureStep {
  id: string;
  title: string;
  purpose: string;
  rank: number;
  fragility: number;
  importance: number;
  status: WorkStructureStepStatus;
  claimIds: string[];
  edgeIds: string[];
  whyNow: string;
  detailChoices: WorkStructureChoice[];
}

export interface WorkStructure {
  structureType: WorkStructureType;
  label: string;
  description: string;
  activeStepId: string | null;
  steps: WorkStructureStep[];
}

export interface SessionCockpitData {
  session: BrainSession;
  ideaMap: {
    claims: BrainClaim[];
    edges: BrainEdge[];
    keyInsight?: string | null;
  };
  workStructure?: WorkStructure | null;
  moves: BrainMove[];
  autopilot: AutopilotTickData;
  activeChallenge: (ChallengeSuggestion & {
    id: string;
    critique?: string;
    targetClaim?: BrainClaim | null;
    critiqueClaim?: BrainClaim | null;
  }) | null;
  latestArtifact?: ChallengeBriefArtifact | null;
}

export interface SessionCockpitResponse {
  data: SessionCockpitData;
}

export interface InlineLearnOutput {
  term: string;
  explanation: string;
  whyItMattersHere: string;
  example: string;
  relatedConcepts: string[];
  saveSuggestion: string;
}

export interface InlineLearnResponse {
  data: InlineLearnOutput & {
    brainRun?: {
      id: string;
      status: string;
    };
    saved?: InlineLearnSavedConcept;
  };
}

export interface InlineLearnSaveResponse {
  data: {
    saved: InlineLearnSavedConcept;
  };
}

export interface InlineLearnSavedConcept {
  conceptClaim: {
    id: string;
    versionId: string;
    text: string;
  };
  teachesEdge: {
    id: string;
    fromClaimId: string;
    toClaimId: string;
  };
  move: {
    id: string;
    kind: string;
    summary: string;
  };
}
