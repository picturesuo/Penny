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

export interface BrainGraphPathNode {
  id: string;
  claimId: string;
  label: string;
  role: string;
  kind: string;
  status: ClaimStatus;
  confidence: number;
  depth: number;
  lane: number;
  rank: number;
  moveCount: number;
  edgeIds: string[];
  selected: boolean;
  suggested: boolean;
}

export interface BrainGraphPathEdge {
  id: string;
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  kind: string;
  status: string;
  label: string | null;
}

export interface BrainGraphPath {
  layout: "top_down";
  generatedFrom: "claims_edges_moves" | string;
  focusClaimId: string | null;
  nodes: BrainGraphPathNode[];
  edges: BrainGraphPathEdge[];
  meta: {
    nodeCount: number;
    edgeCount: number;
    maxDepth: number;
  };
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

export type BrainSearchMode = "learn" | "verify" | "check" | "brain" | "autopilot" | string;
export type BrainSearchDepth = "fast" | "deep" | string;

export interface BrainSearchFilters {
  allowedDomains?: string[];
  excludedDomains?: string[];
  recencyDays?: number;
  academic?: boolean;
}

export interface BrainSearchDecision {
  mode: BrainSearchMode;
  useWebSearch: boolean;
  depth: BrainSearchDepth;
  reason: string;
  reasonCodes: string[];
  signals: string[];
  query: string;
  filters: BrainSearchFilters;
}

export interface BrainSearchTraceResult {
  title: string | null;
  url: string | null;
  snippet: string | null;
  sourceType: string | null;
}

export interface BrainSearchTrace {
  mode: BrainSearchMode;
  decision: BrainSearchDecision;
  providerName: string;
  providerToolAvailable: boolean;
  providerToolAttached: boolean;
  toolOptions: {
    allowedDomains?: string[];
    excludedDomains?: string[];
    enableImageUnderstanding: false;
  } | null;
  resultCount: number;
  results: BrainSearchTraceResult[];
  savedSourceIds?: string[];
  savedSourceSpanIds?: string[];
}

export interface BrainDocumentClaim {
  id: string;
  kind: string;
  status: ClaimStatus;
  text: string;
  versionId: string;
  createdAt: string;
}

export interface BrainScope {
  userId: string | null;
  workspaceId: string | null;
  projectId: string | null;
  sphereId: string | null;
}

export interface BrainDocumentSummary {
  id: string;
  sessionId: string;
  scope: BrainScope;
  title: string;
  status: string;
  originalIdea: string | null;
  mainClaim: BrainDocumentClaim | null;
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

export type BrainDocumentFileKind = "source" | "claim" | "artifact" | "moves" | string;

export interface BrainDocumentFile {
  id: string;
  sessionId: string;
  kind: BrainDocumentFileKind;
  title: string;
  subtitle: string | null;
}

export interface BrainHierarchyDocument {
  id: string;
  sessionId: string;
  title: string;
  status: string;
  updatedAt: string;
  fileCount: number;
  files: BrainDocumentFile[];
}

export interface BrainHierarchyFolder {
  id: string;
  label: string;
  kind: "project" | "status" | "inbox" | string;
  documentCount: number;
  documents: BrainHierarchyDocument[];
}

export interface BrainHierarchySpace {
  id: string;
  label: string;
  kind: "sphere" | "workspace" | "default" | string;
  documentCount: number;
  folders: BrainHierarchyFolder[];
}

export interface BrainQuickNote {
  id: string;
  sessionId: string;
  text: string;
  meta: string;
  kind: "next_action" | "open_question" | "recent_move" | string;
}

export interface BrainResearchItem {
  id: string;
  sessionId: string;
  kind: "source" | "research_lead" | "positive_example" | "failure_example" | "artifact" | string;
  title: string;
  subtitle: string | null;
}

export interface BrainSidebarData {
  quickNotes: BrainQuickNote[];
  folders: BrainHierarchyFolder[];
  research: BrainResearchItem[];
}

export interface BrainDocumentGraphNode {
  id: string;
  type: "document" | "claim" | "risk" | "concept" | string;
  label: string;
  sessionId: string;
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
  hierarchy: BrainHierarchySpace[];
  sidebar: BrainSidebarData;
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

export type CanvasNodeKind = "claim" | "assumption" | "question" | "concept" | "artifact" | "source" | string;
export type CanvasNodeAction = "learn" | "check" | "verify" | "save" | "related";

export interface CanvasNode {
  id: string;
  kind: CanvasNodeKind;
  title: string;
  summary?: string | null;
  status?: string | null;
  confidence?: number | null;
  x?: number;
  y?: number;
  refs?: {
    claimId?: string | null;
    sourceId?: string | null;
    artifactId?: string | null;
  };
  actions?: CanvasNodeAction[];
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  label?: string | null;
}

export interface SessionCanvasData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  recommendedPath?: string[];
  selectedNodeId?: string;
}

export interface SessionCanvasResponse {
  data: SessionCanvasData;
}

export interface SaveBrainObjectResponse {
  data: {
    object: {
      id: string;
      objectType: string;
      sessionId: string | null;
      title: string;
      summary: string | null;
      status: string | null;
      createdAt: string;
      updatedAt: string;
    };
  };
}

export interface BrainHybridSearchResult {
  id: string;
  title: string;
  summary: string | null;
  kind: string;
  sessionId?: string | null;
  claimId?: string | null;
  score?: number | null;
}

export interface BrainHybridSearchResponse {
  data: {
    available: boolean;
    sourceOfTruth?: "brain_rows_hybrid_retrieval" | string;
    strategy?: "hybrid_lexical_vector" | "lexical" | string;
    results: BrainHybridSearchResult[];
    meta?: {
      query: string;
      resultCount: number;
    };
  };
}

export interface BrainRecentIdea {
  id: string;
  rawIdea: string;
  createdAt: string;
  updatedAt?: string;
}

export interface BrainRecentsResponse {
  data: {
    recents: BrainRecentIdea[];
  };
}

export interface KeepBrainRecentIdeaResponse {
  data: {
    recent: BrainRecentIdea;
    recents?: BrainRecentIdea[];
  };
}

export interface BrainSessionNote {
  sessionId: string;
  content: string;
  updatedAt: string;
}

export interface BrainSessionNoteResponse {
  data: {
    note: BrainSessionNote | null;
  };
}

export interface BrainData {
  ideaMap?: {
    claims?: BrainClaim[];
    edges?: BrainEdge[];
    keyInsight?: string;
  };
  graphPath?: BrainGraphPath;
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

export interface LearnSessionOutput {
  coreIdea: string;
  claims: BrainClaim[];
  assumptions: BrainClaim[];
  questions: BrainClaim[];
  creativePotential: string[];
  autopilotNextMove: AutopilotSuggestion | null;
}

export type BrainVerifyVerdict = "supported" | "weakened" | "mixed" | "not_enough_evidence";
export type BrainVerifyEvidenceStance = "supports" | "weakens" | "mixed" | "unclear";

export interface BrainVerifyEvidenceCard {
  title: string;
  summary: string;
  stance: BrainVerifyEvidenceStance;
  sourceName?: string | null;
  sourceUrl?: string | null;
  citation?: string | null;
}

export interface BrainVerifyCitation {
  title: string;
  sourceName?: string | null;
  sourceUrl?: string | null;
  citation?: string | null;
}

export interface BrainVerifyUnsupportedPart {
  part: string;
  reason: string;
  neededEvidence?: string | null;
}

export interface BrainVerifyRecipeStep {
  step: string;
  title: string;
  status: "completed" | "limited" | "skipped";
  summary: string;
  inputs: string[];
  outputs: string[];
}

export interface BrainVerifyCitationSource {
  evidenceTitle: string;
  source: {
    id: string;
    kind: "verification_citation";
    rawText: string;
  };
  sourceSpan: {
    id: string;
    sourceId: string;
    claimId: string | null;
    claimVersionId: string | null;
    label: string | null;
  };
}

export interface BrainVerifyMove {
  id: string;
  kind: "verify_run" | "confidence_update_accepted" | "confidence_update_rejected" | string;
  summary: string;
  claimIds: string[];
  edgeIds: string[];
  artifactIds: string[];
}

export interface BrainVerifyTargetClaim {
  id: string;
  versionId: string;
  kind: string;
  status: ClaimStatus;
  text: string;
  confidence: number;
}

export interface BrainVerifyConfidenceUpdate {
  suggestedDelta: number;
  autoApplied?: false;
  decision?: "pending_user_decision";
}

export interface BrainVerifyResult {
  verdict: BrainVerifyVerdict;
  summary: string;
  evidenceCards: BrainVerifyEvidenceCard[];
  citations: BrainVerifyCitation[];
  unsupportedParts: BrainVerifyUnsupportedPart[];
  confidenceDeltaSuggestion: number;
  whatWouldChangeThis: string;
  nextQuestion: string;
  recipe: {
    steps: BrainVerifyRecipeStep[];
  };
  targetClaim: BrainVerifyTargetClaim;
  move: BrainVerifyMove;
  brainRun: {
    id: string;
    status: string;
  };
  citationSources: BrainVerifyCitationSource[];
  searchTrace?: BrainSearchTrace | null;
  confidenceUpdate: BrainVerifyConfidenceUpdate;
}

export interface BrainVerifyResponse {
  data: BrainVerifyResult;
}

export interface BrainVerifyConfidenceCascade {
  claimId: string;
  viaEdgeId: string;
  depth: number;
  previousVersionId: string;
  currentVersionId: string;
  previousConfidence: number;
  currentConfidence: number;
  appliedDelta: number;
}

export interface BrainVerifyConfidenceDecisionResponse {
  data: {
    decision: "accept" | "reject";
    targetClaim: BrainVerifyTargetClaim;
    move: BrainVerifyMove;
    confidenceUpdate: {
      verifyMoveId: string;
      suggestedDelta: number;
      accepted: boolean;
      previousConfidence: number;
      currentConfidence: number;
      appliedDelta: number;
      cascade: BrainVerifyConfidenceCascade[];
    };
  };
}

export interface BrainMove {
  id: string;
  type?: string;
  kind?: string;
  actor?: string;
  summary: string;
  createdAt?: string;
}

export interface ClaimDetailClaim extends BrainClaim {
  scope?: BrainScope;
  versionId?: string;
  sessionId?: string;
  sourceId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ClaimDetailVersion {
  id: string;
  claimId: string;
  sourceId: string | null;
  brainRunId: string | null;
  moveId: string | null;
  content: string;
  status: ClaimStatus;
  confidence: number;
  state: "current" | "old" | string;
  isCurrent: boolean;
  validFrom: string;
  validUntil: string | null;
  supersededByVersionId: string | null;
  createdAt: string;
}

export interface ClaimDetailEdge {
  id: string;
  fromClaimId: string;
  toClaimId: string;
  kind: string;
  status: string;
  label: string | null;
  createdAt: string;
}

export interface ClaimDetailMove extends BrainMove {
  kind: string;
  claimIds: string[];
  edgeIds: string[];
  artifactIds: string[];
  payload?: Record<string, unknown>;
  createdAt: string;
}

export interface ClaimDetailSource {
  id: string;
  sessionId: string;
  kind: string;
  rawText: string;
  createdAt: string;
}

export interface ClaimDetailSourceSpan {
  id: string;
  sourceId: string;
  claimId: string | null;
  claimVersionId: string | null;
  startOffset: number;
  endOffset: number;
  label: string | null;
  text: string;
  createdAt: string;
}

export interface ClaimDetailArtifactReference {
  id: string;
  kind: string;
  title: string;
  summary: string;
  referenceReasons: string[];
  createdAt: string;
}

export interface ClaimDetailConnection {
  edge: ClaimDetailEdge;
  direction: "incoming" | "outgoing";
  claim: ClaimDetailClaim;
}

export interface ClaimDetailActiveChallenge {
  edge: ClaimDetailEdge;
  targetClaim: ClaimDetailClaim | null;
  critiqueClaim: ClaimDetailClaim | null;
  responseState: string;
  moves: ClaimDetailMove[];
}

export interface ClaimDetailLearnedConcept {
  edge: ClaimDetailEdge;
  conceptClaim: ClaimDetailClaim;
  attachedClaim: ClaimDetailClaim;
}

export interface ClaimDetailData {
  claim: ClaimDetailClaim;
  currentVersion: ClaimDetailVersion;
  oldVersions: ClaimDetailVersion[];
  versions: ClaimDetailVersion[];
  confidenceHistory: Array<{
    versionId: string;
    confidence: number;
    status: ClaimStatus;
    state: string;
    validFrom: string;
    validUntil: string | null;
    supersededByVersionId: string | null;
    createdAt: string;
  }>;
  moves: ClaimDetailMove[];
  provenance: {
    source: ClaimDetailSource | null;
    sources: ClaimDetailSource[];
    spans: ClaimDetailSourceSpan[];
  };
  artifactReferences: ClaimDetailArtifactReference[];
  connectedClaims: ClaimDetailConnection[];
  activeChallenges: ClaimDetailActiveChallenge[];
  learnedConcepts: ClaimDetailLearnedConcept[];
}

export interface ClaimDetailResponse {
  data: ClaimDetailData;
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
  graphPath: BrainGraphPath;
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
